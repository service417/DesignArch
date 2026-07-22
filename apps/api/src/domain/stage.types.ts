/**
 * Domain types for the stage lifecycle.
 *
 * These are deliberately independent of Prisma and of NestJS: the state machine
 * is pure, synchronous logic that can be exhaustively unit-tested without a
 * database, a transport, or a container. Persistence maps onto these types at
 * the service boundary.
 */

export type Role = 'ADMIN' | 'CARPENTER' | 'PAINTER' | 'SUPERVISOR';

export type StageType = 'CARPENTRY' | 'PAINTING';

/** The nine states of the stage lifecycle (SRS FR-3.5). */
export type StageStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_FOR_INSPECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PRICE_PROPOSED'
  | 'PRICE_DECLINED'
  | 'PRICE_ACCEPTED'
  | 'COMPLETED';

/**
 * The four kinds of entry in the append-only pricing ledger. Mirrors the
 * PricingAction enum in schema.prisma, restated here so the domain layer stays
 * independent of the generated Prisma client.
 */
export type PricingAction =
  | 'PROPOSED'
  | 'REVISED'
  | 'ACCEPTED'
  | 'DECLINED'
  /** A Supervisor's on-site confirmation that the work genuinely changed scope. */
  | 'SCOPE_CONFIRMED';

/** Every way a stage is allowed to move. Anything not listed cannot happen. */
export type StageAction =
  | 'ACCEPT_ASSIGNMENT'
  | 'DECLINE_ASSIGNMENT'
  | 'START_WORK'
  | 'MARK_READY'
  | 'APPROVE'
  | 'REJECT'
  | 'RESUME_REWORK'
  | 'PROPOSE_PRICE'
  | 'REVISE_PRICE'
  | 'ACCEPT_PRICE'
  | 'DECLINE_PRICE'
  | 'CONFIRM_SCOPE_CHANGE'
  | 'COMPLETE';

/**
 * Machine-readable failure codes. These map onto the HTTP responses defined in
 * the architecture blueprint (Phase 7.3) so the API surface and the domain
 * speak the same language.
 */
export type StageErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'FORBIDDEN'
  | 'NOT_ASSIGNEE'
  | 'SEQUENCE_GATE_LOCKED'
  | 'PHOTO_REQUIRED'
  | 'REASON_REQUIRED'
  | 'INVALID_AMOUNT'
  | 'VERSION_CONFLICT'
  | 'STAGE_NOT_APPROVED'
  | 'ASSIGNMENT_NOT_ACCEPTED'
  | 'ASSIGNMENT_ALREADY_SETTLED';

/** One worker's assignment, as the state machine needs to see it. */
export interface StageSnapshot {
  id: string;
  type: StageType;
  status: StageStatus;
  assigneeId: string | null;
  version: number;
  /** Count of inspection photos already stored against this stage. */
  photoCount: number;
  /**
   * Whether the worker has taken the job on. Work cannot start before this: a
   * job nobody has agreed to is offered, not in progress.
   */
  assignmentAccepted?: boolean;
}

export interface Actor {
  id: string;
  role: Role;
}

export interface TransitionPayload {
  /** Price in integer minor units (LKR cents). Required for pricing actions. */
  amount?: bigint | number;
  /** Mandatory for REJECT; optional for DECLINE_PRICE. */
  reason?: string;
  /** Client-supplied optimistic-lock version. Omit to skip the check. */
  expectedVersion?: number;
}

export interface TransitionRequest {
  stage: StageSnapshot;
  actor: Actor;
  action: StageAction;
  payload?: TransitionPayload;
  /**
   * Status of the sibling CARPENTRY stage on the same job card. Required to
   * evaluate the painting sequence gate (BR-3.2); null when there is none.
   */
  siblingCarpentryStatus?: StageStatus | null;
}

export type TransitionResult =
  | { ok: true; nextStatus: StageStatus }
  | { ok: false; code: StageErrorCode; message: string };

/** Roles that perform work on a stage (as opposed to managing or inspecting it). */
export const WORKER_ROLES: readonly Role[] = ['CARPENTER', 'PAINTER'] as const;

/** The role required to execute a given stage type (BR-4.1). */
export const ROLE_FOR_STAGE_TYPE: Record<StageType, Role> = {
  CARPENTRY: 'CARPENTER',
  PAINTING: 'PAINTER',
};

/** Terminal states — no further transition is possible. */
export const TERMINAL_STATUSES: readonly StageStatus[] = ['COMPLETED'] as const;
