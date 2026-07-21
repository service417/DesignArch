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

  // 4. The sequence gate: painting cannot begin until carpentry is approved
  //    on the same job card (BR-3.2). Checked when the painting stage first
  //    leaves ASSIGNED, which is the moment work would actually start.
  if (stage.type === 'PAINTING' && action === 'START_WORK') {
    const gate = evaluateSequenceGate(siblingCarpentryStatus);
    if (!gate.ok) return gate;
  }

  // 5. Evidence and payload rules.
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
