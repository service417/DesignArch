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

/** Which stage actions are pricing events, and how they appear in the ledger. */
const LEDGER_ACTION: Partial<Record<StageAction, PricingAction>> = {
  PROPOSE_PRICE: 'PROPOSED',
  REVISE_PRICE: 'REVISED',
  ACCEPT_PRICE: 'ACCEPTED',
  DECLINE_PRICE: 'DECLINED',
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
      };

      // The painting sequence gate needs the sibling carpentry stage.
      const siblingCarpentryStatus =
        stage.type === 'PAINTING'
          ? ((
              await tx.stage.findFirst({
                where: { jobCardId: stage.jobCardId, type: 'CARPENTRY' },
                select: { status: true },
              })
            )?.status ?? null)
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

    // A raw file_ref is useless to a client. Hand back short-lived signed URLs
    // instead, so evidence renders in an <img> without exposing the object key.
    return {
      ...stage,
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
