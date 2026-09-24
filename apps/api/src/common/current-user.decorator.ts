import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.guard';

/**
 * Injecta l'usuari autenticat (`{ id, role, isGuest }`) a un handler protegit
 * per `AuthGuard`. Amb `@OptionalAuth()` pot ser `undefined`.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req.user;
});
