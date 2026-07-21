import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { reconcile } from '../domain/pricing-ledger';
import type { PricingEntry } from '../domain/pricing-ledger';

export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Reporting and integrity checks (FR-9).
 *
 * Read-only throughout: nothing here writes, so a report can never alter what it
 * reports on.
 */
@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Earnings over a period, grouped by worker (FR-9.2).
   *
   * Dated by `createdAt` — when the price was accepted and the obligation arose
   * — not by payment date. A payroll period is about work done in it, and dating
   * by payment would move an earning between periods just because it was settled
   * late.
   */
  async earningsReport(range: DateRange) {
    const where = {
      ...(range.from || range.to
        ? {
            createdAt: {
              ...(range.from ? { gte: new Date(range.from) } : {}),
              ...(range.to ? { lte: endOfDay(range.to) } : {}),
            },
          }
        : {}),
    };

    const earnings = await this.prisma.earning.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        amount: true,
        status: true,
        paidAt: true,
        createdAt: true,
        worker: { select: { id: true, name: true, role: true } },
        stage: {
          select: {
            type: true,
            jobCard: {
              select: { title: true, project: { select: { name: true, client: true } } },
            },
          },
        },
      },
    });

    const byWorker = new Map<
      string,
      { worker: { id: string; name: string; role: string }; earned: bigint; paid: bigint; count: number }
    >();

    for (const earning of earnings) {
      const row = byWorker.get(earning.worker.id) ?? {
        worker: earning.worker,
        earned: 0n,
        paid: 0n,
        count: 0,
      };
      row.earned += earning.amount;
      if (earning.status === 'PAID') row.paid += earning.amount;
      row.count += 1;
      byWorker.set(earning.worker.id, row);
    }

    const workers = [...byWorker.values()].map((row) => ({
      ...row,
      outstanding: row.earned - row.paid,
    }));

    return {
      range: { from: range.from ?? null, to: range.to ?? null },
      totals: {
        earned: workers.reduce((sum, w) => sum + w.earned, 0n),
        paid: workers.reduce((sum, w) => sum + w.paid, 0n),
        outstanding: workers.reduce((sum, w) => sum + w.outstanding, 0n),
        earningCount: earnings.length,
      },
      byWorker: workers.sort((a, b) => (b.earned > a.earned ? 1 : -1)),
      earnings,
    };
  }

  /** Per-project cost and progress (FR-9.3). */
  async projectReport(range: DateRange) {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        client: true,
        status: true,
        deadline: true,
        jobCards: {
          select: {
            id: true,
            stages: {
              select: {
                status: true,
                acceptedPrice: true,
                earning: { select: { amount: true, status: true, createdAt: true } },
              },
            },
          },
        },
      },
    });

    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? endOfDay(range.to) : null;
    const inRange = (date: Date) => (!from || date >= from) && (!to || date <= to);

    return projects.map((project) => {
      const stages = project.jobCards.flatMap((card) => card.stages);
      const earnings = stages
        .map((stage) => stage.earning)
        .filter((earning): earning is NonNullable<typeof earning> => earning !== null)
        .filter((earning) => inRange(earning.createdAt));

      const committed = earnings.reduce((sum, e) => sum + e.amount, 0n);
      const paid = earnings
        .filter((e) => e.status === 'PAID')
        .reduce((sum, e) => sum + e.amount, 0n);

      const completed = stages.filter((s) => s.status === 'COMPLETED').length;

      return {
        id: project.id,
        name: project.name,
        client: project.client,
        status: project.status,
        deadline: project.deadline,
        jobCardCount: project.jobCards.length,
        stageCount: stages.length,
        completedStages: completed,
        // A project with no stages is 0%, not NaN%.
        percentComplete: stages.length === 0 ? 0 : Math.round((completed / stages.length) * 100),
        labourCommitted: committed,
        labourPaid: paid,
        labourOutstanding: committed - paid,
      };
    });
  }

  /**
   * Integrity check on the money path.
   *
   * `stage.accepted_price` is only a read-model; the append-only pricing ledger
   * is authoritative (see domain/pricing-ledger.ts). This replays every settled
   * stage's ledger and reports any disagreement.
   *
   * The blueprint asked for this as a periodic job. It is exposed as an endpoint
   * first because a check nobody can run on demand is a check nobody trusts —
   * and it is read-only, so running it can never make things worse.
   */
  async reconcileLedger() {
    const stages = await this.prisma.stage.findMany({
      where: { status: { in: ['PRICE_ACCEPTED', 'COMPLETED'] } },
      select: {
        id: true,
        acceptedPrice: true,
        jobCard: { select: { title: true, project: { select: { name: true } } } },
        pricingHistory: {
          select: { action: true, value: true, actorId: true, createdAt: true, reason: true },
        },
        earning: { select: { id: true, amount: true } },
      },
    });

    const discrepancies: Array<{
      stageId: string;
      jobCard: string;
      project: string;
      kind: 'LEDGER_MISMATCH' | 'EARNING_MISMATCH';
      message: string;
    }> = [];

    for (const stage of stages) {
      const entries: PricingEntry[] = stage.pricingHistory.map((entry) => ({
        action: entry.action,
        value: entry.value,
        actorId: entry.actorId,
        createdAt: entry.createdAt,
        reason: entry.reason,
      }));

      const result = reconcile(stage.acceptedPrice, entries);
      if (!result.consistent) {
        discrepancies.push({
          stageId: stage.id,
          jobCard: stage.jobCard.title,
          project: stage.jobCard.project.name,
          kind: 'LEDGER_MISMATCH',
          message: result.message ?? 'Stored price disagrees with the ledger.',
        });
      }

      // The earning is what actually gets paid, so it must equal the accepted
      // price too. The database trigger enforces this on insert; this catches
      // any drift that arrived another way.
      if (stage.earning && stage.earning.amount !== stage.acceptedPrice) {
        discrepancies.push({
          stageId: stage.id,
          jobCard: stage.jobCard.title,
          project: stage.jobCard.project.name,
          kind: 'EARNING_MISMATCH',
          message:
            `Earning ${stage.earning.id} records ${stage.earning.amount} but the stage's ` +
            `accepted price is ${stage.acceptedPrice ?? 'null'}.`,
        });
      }
    }

    if (discrepancies.length > 0) {
      this.logger.error(
        `Ledger reconciliation found ${discrepancies.length} discrepancy(ies) across ${stages.length} settled stages`,
      );
    }

    return {
      checkedAt: new Date(),
      settledStagesChecked: stages.length,
      consistent: discrepancies.length === 0,
      discrepancies,
    };
  }
}

/**
 * A `to` date means the end of that day in the user's terms.
 *
 * Without this, `to=2026-07-21` parses as midnight and silently excludes
 * everything that happened during the 21st — an off-by-one-day that would
 * understate a payroll period.
 */
function endOfDay(date: string): Date {
  const parsed = new Date(date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}
