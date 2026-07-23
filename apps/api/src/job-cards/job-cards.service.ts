import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, StageStatus, StageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AssignStageDto,
  CreateJobCardDto,
  StageSpecDto,
  UpdateJobCardDto,
} from './dto/job-card.dto';

/**
 * Turn one stage spec into one entry per named worker.
 *
 * `assigneeIds` is the parallel form; `assigneeId` remains for the single-worker
 * case. Supplying both is rejected rather than merged, because the intent is
 * ambiguous and guessing at it on the money path is not worth the convenience.
 * With neither, a single unstaffed assignment is created — a planned job card
 * that has not been resourced yet.
 */
function expandAssignees(spec: StageSpecDto): StageSpecDto[] {
  const many = spec.assigneeIds ?? [];

  if (spec.assigneeId && many.length > 0) {
    throw new ConflictException(
      'Give either assigneeId or assigneeIds for a stage, not both.',
    );
  }

  if (many.length > 0) {
    return many.map((assigneeId) => ({ type: spec.type, assigneeId }));
  }

  return [{ type: spec.type, assigneeId: spec.assigneeId }];
}

/**
 * Carpentry is always sequence 1 and painting always sequence 2. The sequence
 * gate (BR-3.2) depends on this ordering, and a CHECK constraint enforces the
 * same pairing in the database — this map is where the API side of it lives, so
 * a caller never gets to choose a sequence number.
 */
const SEQUENCE_BY_TYPE: Record<StageType, number> = {
  CARPENTRY: 1,
  PAINTING: 2,
};

/** Which role may hold which stage — the role-matched assignment rule (BR-4). */
const ROLE_BY_TYPE: Record<StageType, Role> = {
  CARPENTRY: 'CARPENTER',
  PAINTING: 'PAINTER',
};

/**
 * Reassignment is closed once a stage has been approved.
 *
 * After approval the stage is on its way to a price and an earning, and the
 * earning is written to whoever holds the assignment. Allowing a late
 * reassignment would let the person who did the work be swapped for someone else
 * before payment — a money-path attack, not a clerical convenience.
 */
const REASSIGNABLE: StageStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'];

@Injectable()
export class JobCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(projectId: string, dto: CreateJobCardDto, adminId: string, ip?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} was not found.`);

    if (project.status === 'ARCHIVED') {
      throw new ConflictException(
        'This project is archived. Unarchive it before adding job cards.',
      );
    }

    // Each spec expands into one assignment per named worker, so a stage type
    // worked by three carpenters becomes three independent rows.
    const assignments = (dto.stages ?? []).flatMap((spec) => expandAssignees(spec));

    // Validate every assignee before writing anything, so a bad third assignment
    // cannot leave a half-built job card behind.
    await Promise.all(assignments.map((spec) => this.requireAssignable(spec)));
    this.rejectDuplicateWorkerOnSameType(assignments);

    const jobCard = await this.prisma.$transaction(async (tx) => {
      const created = await tx.jobCard.create({
        data: {
          projectId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          stages: {
            create: assignments.map((spec) => ({
              type: spec.type,
              sequenceNo: SEQUENCE_BY_TYPE[spec.type],
              assigneeId: spec.assigneeId ?? null,
            })),
          },
        },
        include: { stages: { orderBy: { sequenceNo: 'asc' } } },
      });

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'JOB_CARD_CREATED',
        entity: 'job_card',
        entityId: created.id,
        meta: {
          projectId,
          title: created.title,
          assignments: assignments.length,
          workers: assignments.filter((spec) => spec.assigneeId).length,
        },
        ip,
      });

      for (const stage of created.stages) {
        if (stage.assigneeId) {
          await this.notifications.notifyAssignment(tx, {
            stageId: stage.id,
            assigneeId: stage.assigneeId,
          });
        }
      }

      return created;
    });

    return jobCard;
  }

  async listForProject(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} was not found.`);

    return this.prisma.jobCard.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        stages: {
          orderBy: { sequenceNo: 'asc' },
          select: {
            id: true,
            type: true,
            status: true,
            assigneeId: true,
            version: true,
            assignee: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const jobCard = await this.prisma.jobCard.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, client: true, status: true } },
        attachments: true,
        stages: {
          orderBy: { sequenceNo: 'asc' },
          include: {
            assignee: { select: { id: true, name: true, role: true } },
            _count: { select: { photos: true } },
          },
        },
      },
    });
    if (!jobCard) throw new NotFoundException(`Job card ${id} was not found.`);
    return jobCard;
  }

  /**
   * Edit the job card's title and specification.
   *
   * Audited, because the description is the brief the work is done against —
   * changing it after a worker has started is a meaningful act, and the trail is
   * what lets a later dispute establish what the spec said when. The old and new
   * text are recorded so the change itself is reconstructable, not just the fact
   * that one happened.
   */
  async update(id: string, dto: UpdateJobCardDto, adminId: string, ip?: string) {
    const before = await this.prisma.jobCard.findUnique({
      where: { id },
      select: { id: true, title: true, description: true },
    });
    if (!before) throw new NotFoundException(`Job card ${id} was not found.`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.jobCard.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
        },
      });

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'JOB_CARD_UPDATED',
        entity: 'job_card',
        entityId: id,
        meta: {
          ...(dto.title !== undefined && dto.title.trim() !== before.title
            ? { titleFrom: before.title, titleTo: updated.title }
            : {}),
          ...(dto.description !== undefined &&
          (updated.description ?? null) !== (before.description ?? null)
            ? { descriptionChanged: true }
            : {}),
        },
        ip,
      });

      return updated;
    });
  }

  /** Add the second stage to a card that was created with only one. */
  async addStage(jobCardId: string, spec: StageSpecDto, adminId: string, ip?: string) {
    await this.requireJobCard(jobCardId);
    await this.requireAssignable(spec);

    // A second carpenter on the same card is now the expected case, not a
    // conflict. What is still wrong is giving the *same* worker the same stage
    // type twice — they would end up with two assignments to accept separately.
    if (spec.assigneeId) {
      const duplicate = await this.prisma.stage.findFirst({
        where: { jobCardId, type: spec.type, assigneeId: spec.assigneeId },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `That worker already has the ${spec.type.toLowerCase()} work on this job card.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.create({
        data: {
          jobCardId,
          type: spec.type,
          sequenceNo: SEQUENCE_BY_TYPE[spec.type],
          assigneeId: spec.assigneeId ?? null,
        },
      });

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'STAGE_CREATED',
        entity: 'stage',
        entityId: stage.id,
        meta: { jobCardId, type: stage.type, assigneeId: stage.assigneeId },
        ip,
      });

      await this.notifications.notifyAssignment(tx, {
        stageId: stage.id,
        assigneeId: stage.assigneeId,
      });

      return stage;
    });
  }

  /**
   * Assign or reassign a stage's worker.
   *
   * Guarded by REASSIGNABLE above, and audited with both the old and the new
   * assignee so a change of hands is always reconstructable.
   */
  async assign(stageId: string, dto: AssignStageDto, adminId: string, ip?: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true, type: true, status: true, assigneeId: true, version: true },
    });
    if (!stage) throw new NotFoundException(`Stage ${stageId} was not found.`);

    if (!REASSIGNABLE.includes(stage.status)) {
      throw new ConflictException({
        code: 'STAGE_NOT_REASSIGNABLE',
        message:
          `A stage can only be reassigned before inspection; this one is ` +
          `${stage.status}. Reassigning it now would move the earning to a ` +
          `different worker.`,
      });
    }

    await this.requireAssignable({ type: stage.type, assigneeId: dto.assigneeId });

    if (stage.assigneeId === dto.assigneeId) return stage;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stage.update({
        where: { id: stageId },
        data: { assigneeId: dto.assigneeId, version: { increment: 1 } },
      });

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'STAGE_REASSIGNED',
        entity: 'stage',
        entityId: stageId,
        meta: { from: stage.assigneeId, to: dto.assigneeId, status: stage.status },
        ip,
      });

      await this.notifications.notifyAssignment(tx, {
        stageId,
        assigneeId: dto.assigneeId,
      });

      return updated;
    });
  }

  /**
   * The same worker must not be given the same stage type twice on one card.
   *
   * Several *different* workers on one stage type is the whole point of parallel
   * assignment, so the old "one stage of each type" rule is gone. This is what
   * replaces it: duplicating a person is a mistake in the request, and would
   * otherwise create two assignments they would have to accept separately.
   */
  private rejectDuplicateWorkerOnSameType(specs: StageSpecDto[]): void {
    const seen = new Set<string>();
    for (const spec of specs) {
      if (!spec.assigneeId) continue;
      const key = `${spec.type}:${spec.assigneeId}`;
      if (seen.has(key)) {
        throw new ConflictException(
          `The same worker is listed twice for the ${spec.type.toLowerCase()} work on this job card.`,
        );
      }
      seen.add(key);
    }
  }

  /**
   * The assignee must exist, be active, and hold the role the stage calls for.
   *
   * Without the role check a painter could be assigned carpentry, and the state
   * machine would then refuse every action they attempted — the work would look
   * staffed while being impossible to progress.
   */
  private async requireAssignable(spec: {
    type: StageType;
    assigneeId?: string;
  }): Promise<void> {
    if (!spec.assigneeId) return;

    const user = await this.prisma.user.findFirst({
      where: { id: spec.assigneeId, deletedAt: null },
      select: { id: true, name: true, role: true, status: true },
    });
    if (!user) throw new NotFoundException(`User ${spec.assigneeId} was not found.`);

    if (user.status !== 'ACTIVE') {
      throw new ConflictException(`${user.name} is deactivated and cannot be assigned work.`);
    }

    const required = ROLE_BY_TYPE[spec.type];
    if (user.role !== required) {
      throw new ConflictException({
        code: 'ROLE_MISMATCH',
        message: `A ${spec.type.toLowerCase()} stage must be assigned to a ${required.toLowerCase()}; ${user.name} is a ${user.role.toLowerCase()}.`,
      });
    }
  }

  private async requireJobCard(id: string): Promise<void> {
    const found = await this.prisma.jobCard.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Job card ${id} was not found.`);
  }
}
