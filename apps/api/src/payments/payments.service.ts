import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../domain/stage.types';
import { EarningQueryDto } from './dto/payment.dto';

const EARNING_VIEW = {
  id: true,
  amount: true,
  status: true,
  paidAt: true,
  paidById: true,
  createdAt: true,
  worker: { select: { id: true, name: true, role: true } },
  stage: {
    select: {
      id: true,
      type: true,
      jobCard: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true, client: true } },
        },
      },
    },
  },
} satisfies Prisma.EarningSelect;

/**
 * Earnings and payment records (FR-8).
 *
 * The critical thing this module does *not* do is move money. DesignArc settles
 * outside the system — cash, bank transfer — and marking an earning Paid records
 * that this happened. Treating it as a disbursement would be a lie about what
 * the software controls, so the language here stays "record", never "pay".
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Earnings visible to the caller.
   *
   * A worker sees only their own, enforced here rather than by trusting a
   * `workerId` query parameter — otherwise anyone could read a colleague's pay
   * by editing the URL.
   */
  async list(actor: Actor, query: EarningQueryDto) {
    const scopedWorkerId = actor.role === 'ADMIN' ? query.workerId : actor.id;

    const earnings = await this.prisma.earning.findMany({
      where: {
        ...(scopedWorkerId ? { workerId: scopedWorkerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: query.take ?? 100,
      select: EARNING_VIEW,
    });

    // Summed here rather than in SQL because the set is already in memory and
    // BigInt addition avoids the float rounding a SUM()-to-JSON round trip risks.
    const total = (status: 'UNPAID' | 'PAID') =>
      earnings
        .filter((e) => e.status === status)
        .reduce((sum, e) => sum + e.amount, 0n);

    return {
      earnings,
      summary: {
        count: earnings.length,
        unpaidTotal: total('UNPAID'),
        paidTotal: total('PAID'),
      },
    };
  }

  async findOne(id: string, actor: Actor) {
    const earning = await this.prisma.earning.findUnique({
      where: { id },
      select: EARNING_VIEW,
    });
    if (!earning) throw new NotFoundException(`Earning ${id} was not found.`);

    // A 404 rather than a 403: confirming the row exists would already leak that
    // somebody was paid for that stage.
    if (actor.role !== 'ADMIN' && earning.worker.id !== actor.id) {
      throw new NotFoundException(`Earning ${id} was not found.`);
    }

    return earning;
  }

  /**
   * Record that a worker has been paid (FR-8.3).
   *
   * The update is conditional on the row still being UNPAID, so two admins
   * clicking at once cannot both write a payment — the second finds nothing to
   * update and is told so, rather than silently overwriting the first one's
   * timestamp and attribution.
   */
  async markPaid(id: string, adminId: string, reference?: string, ip?: string) {
    const earning = await this.prisma.earning.findUnique({
      where: { id },
      select: { id: true, status: true, amount: true, workerId: true },
    });
    if (!earning) throw new NotFoundException(`Earning ${id} was not found.`);

    if (earning.status === 'PAID') {
      throw new ConflictException({
        code: 'ALREADY_PAID',
        message: 'This earning is already recorded as paid.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const paidAt = new Date();

      const updated = await tx.earning.updateMany({
        // status in the predicate is the lock. The CHECK constraint requires
        // paid_date and paid_by to be set in the same statement as the status.
        where: { id, status: 'UNPAID' },
        data: { status: 'PAID', paidAt, paidById: adminId },
      });

      if (updated.count === 0) {
        throw new ConflictException({
          code: 'ALREADY_PAID',
          message: 'This earning was marked paid by someone else a moment ago.',
        });
      }

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'EARNING_MARKED_PAID',
        entity: 'earning',
        entityId: id,
        meta: {
          workerId: earning.workerId,
          amount: String(earning.amount),
          ...(reference ? { reference } : {}),
        },
        ip,
      });

      // The worker is told they have been paid. Written in-transaction so they
      // are never notified about a payment that then rolls back.
      await tx.notification.create({
        data: {
          recipientId: earning.workerId,
          eventType: 'EARNING_PAID',
          refType: 'earning',
          refId: id,
        },
      });

      this.logger.log(
        `Earning ${id} (${earning.amount} cents) recorded as paid by ${adminId}`,
      );

      return tx.earning.findUniqueOrThrow({ where: { id }, select: EARNING_VIEW });
    });
  }

  /**
   * What each worker is owed — the Admin's payment run (FR-8.2).
   *
   * Grouped in the database rather than by pulling every row back, because this
   * is the one query whose size grows without bound as the business runs.
   */
  async outstandingByWorker() {
    const grouped = await this.prisma.earning.groupBy({
      by: ['workerId'],
      where: { status: 'UNPAID' },
      _sum: { amount: true },
      _count: { _all: true },
    });

    if (grouped.length === 0) return [];

    const workers = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.workerId) } },
      select: { id: true, name: true, role: true, status: true },
    });
    const byId = new Map(workers.map((w) => [w.id, w]));

    return grouped
      .map((group) => ({
        worker: byId.get(group.workerId) ?? null,
        unpaidCount: group._count._all,
        unpaidTotal: group._sum.amount ?? 0n,
      }))
      .sort((a, b) => (b.unpaidTotal > a.unpaidTotal ? 1 : -1));
  }
}
