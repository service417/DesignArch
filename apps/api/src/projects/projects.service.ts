import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto, adminId: string) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        client: dto.client,
        description: dto.description ?? null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        createdById: adminId,
      },
    });
  }

  /** Active projects by default; archived are hidden unless explicitly asked for. */
  async list(includeArchived = false) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(includeArchived ? {} : { status: 'ACTIVE' }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Project detail with its completion percentage (FR-2.3).
   *
   * Completion is the proportion of stages that have reached Approved — the
   * point at which the physical work is done and inspected. Pricing and payment
   * are commercial steps that follow, and holding them against "completion"
   * would make the number say something the business does not mean by it.
   */
  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        jobCards: {
          include: {
            stages: {
              select: { id: true, type: true, status: true, assigneeId: true },
              orderBy: { sequenceNo: 'asc' },
            },
            attachments: true,
          },
        },
      },
    });

    if (!project) throw new NotFoundException(`Project ${id} was not found.`);

    const stages = project.jobCards.flatMap((card) => card.stages);
    const done = stages.filter((s) => COMPLETED_ENOUGH.includes(s.status)).length;

    return {
      ...project,
      completion: {
        totalStages: stages.length,
        approvedStages: done,
        // A project with no stages is 0% complete, not NaN%.
        percentage: stages.length === 0 ? 0 : Math.round((done / stages.length) * 100),
      },
    };
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.ensureExists(id);
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.client !== undefined ? { client: dto.client } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.deadline !== undefined
          ? { deadline: dto.deadline ? new Date(dto.deadline) : null }
          : {}),
      },
    });
  }

  /**
   * Archive, never delete (FR-2.5). The database blocks deletion of a project
   * with recorded earnings; archiving is the supported way to retire one.
   */
  async archive(id: string) {
    await this.ensureExists(id);
    return this.prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async unarchive(id: string) {
    await this.ensureExists(id);
    return this.prisma.project.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Project ${id} was not found.`);
  }
}

/** Stage statuses that count as physically finished for completion roll-up. */
const COMPLETED_ENOUGH = [
  'APPROVED',
  'PRICE_PROPOSED',
  'PRICE_DECLINED',
  'PRICE_ACCEPTED',
  'COMPLETED',
];
