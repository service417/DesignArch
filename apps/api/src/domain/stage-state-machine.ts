/**
 * The stage state machine — the single place where the stage lifecycle rules live.
 *
 * The architecture blueprint calls for transitions to be "impossible by
 * construction rather than by convention". That is what this module provides:
 * a declarative transition table plus guards, evaluated server-side on every
 * state change. Business rules BR-3, BR-5 and BR-6 are enforced here and nowhere
 * else, so there is exactly one place to read, test, and change them.
 *
 * The module is pure: no I/O, no framework, no clock. Callers load a snapshot,
 * ask whether a move is legal, and persist the result inside a transaction.
 */

import {
  Actor,
  ROLE_FOR_STAGE_TYPE,
  Role,
  StageAction,
  StageErrorCode,
  StageSnapshot,
  StageStatus,
  TransitionRequest,
  TransitionResult,
} from './stage.types';
import { parseMinorUnits } from './money';

/** Who may attempt an action, and what it moves the stage to. */
interface TransitionRule {
  from: readonly StageStatus[];
  to: StageStatus;
  /** Roles permitted to attempt this action at all. */
  allowedRoles: readonly Role[];
  /**
   * When true, the actor must be the worker currently assigned to the stage —
   * not merely a user holding the right role (BR-6.2).
   */
  requiresAssignee?: boolean;
}

/**
 * The complete transition table. Any (status, action) pair absent from this
 * table is rejected as an illegal transition.
 *
 * The shape of the money path is the point: APPROVE is the only route into
 * pricing, and only the assigned worker can leave PRICE_PROPOSED. Together with
 * the role split (Admin prices, Supervisor inspects, Worker accepts) this gives
 * the three-way separation of duties the business asked for — no single role can
 * invent, approve and be paid for work alone.
 */
const TRANSITIONS: Readonly<Record<StageAction, TransitionRule>> = {
  // --- taking the job on (the assigned worker) -----------------------------
  /**
   * Accepting and declining leave the status at ASSIGNED. A worker deciding
   * whether to take a job is not a stage of the work, so it does not need one of
   * the nine states — acceptance is recorded as a timestamp, and a decline
   * clears the assignee so the row returns to the Admin's reassignment queue.
   *
   * Crucially, a decline affects only this assignment. Other workers on the same
   * job card carry on untouched, which is the whole point of parallel assignment.
   */
  ACCEPT_ASSIGNMENT: {
    from: ['ASSIGNED'],
    to: 'ASSIGNED',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },
  DECLINE_ASSIGNMENT: {
    from: ['ASSIGNED'],
    to: 'ASSIGNED',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },

  // --- execution (the assigned worker) -------------------------------------
  START_WORK: {
    from: ['ASSIGNED'],
    to: 'IN_PROGRESS',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },
  MARK_READY: {
    from: ['IN_PROGRESS'],
    to: 'READY_FOR_INSPECTION',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },
  /** Rework: a rejected stage returns to the same worker, never a new stage (BR-5.2). */
  RESUME_REWORK: {
    from: ['REJECTED'],
    to: 'IN_PROGRESS',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },

  // --- inspection (the Supervisor, never the worker) -----------------------
  APPROVE: {
    from: ['READY_FOR_INSPECTION'],
    to: 'APPROVED',
    allowedRoles: ['SUPERVISOR'],
  },
  REJECT: {
    from: ['READY_FOR_INSPECTION'],
    to: 'REJECTED',
    allowedRoles: ['SUPERVISOR'],
  },

  // --- pricing (the Admin proposes; only the worker disposes) --------------
  PROPOSE_PRICE: {
    from: ['APPROVED'],
    to: 'PRICE_PROPOSED',
    allowedRoles: ['ADMIN'],
  },
  REVISE_PRICE: {
    from: ['PRICE_DECLINED'],
    to: 'PRICE_PROPOSED',
    allowedRoles: ['ADMIN'],
  },
  ACCEPT_PRICE: {
    from: ['PRICE_PROPOSED'],
    to: 'PRICE_ACCEPTED',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },
  DECLINE_PRICE: {
    from: ['PRICE_PROPOSED'],
    to: 'PRICE_DECLINED',
    allowedRoles: ['CARPENTER', 'PAINTER'],
    requiresAssignee: true,
  },

  /**
   * A Supervisor's on-site confirmation that the work genuinely changed scope,
   * recorded between a decline and the Admin's revised price.
   *
   * It leaves the status at PRICE_DECLINED on purpose. The supervisor attests to
   * facts — the client moved the goalposts, the extra work is real — and does not
   * move the stage forward or name a figure. The Admin still sets the number and
   * the worker still has to accept it, so the three-way separation of duties
   * survives a scope change intact: a supervisor cannot price work, and a worker
   * cannot get a rise without an Admin agreeing to it.
   */
  CONFIRM_SCOPE_CHANGE: {
    from: ['PRICE_DECLINED'],
    to: 'PRICE_DECLINED',
    allowedRoles: ['SUPERVISOR'],
  },

  /**
   * Completion is a system move, not a user one: accepting a price completes the
   * stage and creates the earning in the same transaction. It is modelled as a
   * distinct transition so the ledger records acceptance and completion as the
   * separate facts they are.
   */
  COMPLETE: {
    from: ['PRICE_ACCEPTED'],
    to: 'COMPLETED',
    allowedRoles: ['ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR'],
  },
};

/** Actions that put a price on the table and therefore need a valid amount. */
const AMOUNT_REQUIRED: readonly StageAction[] = ['PROPOSE_PRICE', 'REVISE_PRICE'];

/**
 * Actions a worker cannot take until they have accepted the assignment.
 *
 * Only the worker's own moves are gated. Inspection and pricing are not, because
 * by the time a stage reaches them the work has been done — refusing to let a
 * supervisor inspect finished work over a missing acknowledgement would punish
 * the wrong person.
 */
const ASSIGNMENT_MUST_BE_ACCEPTED: readonly StageAction[] = [
  'START_WORK',
  'MARK_READY',
  'RESUME_REWORK',
];

/**
 * Decide whether a stage transition is permitted.
 *
 * Guards are evaluated in order of specificity — transition legality, then
 * authorisation, then payload validity — so the caller receives the most
 * informative failure rather than the first one encountered by accident.
 */
export function evaluateTransition(request: TransitionRequest): TransitionResult {
  const { stage, actor, action, payload, siblingCarpentryStatus } = request;
  const rule = TRANSITIONS[action];

  if (!rule) {
    return fail('ILLEGAL_TRANSITION', `Unknown action '${action}'.`);
  }

  // 1. Is this move legal from the current state?
  if (!rule.from.includes(stage.status)) {
    return fail(
      // A pricing attempt on an unapproved stage is the specific error the API
      // contract names (409 STAGE_NOT_APPROVED), so report it as such.
      action === 'PROPOSE_PRICE' ? 'STAGE_NOT_APPROVED' : 'ILLEGAL_TRANSITION',
      `A stage in status '${stage.status}' cannot be moved by '${action}'. ` +
        `This action is only valid from: ${rule.from.join(', ')}.`,
    );
  }

  // 2. Optimistic locking — reject writes based on a stale read (Blueprint §2.2).
  if (
    payload?.expectedVersion !== undefined &&
    payload.expectedVersion !== stage.version
  ) {
    return fail(
      'VERSION_CONFLICT',
      `This stage was changed by someone else (expected version ` +
        `${payload.expectedVersion}, current ${stage.version}). Reload and try again.`,
    );
  }

  // 3. Authorisation: role first, then ownership.
  if (!rule.allowedRoles.includes(actor.role)) {
    return fail(
      'FORBIDDEN',
      `Role '${actor.role}' may not perform '${action}'. ` +
        `Permitted roles: ${rule.allowedRoles.join(', ')}.`,
    );
  }

  if (rule.requiresAssignee) {
    if (stage.assigneeId === null) {
      return fail('NOT_ASSIGNEE', 'This stage has no assigned worker.');
    }
    if (stage.assigneeId !== actor.id) {
      return fail(
        'NOT_ASSIGNEE',
        `Only the worker assigned to this stage may perform '${action}'.`,
      );
    }
    // A carpenter must not act on a painting stage even if wrongly assigned.
    const requiredRole = ROLE_FOR_STAGE_TYPE[stage.type];
    if (actor.role !== requiredRole) {
      return fail(
        'FORBIDDEN',
        `A ${stage.type} stage requires role '${requiredRole}', not '${actor.role}'.`,
      );
    }
  }

  // 4. The assignment must have been taken on before any work happens.
  //    A job nobody has agreed to is offered, not in progress — and a worker who
  //    declined must not be able to carry on with it.
  if (ASSIGNMENT_MUST_BE_ACCEPTED.includes(action) && stage.assignmentAccepted === false) {
    return fail(
      'ASSIGNMENT_NOT_ACCEPTED',
      'Accept this job before starting work on it.',
    );
  }

  if (action === 'ACCEPT_ASSIGNMENT' && stage.assignmentAccepted === true) {
    return fail('ASSIGNMENT_ALREADY_SETTLED', 'You have already accepted this job.');
  }

  // 5. The sequence gate: painting cannot begin until carpentry is approved
  //    on the same job card (BR-3.2). Checked when the painting stage first
  //    leaves ASSIGNED, which is the moment work would actually start.
  //
  //    With parallel assignment a card can carry several carpentry assignments,
  //    so the caller passes the *least advanced* of them: painting waits for all
  //    the carpentry to pass inspection, not merely the first piece of it.
  if (stage.type === 'PAINTING' && action === 'START_WORK') {
    const gate = evaluateSequenceGate(siblingCarpentryStatus);
    if (!gate.ok) return gate;
  }

  // 6. Evidence and payload rules.
  if (action === 'CONFIRM_SCOPE_CHANGE' && !hasText(payload?.reason)) {
    return fail(
      'REASON_REQUIRED',
      'A scope confirmation must say what changed — it is the evidence behind a revised price.',
    );
  }

  if (action === 'DECLINE_ASSIGNMENT' && !hasText(payload?.reason)) {
    return fail(
      'REASON_REQUIRED',
      'Say why you are turning this job down, so it can be reassigned sensibly.',
    );
  }

  if (action === 'APPROVE' && stage.photoCount < 1) {
    return fail(
      'PHOTO_REQUIRED',
      'At least one inspection photograph is required before a stage can be approved (FR-5.6).',
    );
  }

  if (action === 'REJECT' && !hasText(payload?.reason)) {
    return fail(
      'REASON_REQUIRED',
      'A rejection must state a reason so the worker knows what to correct (FR-5.5).',
    );
  }

  if (AMOUNT_REQUIRED.includes(action)) {
    if (payload?.amount === undefined) {
      return fail('INVALID_AMOUNT', `Action '${action}' requires an amount.`);
    }
    const money = parseMinorUnits(payload.amount);
    if (!money.ok) {
      return fail('INVALID_AMOUNT', money.message);
    }
  }

  return { ok: true, nextStatus: rule.to };
}

/**
 * The painting sequence gate. Extracted so the assignment service can ask the
 * same question ("may painting start yet?") without attempting a transition.
 */
export function evaluateSequenceGate(
  siblingCarpentryStatus: StageStatus | null | undefined,
): TransitionResult {
  if (siblingCarpentryStatus === null || siblingCarpentryStatus === undefined) {
    return fail(
      'SEQUENCE_GATE_LOCKED',
      'The carpentry stage for this job card could not be found, so painting cannot start.',
    );
  }

  // Carpentry counts as done once a supervisor has approved it. Everything from
  // APPROVED onward (pricing, completion) satisfies the gate — the physical work
  // is finished and inspected; only the commercial steps remain.
  const carpentryDone: readonly StageStatus[] = [
    'APPROVED',
    'PRICE_PROPOSED',
    'PRICE_DECLINED',
    'PRICE_ACCEPTED',
    'COMPLETED',
  ];

  if (!carpentryDone.includes(siblingCarpentryStatus)) {
    return fail(
      'SEQUENCE_GATE_LOCKED',
      `Painting cannot start until the carpentry stage is approved. ` +
        `Carpentry is currently '${siblingCarpentryStatus}' (BR-3.2).`,
    );
  }

  return { ok: true, nextStatus: 'IN_PROGRESS' };
}

/** Every action currently available to this actor on this stage. Drives the UI. */
export function availableActions(
  stage: StageSnapshot,
  actor: Actor,
  siblingCarpentryStatus?: StageStatus | null,
): StageAction[] {
  return (Object.keys(TRANSITIONS) as StageAction[]).filter((action) => {
    const result = evaluateTransition({
      stage,
      actor,
      action,
      siblingCarpentryStatus,
      // Supply placeholder payloads so payload-shape rules do not mask the
      // question being asked here, which is "is this move open to you?".
      payload: probePayloadFor(action),
    });
    return result.ok;
  });
}

/** Is this stage in a state where the Admin owes someone an action? */
export function awaitsAdminAction(status: StageStatus): boolean {
  return status === 'APPROVED' || status === 'PRICE_DECLINED';
}

// ------------------------------------------------------------------ helpers

function probePayloadFor(action: StageAction) {
  if (AMOUNT_REQUIRED.includes(action)) return { amount: 1n };
  if (action === 'REJECT') return { reason: 'probe' };
  return undefined;
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(code: StageErrorCode, message: string): TransitionResult {
  return { ok: false, code, message };
}
