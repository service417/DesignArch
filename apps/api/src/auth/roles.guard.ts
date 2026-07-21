import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../domain/stage.types';
import { AuditService } from '../audit/audit.service';
import { IS_PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
import { AuthenticatedRequest } from './authenticated-request';

/**
 * Deny-by-default RBAC guard.
 *
 * Every permission-denied event is written to the audit log with the user,
 * timestamp and attempted action, which FR-1.4 requires and which is the
 * backbone of dispute resolution.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const attempted = `${request.method} ${request.route?.path ?? request.url}`;

    // JwtAuthGuard runs first, so an absent user here means the route was never
    // authenticated — treat it as a denial rather than assuming good faith.
    if (!user) {
      await this.deny(null, attempted, request.ip, 'unauthenticated');
      throw new ForbiddenException('Authentication is required for this action.');
    }

    const allowedRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Deny-by-default: an unannotated route is closed, not open.
    if (!allowedRoles || allowedRoles.length === 0) {
      this.logger.error(
        `Route '${attempted}' declares no @Roles() and is not @Public(); denying. ` +
          `Annotate it explicitly.`,
      );
      await this.deny(user.id, attempted, request.ip, 'route_not_annotated');
      throw new ForbiddenException('This action is not permitted.');
    }

    if (!allowedRoles.includes(user.role)) {
      await this.deny(user.id, attempted, request.ip, `role_${user.role}`);
      throw new ForbiddenException(
        `Your role (${user.role}) is not permitted to perform this action.`,
      );
    }

    return true;
  }

  private async deny(
    actorId: string | null,
    attempted: string,
    ip: string | undefined,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      actorId,
      action: 'PERMISSION_DENIED',
      entity: 'route',
      meta: { attempted, reason },
      ip,
    });
  }
}
