import { SetMetadata } from '@nestjs/common';
import { Role } from '../domain/stage.types';

export const ROLES_KEY = 'designarc:roles';

/**
 * Declare which roles may reach a route.
 *
 * Authorisation is deny-by-default (Blueprint §10.2): a route with no @Roles()
 * and no @Public() is unreachable. That inversion is deliberate — forgetting to
 * annotate a new endpoint locks it down rather than exposing it.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'designarc:public';

/** Opt a route out of authentication entirely (login, refresh, password reset). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
