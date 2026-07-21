import { Request } from 'express';
import { Role } from '../domain/stage.types';

/** The identity the JWT strategy attaches to every authenticated request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  route?: { path?: string };
}
