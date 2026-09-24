import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../config';

/** Path de la cookie: només viatja cap als endpoints d'auth. */
export const REFRESH_COOKIE_PATH = '/api/auth';

function options(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, config: AppConfig, rawToken: string): void {
  res.cookie(config.refreshCookieName, rawToken, {
    ...options(config),
    maxAge: config.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.refreshCookieName, options(config));
}

export function readRefreshCookie(req: Request, config: AppConfig): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const value = cookies?.[config.refreshCookieName];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
