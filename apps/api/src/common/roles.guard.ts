import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@petjada/shared';
import type { AuthenticatedRequest } from './auth.guard';
import { ApiError } from './api-error';

export const ROLES_KEY = 'petjada:roles';

/** Restringeix un handler o controlador a certs rols. Cal `AuthGuard` abans. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

export function hasRole(user: { role: UserRole } | undefined, roles: UserRole[]): boolean {
  return !!user && roles.includes(user.role);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!hasRole(req.user, roles)) {
      throw new ApiError(403, 'FORBIDDEN', 'No tens permís per fer això');
    }
    return true;
  }
}
