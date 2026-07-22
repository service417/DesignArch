import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Role-specific home screens (FR-9.1).
 *
 * Each role gets its own method rather than one endpoint with conditionals,
 * because the three dashboards answer genuinely different questions: an Admin
 * asks "what is waiting on me and what do I owe", a Supervisor asks "what needs
 * inspecting", a worker asks "what am I doing and what have I earned". Sharing a
 * shape between them would mean every caller receiving fields it must ignore.
 *
 * Read-only throughout.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stages the Admin personally has to act on: price them, or revise them. */
  private static readonly AWAITING_ADMIN = ['APPROVED', 'PRICE_DECLINED'] as const;

  /** An assignment is "in flight" while it is neither finished nor unstarted. */
  private static readonly IN_FLIGHT = [
    'IN_PROGRESS',
    'READY_FOR_INSPECTION',
    'APPROVED',
    'REJECTED',
    'PRICE_PROPOSED',
    'PRICE_DECLINED',
    'PRICE_ACCEPTED',
  ] as const;

  async admin() {
    const [activeProjects, inProgressCards, awaitingPrice, unpaid, projects, workers] =
      await Promise.all([
        this.prisma.project.count({ where: { status: 'ACTIVE', deletedAt: null } }),

        // Job cards with at least one assignment under way — counted as cards,
        // not assignments, because that is the unit an admin thinks in.
        this.prisma.jobCard.count({
          where: { stages: { some: { status: { in: [...DashboardService.IN_FLIGHT] } } } },
        }),

        this.prisma.stage.count({
          where: { status: { in: [...DashboardService.AWAITING_ADMIN] } },
        }),

        this.prisma.earning.findMany({
          where: { status: 'UNPAID' },
          select: { amount: true },
        }),

        this.projectStatusOverview(),
        this.workerActivity(),
      ]);

    const pendingQueue = await this.prisma.stage.findMany({
      where: { status: { in: [...DashboardService.AWAITING_ADMIN] } },
      // Oldest first: a queue is work to clear, so what has waited longest is
      // what needs attention.
      orderBy: { updatedAt: 'asc' },
      take: 20,
      select: {
        id: true,
        type: true,
        status: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true } },
        jobCard: {
          select: { id: true, title: true, project: { select: { id: true, name: true } } },
        },
        pricingHistory: {
          where: { action: { in: ['PROPOSED', 'REVISED', 'DECLINED', 'SCOPE_CONFIRMED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { action: true, value: true, reason: true, createdAt: true },
        },
      },
    });

    return {
      kpis: {
        activeProjects,
        inProgressJobCards: inProgressCards,
        awaitingMyApproval: awaitingPrice,
        unpaidTotal: unpaid.reduce((sum, e) => sum + e.amount, 0n),
      },
      pendingQueue: pendingQueue.map(({ pricingHistory, ...stage }) => ({
        ...stage,
        lastPricingEvent: pricingHistory[0] ?? null,
      })),
      projects,
      workers,
    };
  }

  /** Per-project deadline and completion, for the status overview panel. */
  private async projectStatusOverview() {
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: 12,
      select: {
        id: true,
        name: true,
        client: true,
        deadline: true,
        jobCards: { select: { stages: { select: { status: true } } } },
      },
    });

    const now = Date.now();

    return projects.map((project) => {
      const stages = project.jobCards.flatMap((card) => card.stages);
      // "Complete" means the physical work passed inspection. Pricing and
      // payment follow separately and would otherwise make a finished project
      // look unfinished while an invoice is chased.
      const done = stages.filter((s) =>
        ['APPROVED', 'PRICE_PROPOSED', 'PRICE_DECLINED', 'PRICE_ACCEPTED', 'COMPLETED'].includes(
          s.status,
        ),
      ).length;

      return {
        id: project.id,
        name: project.name,
        client: project.client,
        deadline: project.deadline,
        overdue:
          project.deadline !== null &&
          project.deadline.getTime() < now &&
          done < stages.length,
        totalStages: stages.length,
        completedStages: done,
        percentComplete: stages.length === 0 ? 0 : Math.round((done / stages.length) * 100),
      };
    });
  }

  /**
   * Who is busy, who is free, and whose work is overdue.
   *
   * Overdue is judged by the deadline of the project the work belongs to, not by
   * the assignment itself — assignments carry no date of their own, and inventing
   * one here would be a number nobody agreed to.
   */
  private async workerActivity() {
    const workers = await this.prisma.user.findMany({
      where: { role: { in: ['CARPENTER', 'PAINTER'] }, status: 'ACTIVE', deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        assignedStages: {
          where: { status: { not: 'COMPLETED' } },
          select: {
            id: true,
            status: true,
            jobCard: { select: { project: { select: { deadline: true } } } },
          },
        },
      },
    });

    const now = Date.now();

    return workers.map((worker) => {
      const open = worker.assignedStages;
      const overdue = open.some((stage) => {
        const deadline = stage.jobCard.project.deadline;
        return deadline !== null && deadline.getTime() < now;
      });

      return {
        id: worker.id,
        name: worker.name,
        role: worker.role,
        openAssignments: open.length,
        state: overdue ? 'OVERDUE' : open.length > 0 ? 'BUSY' : 'FREE',
      };
    });
  }

  /** The Supervisor's home: what is waiting, and what they have cleared today. */
  async supervisor(supervisorId: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [readyToInspect, passedToday] = await Promise.all([
      this.prisma.stage.count({ where: { status: 'READY_FOR_INSPECTION' } }),

      // Approvals are attributed through the audit trail rather than a column on
      // the stage: the stage records *that* it was approved, the audit log records
      // who did it, and this is a "what have I done today" figure.
      this.prisma.auditLog.count({
        where: {
          action: 'STAGE_APPROVE',
          actorId: supervisorId,
          createdAt: { gte: startOfToday },
        },
      }),
    ]);

    return { readyToInspect, passedToday };
  }

  /** The worker's home: what they are doing, and what they have earned this month. */
  async worker(workerId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [assignments, monthEarnings] = await Promise.all([
      this.prisma.stage.findMany({
        where: { assigneeId: workerId, status: { not: 'COMPLETED' } },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          type: true,
          status: true,
          jobCard: {
            select: {
              id: true,
              title: true,
              project: { select: { name: true, deadline: true } },
            },
          },
        },
      }),

      this.prisma.earning.findMany({
        where: { workerId, createdAt: { gte: startOfMonth } },
        select: { amount: true, status: true },
      }),
    ]);

    return {
      activeJobs: assignments.length,
      thisMonth: {
        earned: monthEarnings.reduce((sum, e) => sum + e.amount, 0n),
        paid: monthEarnings
          .filter((e) => e.status === 'PAID')
          .reduce((sum, e) => sum + e.amount, 0n),
      },
      jobs: assignments.map((stage) => ({
        id: stage.id,
        type: stage.type,
        status: stage.status,
        jobCard: stage.jobCard,
        // A single assignment's progress through its own lifecycle, so the worker
        // sees movement on a long job rather than a binary done/not-done.
        percentComplete: PROGRESS_BY_STATUS[stage.status] ?? 0,
        dueDate: stage.jobCard.project.deadline,
      })),
    };
  }

  /**
   * A worker's month: earned, paid, outstanding, and each job's payment state.
   *
   * Dated by when the earning arose — when the price was accepted — not by when
   * it was paid. A month's report is about the work done in it; dating by payment
   * would move an earning between months just because it was settled late.
   */
  async workerMonthlyReport(workerId: string, month?: string) {
    const anchor = month ? new Date(`${month}-01T00:00:00Z`) : new Date();
    const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));

    const [worker, earnings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: workerId },
        select: { id: true, name: true, role: true },
      }),
      this.prisma.earning.findMany({
        where: { workerId, createdAt: { gte: from, lt: to } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          amount: true,
          status: true,
          paidAt: true,
          createdAt: true,
          stage: {
            select: {
              type: true,
              jobCard: {
                select: { title: true, project: { select: { name: true, client: true } } },
              },
            },
          },
        },
      }),
    ]);

    const earned = earnings.reduce((sum, e) => sum + e.amount, 0n);
    const paid = earnings
      .filter((e) => e.status === 'PAID')
      .reduce((sum, e) => sum + e.amount, 0n);

    return {
      worker,
      period: { from, to, label: from.toISOString().slice(0, 7) },
      totals: {
        earned,
        paid,
        outstanding: earned - paid,
        jobsCompleted: earnings.length,
        // Integer percentage in BigInt space; no amount becomes a float on the
        // way to a progress bar.
        paymentProgress:
          earned === 0n ? 0 : Number((paid * 100n) / earned),
      },
      jobs: earnings,
    };
  }
}

/**
 * How far through its own lifecycle an assignment is, as a percentage.
 *
 * Shown to a worker on a long job so they see movement. REJECTED deliberately
 * drops back below READY_FOR_INSPECTION: the work really has gone backwards, and
 * showing otherwise would be flattering rather than useful.
 */
const PROGRESS_BY_STATUS: Record<string, number> = {
  ASSIGNED: 0,
  IN_PROGRESS: 25,
  REJECTED: 25,
  READY_FOR_INSPECTION: 60,
  APPROVED: 75,
  PRICE_PROPOSED: 85,
  PRICE_DECLINED: 85,
  PRICE_ACCEPTED: 95,
  COMPLETED: 100,
};
