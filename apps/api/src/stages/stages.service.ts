import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PricingAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { evaluateTransition } from '../domain/stage-state-machine';
import { projectLedger } from '../domain/pricing-ledger';
import { parseMinorUnits } from '../domain/money';
import { STORAGE_PROVIDER, StorageProvider } from '../storage/storage.types';
import {
  Actor,
  StageAction,
  StageErrorCode,
  StageSnapshot,
  StageStatus,
  TransitionPayload,
} from '../domain/stage.types';

/** Long enough for an admin to review a stage without the images going stale. */
const PHOTO_URL_TTL_SECONDS = 900;

/**
 * How far through the lifecycle each status sits.
 *
 * Needed because the statuses are compared for progress, and their alphabetical
 * order is not their lifecycle order — 'APPROVED' < 'IN_PROGRESS' as strings,
 * which is exactly backwards. REJECTED sits alongside IN_PROGRESS: the work is
 * back with the worker, not finished.
 */
const LIFECYCLE_ORDER: Record<StageStatus, number> = {
  ASSIGNED: 0,
  IN_PROGRESS: 1,
  REJECTED: 1,
  READY_FOR_INSPECTION: 2,
  APPROVED: 3,
  PRICE_PROPOSED: 4,
  PRICE_DECLINED: 4,
  PRICE_ACCEPTED: 5,
  COMPLETED: 6,
};

/**
 * What a stage looks like in a list.
 *
 * Carries the current proposed price, because the worker's whole decision on
 * their queue screen is "do I accept this?" — making them open each stage to
 * find out would be a round trip per row on a workshop connection.
 */
const STAGE_LIST_VIEW = {
  id: true,
  type: true,
  status: true,
  version: true,
  updatedAt: true,
  acceptedPrice: true,
  rejectionReason: true,
  assignee: { select: { id: true, name: true, role: true } },
  jobCard: {
    select: {
      id: true,
      title: true,
      description: true,
      project: { select: { id: true, name: true, client: true } },
    },
  },
  _count: { select: { photos: true } },
  // The amount currently on the table. `acceptedPrice` is null until *after*
  // acceptance, so on its own it cannot answer the only question a worker has
  // on this screen.
  pricingHistory: {
    where: { action: { in: ['PROPOSED', 'REVISED'] } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { value: true, createdAt: true },
  },
} satisfies Prisma.StageSelect;

type StageListRow = Prisma.StageGetPayload<{ select: typeof STAGE_LIST_VIEW }>;

/** Flatten the one-row pricing history into a plain `proposedPrice`. */
function withProposal({ pricingHistory, ...stage }: StageListRow) {
  return { ...stage, proposedPrice: pricingHistory[0]?.value ?? null };
}

/** Which stage actions are pricing events, and how they appear in the ledger. */
const LEDGER_ACTION: Partial<Record<StageAction, PricingAction>> = {
  PROPOSE_PRICE: 'PROPOSED',
  REVISE_PRICE: 'REVISED',
  ACCEPT_PRICE: 'ACCEPTED',
  DECLINE_PRICE: 'DECLINED',
  // A scope confirmation belongs in the ledger, not the audit log alone: it is
  // the recorded justification a revised price rests on, and the ledger is the
  // append-only record anyone later reconstructs the negotiation from.
  CONFIRM_SCOPE_CHANGE: 'SCOPE_CONFIRMED',
};

/**
 * Stage workflow service — the only writer of stage state.
 *
 * Every state change follows the same shape: load a snapshot, ask the state
 * machine, then persist inside a transaction that also appends the ledger,
 * creates the earning, writes the audit row and enqueues notifications. Doing
 * all of it in one transaction is the whole reason the architecture chose a
 * monolith: the money path commits or it does not happen.
 */
@Injectable()
export class StagesService {
  private readonly logger = new Logger(StagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Apply an action to a stage.
   *
   * `expectedVersion` implements the optimistic lock: the UPDATE is conditional
   * on the version the caller read, so two admins pricing simultaneously cannot
   * both win.
   */
  async transition(
    stageId: string,
    actor: Actor,
    action: StageAction,
    payload: TransitionPayload = {},
    ip?: string,
  ): Promise<{ id: string; status: StageStatus; version: number }> {
    return this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.findUnique({
        where: { id: stageId },
        include: { _count: { select: { photos: true } } },
      });

      if (!stage) {
        throw new NotFoundException(`Stage ${stageId} was not found.`);
      }

      const snapshot: StageSnapshot = {
        id: stage.id,
        type: stage.type,
        status: stage.status,
        assigneeId: stage.assigneeId,
        version: stage.version,
        photoCount: stage._count.photos,
        assignmentAccepted: stage.assignmentAcceptedAt !== null,
      };

      // The painting sequence gate needs the carpentry work on the same card.
      //
      // A card can now carry several carpentry assignments at once, so the gate
      // is evaluated against the *least advanced* of them: painting waits for all
      // the carpentry to pass inspection, not merely whichever piece finished
      // first. Taking findFirst here would have let painting start while a second
      // carpenter was still cutting.
      const siblingCarpentryStatus =
        stage.type === 'PAINTING'
          ? await this.leastAdvancedCarpentryStatus(tx, stage.jobCardId)
          : undefined;

      const decision = evaluateTransition({
        stage: snapshot,
        actor,
        action,
        payload,
        siblingCarpentryStatus,
      });

      if (!decision.ok) {
        await this.audit.recordIn(tx, {
          actorId: actor.id,
          action: `STAGE_${action}_DENIED`,
          entity: 'stage',
          entityId: stageId,
          meta: { code: decision.code, reason: decision.message, from: stage.status },
          ip,
        });
        throw this.toHttpError(decision.code, decision.message);
      }

      const nextStatus = decision.nextStatus;

      // An acceptance must carry the agreed amount onto the stage in the *same*
      // statement that sets the status: the CHECK constraint requires
      // accepted_price to be non-null whenever the status is PRICE_ACCEPTED, and
      // Postgres evaluates CHECKs per statement, not at commit. So resolve the
      // amount on the table before writing anything.
      const agreedPrice =
        action === 'ACCEPT_PRICE' ? await this.currentProposal(tx, stageId) : null;

      // Conditional update on the version we read — this is the lock. Every
      // column the new status requires is written here, atomically with it.
      const updated = await tx.stage.updateMany({
        where: { id: stageId, version: stage.version },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(agreedPrice !== null ? { acceptedPrice: agreedPrice } : {}),
          ...(action === 'APPROVE' ? { approvedAt: new Date() } : {}),
          // Likewise, a REJECTED row must already carry its reason.
          ...(action === 'REJECT' ? { rejectionReason: payload.reason!.trim() } : {}),
          // Clear a stale reason once the stage is back in progress.
          ...(action === 'RESUME_REWORK' ? { rejectionReason: null } : {}),

          ...(action === 'ACCEPT_ASSIGNMENT' ? { assignmentAcceptedAt: new Date() } : {}),

          // Declining hands the job back: the assignee is cleared in the same
          // statement, so the row lands in the Admin's reassignment queue and the
          // worker who refused is no longer named on it. Every other assignment
          // on this job card is untouched.
          ...(action === 'DECLINE_ASSIGNMENT'
            ? {
                assigneeId: null,
                assignmentAcceptedAt: null,
                assignmentDeclinedAt: new Date(),
                assignmentDeclineReason: payload.reason!.trim(),
              }
            : {}),
        },
      });

      if (updated.count === 0) {
        throw new ConflictException(
          'This stage was changed by someone else while you were working. Reload and try again.',
        );
      }

      await this.appendLedger(tx, stageId, actor, action, payload, agreedPrice);

      // Acceptance settles the stage and creates the worker's earning in this
      // same transaction — an earning can never exist without its accepted price.
      if (action === 'ACCEPT_PRICE') {
        await this.settle(tx, stageId);
      }

      await this.audit.recordIn(tx, {
        actorId: actor.id,
        action: `STAGE_${action}`,
        entity: 'stage',
        entityId: stageId,
        meta: {
          from: stage.status,
          to: nextStatus,
          ...(payload.amount !== undefined ? { amount: String(payload.amount) } : {}),
        },
        ip,
      });

      await this.notifications.enqueueForTransition(tx, {
        stageId,
        action,
        actorId: actor.id,
        assigneeId: stage.assigneeId,
      });

      // Read the version back rather than assuming +1: settling an acceptance
      // writes a second time (PRICE_ACCEPTED then COMPLETED), so the caller
      // would otherwise be handed a version that is already stale.
      const settled = await tx.stage.findUniqueOrThrow({
        where: { id: stageId },
        select: { status: true, version: true },
      });

      return { id: stageId, status: settled.status, version: settled.version };
    });
  }

  /**
   * The Admin's action queue (FR-9.1): stages approved and awaiting a price, and
   * stages whose price was declined and awaits revision.
   *
   * This is the pinned daily entry point for an admin, and the partial index
   * `stage_awaiting_admin_action` exists specifically to serve it.
   */
  async awaitingAdminAction() {
    const stages = await this.prisma.stage.findMany({
      where: { status: { in: ['APPROVED', 'PRICE_DECLINED'] } },
      // Oldest first: the queue is work to clear, so the stage that has waited
      // longest is the one that needs attention, not the newest arrival.
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        updatedAt: true,
        approvedAt: true,
        assignee: { select: { id: true, name: true, role: true } },
        jobCard: {
          select: {
            id: true,
            title: true,
            project: { select: { id: true, name: true, client: true } },
          },
        },
        _count: { select: { photos: true } },
        // The last price on the table, so the admin can see what was declined
        // without opening the stage.
        pricingHistory: {
          where: { action: { in: ['PROPOSED', 'REVISED', 'DECLINED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { action: true, value: true, reason: true, createdAt: true },
        },
      },
    });

    return stages.map(({ pricingHistory, ...stage }) => ({
      ...stage,
      lastPricingEvent: pricingHistory[0] ?? null,
    }));
  }

  /**
   * The worker's own queue: every stage assigned to them (FR-3.6).
   *
   * Scoped from the token, never from a parameter — a worker must not be able to
   * read someone else's workload, which would expose what they are being paid
   * for. Ordered by the stage's own progress so today's job is at the top.
   */
  async assignedTo(workerId: string, includeCompleted = false) {
    const stages = await this.prisma.stage.findMany({
      where: {
        assigneeId: workerId,
        ...(includeCompleted ? {} : { status: { not: 'COMPLETED' } }),
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      select: STAGE_LIST_VIEW,
    });
    return stages.map(withProposal);
  }

  /**
   * The supervisor's inspection queue (FR-5.1).
   *
   * Every supervisor sees every stage awaiting inspection — the multi-supervisor
   * decision (C1) means work is not tied to one inspector, so whoever is on site
   * can inspect it. Oldest first: this is a queue to clear.
   */
  async awaitingInspection() {
    const stages = await this.prisma.stage.findMany({
      where: { status: 'READY_FOR_INSPECTION' },
      orderBy: { updatedAt: 'asc' },
      select: STAGE_LIST_VIEW,
    });
    return stages.map(withProposal);
  }

  /** Full stage detail: the work, its evidence, and its complete price history. */
  async findOne(id: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        sequenceNo: true,
        acceptedPrice: true,
        rejectionReason: true,
        approvedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, role: true } },
        jobCard: {
          select: {
            id: true,
            title: true,
            description: true,
            project: { select: { id: true, name: true, client: true } },
          },
        },
        earning: { select: { id: true, amount: true, status: true, paidAt: true } },
        photos: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fileRef: true,
            createdAt: true,
            supervisor: { select: { id: true, name: true } },
          },
        },
        pricingHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            action: true,
            value: true,
            reason: true,
            createdAt: true,
            actor: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!stage) throw new NotFoundException(`Stage ${id} was not found.`);

    // The amount currently on the table, derived by replaying the ledger rather
    // than stored — `projectLedger` is the same tested function the domain uses,
    // so detail and list cannot disagree about what is being offered.
    //
    // The list endpoints carry this too. Without it here, a client that opened a
    // stage could show a price on the card and nothing on the screen that asks
    // the worker to accept it — which is exactly the wrong place to be vague.
    const { currentProposal } = projectLedger(
      stage.pricingHistory.map((entry) => ({
        action: entry.action,
        value: entry.value,
        actorId: entry.actor?.id ?? '',
        createdAt: entry.createdAt,
        reason: entry.reason,
      })),
    );

    // A raw file_ref is useless to a client. Hand back short-lived signed URLs
    // instead, so evidence renders in an <img> without exposing the object key.
    return {
      ...stage,
      proposedPrice: currentProposal,
      photos: stage.photos.map(({ fileRef, ...photo }) => ({
        ...photo,
        url: this.storage.signedUrl(fileRef, PHOTO_URL_TTL_SECONDS),
      })),
    };
  }

  /**
   * Settle an accepted stage: mark it COMPLETED and create the earning.
   *
   * The earning amount is read back from the stage rather than taken from the
   * request, so the recorded pay always equals the price that was actually
   * accepted. The database trigger in constraints.sql enforces the same rule
   * independently.
   */
  private async settle(tx: Prisma.TransactionClient, stageId: string): Promise<void> {
    const stage = await tx.stage.findUniqueOrThrow({
      where: { id: stageId },
      select: { acceptedPrice: true, assigneeId: true },
    });

    if (stage.acceptedPrice === null || stage.assigneeId === null) {
      // Should be unreachable: ACCEPT_PRICE sets both. Fail loudly rather than
      // writing a malformed earning.
      throw new ConflictException(
        'Cannot settle a stage without both an accepted price and an assignee.',
      );
    }

    await tx.stage.update({
      where: { id: stageId },
      data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
    });

    await tx.earning.create({
      data: {
        stageId,
        workerId: stage.assigneeId,
        amount: stage.acceptedPrice,
        status: 'UNPAID',
      },
    });

    this.logger.log(
      `Stage ${stageId} completed; earning created for worker ${stage.assigneeId}`,
    );
  }

  /**
   * The status of the *least advanced* carpentry assignment on a job card.
   *
   * With parallel assignment a card can carry several carpenters at once, so the
   * painting gate has to wait for the slowest of them. Ordering by the lifecycle
   * position rather than by the enum's alphabet, because 'APPROVED' sorts before
   * 'IN_PROGRESS' alphabetically and that would let painting start while
   * carpentry was still underway.
   *
   * Returns null when the card has no carpentry at all, which the gate treats as
   * nothing to wait for.
   */
  private async leastAdvancedCarpentryStatus(
    tx: Prisma.TransactionClient,
    jobCardId: string,
  ): Promise<StageStatus | null> {
    const carpentry = await tx.stage.findMany({
      where: { jobCardId, type: 'CARPENTRY' },
      select: { status: true },
    });

    if (carpentry.length === 0) return null;

    return carpentry
      .map((stage) => stage.status)
      .reduce((slowest, status) =>
        LIFECYCLE_ORDER[status] < LIFECYCLE_ORDER[slowest] ? status : slowest,
      );
  }

  /**
   * The amount currently on the table for this stage — the most recent proposal
   * or revision that has not yet been disposed of.
   */
  private async currentProposal(
    tx: Prisma.TransactionClient,
    stageId: string,
  ): Promise<bigint> {
    const latest = await tx.pricingHistory.findFirst({
      where: { stageId, action: { in: ['PROPOSED', 'REVISED'] } },
      orderBy: { createdAt: 'desc' },
      select: { value: true },
    });

    if (!latest?.value) {
      throw new ConflictException('There is no proposed price on this stage to accept.');
    }
    return latest.value;
  }

  /**
   * Append the pricing event, if this action is one (BR-9: insert only).
   *
   * An ACCEPTED row records the amount that was on the table, so the row is
   * self-describing and a ledger replay never depends on its neighbours.
   */
  private async appendLedger(
    tx: Prisma.TransactionClient,
    stageId: string,
    actor: Actor,
    action: StageAction,
    payload: TransitionPayload,
    agreedPrice: bigint | null,
  ): Promise<void> {
    const ledgerAction = LEDGER_ACTION[action];
    if (!ledgerAction) return;

    let value: bigint | null = null;

    if (ledgerAction === 'PROPOSED' || ledgerAction === 'REVISED') {
      const parsed = parseMinorUnits(payload.amount!);
      if (!parsed.ok) throw new BadRequestException(parsed.message);
      value = parsed.value;
    } else if (ledgerAction === 'ACCEPTED') {
      value = agreedPrice;
    }
    // DECLINED carries no amount, by constraint.

    await tx.pricingHistory.create({
      data: {
        stageId,
        actorId: actor.id,
        action: ledgerAction,
        value,
        reason: payload.reason?.trim() ?? null,
      },
    });
  }

  /** Map a domain failure onto the HTTP contract from the blueprint (Phase 7.3). */
  private toHttpError(code: StageErrorCode, message: string): Error {
    switch (code) {
      case 'FORBIDDEN':
      case 'NOT_ASSIGNEE':
        return new ForbiddenException({ code, message });
      case 'VERSION_CONFLICT':
      case 'STAGE_NOT_APPROVED':
      case 'SEQUENCE_GATE_LOCKED':
      case 'ILLEGAL_TRANSITION':
      // These describe the state the assignment is in, not a malformed request,
      // so they belong with the other conflicts rather than as a 400.
      case 'ASSIGNMENT_NOT_ACCEPTED':
      case 'ASSIGNMENT_ALREADY_SETTLED':
        return new ConflictException({ code, message });
      case 'INVALID_AMOUNT':
      case 'PHOTO_REQUIRED':
      case 'REASON_REQUIRED':
        return new BadRequestException({ code, message });
      default:
        return new BadRequestException({ code, message });
    }
  }
}
