import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '@petjada/shared';
import { ApiError } from './api-error';

export interface AuthUser {
  id: string;
  role: UserRole;
  isGuest: boolean;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  isGuest: boolean;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const OPTIONAL_AUTH_KEY = 'petjada:optional-auth';
/** El handler accepta peticions sense Bearer; si n'hi ha, s'omple `req.user`. */
export const OptionalAuth = (): MethodDecorator => SetMetadata(OPTIONAL_AUTH_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const optional = this.reflector.get<boolean | undefined>(OPTIONAL_AUTH_KEY, context.getHandler()) === true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      if (optional) return true;
      throw new ApiError(401, 'UNAUTHORIZED', 'Cal iniciar sessió');
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { id: payload.sub, role: payload.role, isGuest: payload.isGuest };
      return true;
    } catch {
      if (optional) return true;
      throw new ApiError(401, 'UNAUTHORIZED', 'La sessió ha caducat o el token no és vàlid');
    }
  }
}
