import type { AuthResponse, UserDto } from '@petjada/shared';
import { api, ApiError, setAccessToken, setUnauthorizedHandler } from '../api/client';

/**
 * Sessió: access token JWT curt NOMÉS en memòria; el refresh token viu en una
 * cookie httpOnly gestionada pel servidor. En obrir l'app:
 * `POST /auth/refresh` → si falla, `POST /auth/guest`.
 */

// ---------------------------------------------------------------------------
// Lògica pura (provable)
// ---------------------------------------------------------------------------

/** Marge abans de la caducitat per renovar l'access token (segons). */
export const REFRESH_MARGIN_S = 30;
/** Retard mínim de renovació per no fer bucles si `expiresIn` és molt curt (ms). */
export const MIN_REFRESH_DELAY_MS = 10000;

/** Mil·lisegons fins a la propera renovació a partir de `expiresIn` (segons). */
export function refreshDelayMs(expiresInS: number): number {
  return Math.max(MIN_REFRESH_DELAY_MS, (expiresInS - REFRESH_MARGIN_S) * 1000);
}

/** `true` si el token caduca abans del marge i cal renovar-lo ara. */
export function needsRefresh(expiresAtMs: number, nowMs: number): boolean {
  return expiresAtMs - nowMs <= REFRESH_MARGIN_S * 1000;
}

export type BootstrapDecision = 'session' | 'guest' | 'offline';

/**
 * Decideix què fer després d'intentar el refresh:
 *  - ha anat bé → ja tenim sessió;
 *  - 401 (no hi ha cookie o és invàlida) → crear convidat;
 *  - altre error (xarxa, 5xx) → no crear convidat (evitem duplicar usuaris), reintentar més tard.
 */
export function decideBootstrap(refreshResult: { ok: true } | { ok: false; statusCode: number }): BootstrapDecision {
  if (refreshResult.ok) return 'session';
  if (refreshResult.statusCode === 401 || refreshResult.statusCode === 403) return 'guest';
  return 'offline';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = (user: UserDto | null) => void;

let currentUser: UserDto | null = null;
let refreshTimer: number | null = null;
let bootstrapping: Promise<UserDto | null> | null = null;
let lastBootstrap: BootstrapDecision | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(currentUser);
}

function applySession(res: AuthResponse): UserDto {
  setAccessToken(res.accessToken);
  currentUser = res.user;
  scheduleRefresh(res.expiresIn);
  emit();
  return res.user;
}

function scheduleRefresh(expiresInS: number): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void session.refresh(), refreshDelayMs(expiresInS));
}

async function tryRefresh(): Promise<{ ok: true } | { ok: false; statusCode: number }> {
  try {
    applySession(await api.auth.refresh());
    return { ok: true };
  } catch (error) {
    return { ok: false, statusCode: error instanceof ApiError ? error.statusCode : 0 };
  }
}

export const session = {
  get user(): UserDto | null {
    return currentUser;
  },

  get lastDecision(): BootstrapDecision | null {
    return lastBootstrap;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Sempre acaba amb un usuari (convidat si cal), excepte si no hi ha xarxa. */
  bootstrap(): Promise<UserDto | null> {
    if (bootstrapping) return bootstrapping;
    bootstrapping = (async () => {
      setUnauthorizedHandler(() => session.refresh());
      const decision = decideBootstrap(await tryRefresh());
      lastBootstrap = decision;
      if (decision === 'session') return currentUser;
      if (decision === 'offline') return null;
      try {
        return applySession(await api.auth.guest());
      } catch (error) {
        console.error('guest login failed', error);
        return null;
      }
    })().finally(() => {
      bootstrapping = null;
    });
    return bootstrapping;
  },

  /** Renova l'access token amb la cookie. `true` si ho ha aconseguit. */
  async refresh(): Promise<boolean> {
    return (await tryRefresh()).ok;
  },

  async requestMagicLink(email: string): Promise<number> {
    return (await api.auth.magicLink({ email })).expiresIn;
  },

  /** Verifica el codi de 6 xifres. Si l'usuari actual és convidat, el servidor fusiona el progrés. */
  async verifyCode(email: string, code: string): Promise<UserDto> {
    return applySession(await api.auth.verifyCode({ email, code }));
  },

  async updateProfile(displayName: string, avatarUrl: string | null): Promise<UserDto> {
    currentUser = await api.users.update({ displayName, avatarUrl });
    emit();
    return currentUser;
  },

  /** Revoca el refresh token i torna a entrar com a convidat nou. */
  async logout(): Promise<void> {
    try {
      await api.auth.logout();
    } catch {
      /* ja tancada */
    }
    await this.resetToGuest();
  },

  /** Esborra el compte i totes les dades (RGPD) i continua com a convidat nou. */
  async deleteAccount(): Promise<void> {
    await api.users.remove();
    await this.resetToGuest();
  },

  async resetToGuest(): Promise<void> {
    setAccessToken(null);
    currentUser = null;
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    emit();
    try {
      applySession(await api.auth.guest());
    } catch (error) {
      console.error('guest login failed', error);
    }
  },

  /** Actualitza els punts totals després d'una captura o finalització. */
  setTotalPoints(totalPoints: number): void {
    if (!currentUser) return;
    currentUser = { ...currentUser, totalPoints };
    emit();
  },

  isEditor(): boolean {
    return currentUser?.role === 'editor' || currentUser?.role === 'admin';
  },
};
