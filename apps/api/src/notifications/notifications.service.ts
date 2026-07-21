import { Injectable, Logger } from '@nestjs/common';
import { NotificationEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StageAction } from '../domain/stage.types';

interface TransitionNotification {
  stageId: string;
  action: StageAction;
  actorId: string;
  assigneeId: string | null;
}

/**
 * Workflow notifications (FR-7.x).
 *
 * The SRS is explicit that notifications are important but non-critical: a
 * missed notification must never block the underlying workflow. So the in-app
 * row is written inside the caller's transaction (it is cheap, and a user must
 * never be told about a state change that then rolls back), while push delivery
 * is queued for a worker and is allowed to fail independently.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Map a workflow transition to its recipients and write their feed entries. */
  async enqueueForTransition(
    tx: Prisma.TransactionClient,
    event: TransitionNotification,
  ): Promise<void> {
    const recipients = await this.resolveRecipients(tx, event);
    const eventType = ACTION_TO_EVENT[event.action];

    if (!eventType || recipients.length === 0) return;

    await tx.notification.createMany({
      data: recipients.map((recipientId) => ({
        recipientId,
        eventType,
        refType: 'stage',
        refId: event.stageId,
      })),
      skipDuplicates: true,
    });

    // Push delivery is deliberately out-of-band. Enqueue to BullMQ here once the
    // queue module lands; a failure to push must not roll back the state change.
    this.logger.debug(
      `Queued ${eventType} for ${recipients.length} recipient(s) on stage ${event.stageId}`,
    );
  }

  /**
   * Who is party to this event (BR-7.1)? Only those recipients — a notification
   * is never broadcast beyond the roles involved.
   */
  private async resolveRecipients(
    tx: Prisma.TransactionClient,
    event: TransitionNotification,
  ): Promise<string[]> {
    switch (event.action) {
      // The worker needs to know: assigned, inspected, priced.
      case 'APPROVE':
      case 'REJECT':
      case 'PROPOSE_PRICE':
      case 'REVISE_PRICE':
        return event.assigneeId ? [event.assigneeId] : [];

      // The supervisors need to know work is waiting for inspection.
      case 'MARK_READY':
        return this.idsOfRole(tx, 'SUPERVISOR');

      // The admins own the pricing queue and the payment decision.
      case 'ACCEPT_PRICE':
      case 'DECLINE_PRICE':
        return this.idsOfRole(tx, 'ADMIN');

      default:
        return [];
    }
  }

  private async idsOfRole(
    tx: Prisma.TransactionClient,
    role: 'ADMIN' | 'SUPERVISOR',
  ): Promise<string[]> {
    const users = await tx.user.findMany({
      where: { role, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    // Scoped by recipientId so a user can only ever clear their own badge.
    await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId: userId },
      data: { readFlag: true },
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: userId, readFlag: false },
    });
  }

  async feed(userId: string, take = 50) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}

const ACTION_TO_EVENT: Partial<Record<StageAction, NotificationEvent>> = {
  MARK_READY: 'READY_FOR_INSPECTION',
  APPROVE: 'INSPECTION_APPROVED',
  REJECT: 'INSPECTION_REJECTED',
  PROPOSE_PRICE: 'PRICE_PROPOSED',
  REVISE_PRICE: 'PRICE_REVISED',
  ACCEPT_PRICE: 'PRICE_ACCEPTED',
  DECLINE_PRICE: 'PRICE_DECLINED',
};
