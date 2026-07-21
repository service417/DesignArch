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

    const specs = dto.stages ?? [];
    this.rejectDuplicateTypes(specs);
    // Validate every assignee before writing anything, so a bad second stage
    // cannot leave a half-built job card behind.
    await Promise.all(specs.map((spec) => this.requireAssignable(spec)));

    const jobCard = await this.prisma.$transaction(async (tx) => {
      const created = await tx.jobCard.create({
        data: {
          projectId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          stages: {
            create: specs.map((spec) => ({
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
        meta: { projectId, title: created.title, stages: specs.length },
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

  async update(id: string, dto: UpdateJobCardDto) {
    await this.requireJobCard(id);
    return this.prisma.jobCard.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
      },
    });
  }

  /** Add the second stage to a card that was created with only one. */
  async addStage(jobCardId: string, spec: StageSpecDto, adminId: string, ip?: string) {
    await this.requireJobCard(jobCardId);
    await this.requireAssignable(spec);

    const existing = await this.prisma.stage.findFirst({
      where: { jobCardId, type: spec.type },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `This job card already has a ${spec.type.toLowerCase()} stage.`,
      );
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

  private rejectDuplicateTypes(specs: StageSpecDto[]): void {
    const types = specs.map((s) => s.type);
    if (new Set(types).size !== types.length) {
      throw new ConflictException(
        'A job card may have at most one carpentry stage and one painting stage.',
      );
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
