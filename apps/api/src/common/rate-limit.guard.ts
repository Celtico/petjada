import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiError } from './api-error';

export const RATE_LIMIT_KEY = 'petjada:rate-limit';

export type RateLimitTier = 'strict' | 'light';

/** Marca un handler amb un nivell de límit de peticions per IP. */
export const RateLimit = (tier: RateLimitTier): MethodDecorator & ClassDecorator => SetMetadata(RATE_LIMIT_KEY, tier);

interface Bucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;

/**
 * Limitador en memòria per IP i handler, en finestres fixes d'un minut.
 * Suficient per a una sola instància; en producció amb rèpliques caldria
 * un magatzem compartit.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const tier = this.reflector.getAllAndOverride<RateLimitTier | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!tier) return true;
    const limit = tier === 'strict' ? this.config.authRateLimitPerMin : this.config.authRateLimitLightPerMin;
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${ip}:${context.getClass().name}.${context.getHandler().name}`;
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      throw new ApiError(429, 'RATE_LIMITED', "Massa peticions. Espera un minut i torna-ho a provar.");
    }
    return true;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= WINDOW_MS) this.buckets.delete(key);
    }
  }
}
