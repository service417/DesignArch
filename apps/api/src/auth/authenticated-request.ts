import { Request } from 'express';
import { Role } from '../domain/stage.types';

/** The identity the JWT strategy attaches to every authenticated request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * Express already declares `route` (as `any`), so it is not redeclared here —
 * narrowing a required base property to an optional one is a type error, and
 * `req.route?.path` reads fine through the inherited declaration.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
