import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

/**
 * The columns a user is ever exposed as. Written as an explicit projection
 * rather than an omission so that adding a sensitive column later cannot leak it
 * by default — `password_hash` has to be actively added to escape.
 */
const USER_VIEW = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * A stage still needs its assignee to act on it. These are the states where
 * deactivating or re-roling the worker would strand the work with nobody able
 * to move it: the state machine requires the assignee, so no one else can.
 */
const IN_FLIGHT: StageStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'READY_FOR_INSPECTION',
  'APPROVED',
  'REJECTED',
  'PRICE_PROPOSED',
  'PRICE_DECLINED',
];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, adminId: string, ip?: string) {
    const email = dto.email.toLowerCase().trim();

    // Checked explicitly for a usable message; the unique index is still the
    // real guarantee, and the catch below covers the race between the two.
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException(`A user already exists with the email ${email}.`);
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email,
          phone: dto.phone?.trim() || null,
          role: dto.role,
          passwordHash: await this.auth.hashPassword(dto.password),
        },
        select: USER_VIEW,
      });

      await this.audit.record({
        actorId: adminId,
        action: 'USER_CREATED',
        entity: 'user',
        entityId: user.id,
        meta: { email: user.email, role: user.role },
        ip,
      });

      return user;
    } catch (error) {
      throw this.asConflict(error);
    }
  }

  async list(filters: { role?: Role; includeDeactivated?: boolean } = {}) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.includeDeactivated ? {} : { status: 'ACTIVE' }),
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: USER_VIEW,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_VIEW,
    });
    if (!user) throw new NotFoundException(`User ${id} was not found.`);
    return user;
  }

  /**
   * A role change is not a cosmetic edit: it decides which stages this person may
   * be assigned to and which actions the state machine will accept from them.
   * Changing it out from under in-flight work would leave stages assigned to
   * somebody who can no longer act on them.
   */
  async update(id: string, dto: UpdateUserDto, adminId: string, ip?: string) {
    const existing = await this.requireUser(id);

    if (dto.role && dto.role !== existing.role) {
      if (id === adminId) {
        // An admin removing their own ADMIN role could remove the last one, and
        // does so with the very permission they are giving up.
        throw new ConflictException(
          'You cannot change your own role. Ask another administrator.',
        );
      }

      if (existing.role === 'ADMIN') await this.ensureNotLastAdmin(id);

      const inFlight = await this.prisma.stage.count({
        where: { assigneeId: id, status: { in: IN_FLIGHT } },
      });
      if (inFlight > 0) {
        throw new ConflictException({
          code: 'USER_HAS_IN_FLIGHT_WORK',
          message:
            `${existing.name} is still assigned to ${inFlight} unfinished stage(s). ` +
            `Reassign them before changing this role.`,
        });
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
        },
        select: USER_VIEW,
      });

      if (dto.role && dto.role !== existing.role) {
        await this.audit.record({
          actorId: adminId,
          action: 'USER_ROLE_CHANGED',
          entity: 'user',
          entityId: id,
          meta: { from: existing.role, to: dto.role },
          ip,
        });
      }

      return user;
    } catch (error) {
      throw this.asConflict(error);
    }
  }

  /**
   * Deactivation is the closest thing to deletion a user gets (decision C4):
   * their earnings and their signature on past inspections must survive.
   */
  async deactivate(id: string, adminId: string, ip?: string) {
    const existing = await this.requireUser(id);

    if (id === adminId) {
      throw new ConflictException('You cannot deactivate your own account.');
    }
    if (existing.status === 'DEACTIVATED') return this.findOne(id);
    if (existing.role === 'ADMIN') await this.ensureNotLastAdmin(id);

    const inFlight = await this.prisma.stage.count({
      where: { assigneeId: id, status: { in: IN_FLIGHT } },
    });
    if (inFlight > 0) {
      throw new ConflictException({
        code: 'USER_HAS_IN_FLIGHT_WORK',
        message:
          `${existing.name} is still assigned to ${inFlight} unfinished stage(s), which ` +
          `nobody else can act on. Reassign them first.`,
      });
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: 'DEACTIVATED' },
        select: USER_VIEW,
      });

      // Access tokens are already dead — the JWT strategy revalidates the
      // account on every request — but a live refresh token would otherwise
      // keep minting new ones.
      const revoked = await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'USER_DEACTIVATED',
        entity: 'user',
        entityId: id,
        meta: { email: existing.email, sessionsRevoked: revoked.count },
        ip,
      });

      return updated;
    });

    this.logger.log(`User ${existing.email} deactivated by ${adminId}`);
    return user;
  }

  async activate(id: string, adminId: string, ip?: string) {
    const existing = await this.requireUser(id);
    if (existing.status === 'ACTIVE') return this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: USER_VIEW,
    });

    await this.audit.record({
      actorId: adminId,
      action: 'USER_ACTIVATED',
      entity: 'user',
      entityId: id,
      meta: { email: existing.email },
      ip,
    });

    return user;
  }

  /**
   * Administrative password reset. Every existing session is revoked: a reset is
   * either a lost password or a suspected compromise, and both mean the sessions
   * opened with the old one should not survive it.
   */
  async resetPassword(id: string, password: string, adminId: string, ip?: string) {
    const existing = await this.requireUser(id);
    const passwordHash = await this.auth.hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });

      const revoked = await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.recordIn(tx, {
        actorId: adminId,
        action: 'USER_PASSWORD_RESET',
        entity: 'user',
        entityId: id,
        // The password itself is of course never recorded.
        meta: { email: existing.email, sessionsRevoked: revoked.count },
        ip,
      });
    });

    return { id, passwordReset: true };
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!user) throw new NotFoundException(`User ${id} was not found.`);
    return user;
  }

  /** Locking every administrator out of the system is not a recoverable state. */
  private async ensureNotLastAdmin(id: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null, id: { not: id } },
    });
    if (others === 0) {
      throw new ConflictException(
        'This is the only active administrator. Promote another before changing this one.',
      );
    }
  }

  /** Turn a unique-violation race into the same message the pre-check gives. */
  private asConflict(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return new ConflictException(`Another user already uses that ${target}.`);
    }
    return error instanceof Error ? error : new BadRequestException(String(error));
  }
}
