import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

/**
 * Carrega `.env` de l'arrel del monorepo (i, si n'hi ha, el del directori de
 * treball). Les variables ja definides al procés tenen prioritat.
 */
function loadEnv(): void {
  const candidates = [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

loadEnv();

function str(name: string, fallback: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  return fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`La variable d'entorn ${name} ha de ser numèrica (valor: "${raw}")`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Converteix una durada tipus `15m`, `12h`, `30d` o `900` (segons) a segons. */
export function parseDurationSeconds(raw: string): number {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(raw.trim());
  if (!m) throw new Error(`Durada no vàlida: "${raw}"`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };
  return n * mult[unit];
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  mapboxToken: string;
  /** URL pública de la PWA (redirecció de l'enllaç màgic i enllaços dels correus). */
  appUrl: string;

  // --- auth ---
  jwtSecret: string;
  /** Vida de l'access token, en segons. */
  accessTtlS: number;
  /** Vida del refresh token, en dies. */
  refreshTtlDays: number;
  /** Nom de la cookie del refresh token. */
  refreshCookieName: string;
  /** `Secure` a la cookie del refresh token. */
  cookieSecure: boolean;
  /** Vida de l'enllaç màgic i del codi, en minuts. */
  loginTokenTtlMin: number;
  /** Intents màxims per codi. */
  loginCodeMaxAttempts: number;
  /** Peticions per minut i IP als endpoints d'auth sensibles. */
  authRateLimitPerMin: number;
  /** Peticions per minut i IP als endpoints d'auth lleugers (guest, refresh). */
  authRateLimitLightPerMin: number;

  // --- correu ---
  smtpHost: string;
  smtpPort: number;
  /** TLS implícit (port 465). Si no, STARTTLS. */
  smtpSecure: boolean;
  /** Nom de servidor per al TLS (SNI) si el certificat no coincideix amb SMTP_HOST. Buit = el host. */
  smtpTlsServername: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;

  // --- joc ---
  captureRadiusM: number;
  maxCaptureAccuracyM: number;
  maxWalkingSpeedMps: number;
  objectSpacingM: number;
  nearbyRadiusM: number;
  completionCoverage: number;
  coverageBufferM: number;
  turnaroundRadiusM: number;
  bonusPointsPerKm: number;
  walkingDetourFactor: number;
  autoRouteCandidates: number;
  maxWaypoints: number;
  objectBasePoints: number;
  objectPointsPerStep: number;
  objectPointsStepM: number;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    port: num('PORT', 3000),
    databaseUrl: str('DATABASE_URL', 'postgres://petjada:petjada@localhost:5432/petjada'),
    corsOrigin: str('CORS_ORIGIN', '*'),
    mapboxToken: process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN || '',
    appUrl: str('APP_URL', 'https://localhost:5173'),

    jwtSecret: str('JWT_SECRET', 'canvia-aixo-en-produccio'),
    accessTtlS: parseDurationSeconds(str('JWT_ACCESS_TTL', '15m')),
    refreshTtlDays: num('REFRESH_TTL_DAYS', 30),
    refreshCookieName: str('REFRESH_COOKIE_NAME', 'petjada_refresh'),
    cookieSecure: bool('COOKIE_SECURE', true),
    loginTokenTtlMin: num('LOGIN_TOKEN_TTL_MIN', 15),
    loginCodeMaxAttempts: num('LOGIN_CODE_MAX_ATTEMPTS', 5),
    authRateLimitPerMin: num('AUTH_RATE_LIMIT_PER_MIN', 10),
    authRateLimitLightPerMin: num('AUTH_RATE_LIMIT_LIGHT_PER_MIN', 30),

    smtpHost: str('SMTP_HOST', ''),
    smtpPort: num('SMTP_PORT', 587),
    smtpSecure: bool('SMTP_SECURE', num('SMTP_PORT', 587) === 465),
    smtpTlsServername: str('SMTP_TLS_SERVERNAME', ''),
    smtpUser: str('SMTP_USER', ''),
    smtpPass: str('SMTP_PASS', ''),
    smtpFrom: str('SMTP_FROM', 'Petjada <no-reply@petjada.app>'),

    captureRadiusM: num('CAPTURE_RADIUS_M', 18),
    maxCaptureAccuracyM: num('MAX_CAPTURE_ACCURACY_M', 30),
    maxWalkingSpeedMps: num('MAX_WALKING_SPEED_MPS', 4),
    objectSpacingM: num('OBJECT_SPACING_M', 250),
    nearbyRadiusM: num('NEARBY_RADIUS_M', 10000),
    completionCoverage: num('COMPLETION_COVERAGE', 0.9),
    coverageBufferM: num('COVERAGE_BUFFER_M', 20),
    turnaroundRadiusM: num('TURNAROUND_RADIUS_M', 30),
    bonusPointsPerKm: num('BONUS_POINTS_PER_KM', 20),
    walkingDetourFactor: num('WALKING_DETOUR_FACTOR', 1.3),
    autoRouteCandidates: num('AUTO_ROUTE_CANDIDATES', 6),
    maxWaypoints: num('MAX_WAYPOINTS', 25),
    objectBasePoints: num('OBJECT_BASE_POINTS', 10),
    objectPointsPerStep: num('OBJECT_POINTS_PER_STEP', 2),
    objectPointsStepM: num('OBJECT_POINTS_STEP_M', 100),
  };
  return cached;
}

/** Token d'injecció per a la configuració. */
export const APP_CONFIG = Symbol('APP_CONFIG');
