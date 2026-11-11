/**
 * Configuració de la PWA. Tots els llindars venen de variables d'entorn
 * (`VITE_*` al `.env` de l'arrel) amb valors per defecte sensats.
 */

import type { UserRole } from '@petjada/shared';

const env = import.meta.env as Record<string, string | undefined>;

function num(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function str(name: string, fallback: string): string {
  const raw = env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

export const config = {
  mapboxToken: str('VITE_MAPBOX_TOKEN', ''),
  apiUrl: str('VITE_API_URL', '/api'),
  /**
   * `server`: la PWA parla amb l'API NestJS. `local`: sense servidor, les dades
   * es desen en una base SQLite dins del navegador (per publicar a GitHub Pages).
   */
  backend: str('VITE_BACKEND', 'server') === 'local' ? ('local' as const) : ('server' as const),

  /** Radi de captura (m). El servidor també el valida. */
  captureRadiusM: num('VITE_CAPTURE_RADIUS_M', 18),
  /** Rang de visibilitat dels objectes (m). */
  visibilityRangeM: num('VITE_VISIBILITY_RANGE_M', 180),
  /** FOV vertical de la càmera del mòbil (graus). */
  cameraFovDeg: num('VITE_CAMERA_FOV_DEG', 65),
  /** Precisió mínima acceptable d'una lectura GPS (m). */
  minAccuracyM: num('VITE_MIN_ACCURACY_M', 25),
  /** Velocitat màxima caminant (m/s), per descartar salts. */
  maxWalkingSpeedMps: num('VITE_MAX_WALKING_SPEED_MPS', 3),
  /** Error angular per entrar a LOCKED (graus). */
  lockAngleDeg: num('VITE_LOCK_ANGLE_DEG', 8),
  /** Error angular per sortir de LOCKED (graus, histèresi). */
  unlockAngleDeg: num('VITE_UNLOCK_ANGLE_DEG', 15),
  /** Temps mantenint l'alineació per confirmar LOCKED (ms). */
  lockHoldMs: num('VITE_LOCK_HOLD_MS', 400),
  /** Velocitat de rotació a partir de la qual es considera que el mòbil es mou (graus/s). */
  movingRateDps: num('VITE_MOVING_RATE_DPS', 30),
  enableSim: bool('VITE_ENABLE_SIM', false),

  /** Interval d'enviament del track al servidor (ms). */
  trackFlushIntervalMs: num('VITE_TRACK_FLUSH_INTERVAL_MS', 15000),
  /** Mida de la finestra de lectures per a la mitjana ponderada. */
  gpsWindowSize: num('VITE_GPS_WINDOW_SIZE', 5),
  /** Altura d'ulls per a la càmera AR (m). */
  eyeHeightM: num('VITE_EYE_HEIGHT_M', 1.6),
  /** Quan l'usuari és quiet, interval mínim entre lectures GPS processades (ms). */
  stillGpsIntervalMs: num('VITE_STILL_GPS_INTERVAL_MS', 10000),
  /** Període de la flotació dels objectes (ms). */
  objectFloatPeriodMs: num('VITE_OBJECT_FLOAT_PERIOD_MS', 3000),
  /** Alpha del filtre passa-baix del heading i pitch (0..1). */
  headingLpfAlpha: num('VITE_HEADING_LPF_ALPHA', 0.15),
  /** Llindar d'imprecisió de la brúixola (graus) per demanar calibratge. */
  compassCalibrationDeg: num('VITE_COMPASS_CALIBRATION_DEG', 20),
  /** Distància entre petjades del rastre (m). */
  footprintSpacingM: num('VITE_FOOTPRINT_SPACING_M', 3),
  /** Acceleració (m/s²) per sota de la qual el mòbil es considera quiet. */
  stillAccelThreshold: num('VITE_STILL_ACCEL_THRESHOLD', 0.6),
  /** Temps sense moviment per passar a mode quiet (ms). */
  stillAfterMs: num('VITE_STILL_AFTER_MS', 20000),
  /** Velocitat de la simulació (m/s). */
  simSpeedMps: num('VITE_SIM_SPEED_MPS', 1.2),
  /** Precisió simulada (m). */
  simAccuracyM: num('VITE_SIM_ACCURACY_M', 8),
  /** Radi de cerca de rutes (m), per informar a la UI. */
  nearbyRadiusM: num('VITE_NEARBY_RADIUS_M', 10000),
} as const;

function role(name: string): UserRole {
  const raw = env[name];
  return raw === 'editor' || raw === 'admin' ? raw : 'player';
}

/**
 * Regles del joc quan `backend` és `local`. Són les mateixes que l'API llegeix
 * de les seves variables d'entorn (vegeu `apps/api/src/config.ts`).
 */
export const localConfig = {
  /** Rol de l'usuari local. `editor` o `admin` obren l'editor de col·leccions i fitxes. */
  role: role('VITE_LOCAL_ROLE'),
  captureRadiusM: config.captureRadiusM,
  nearbyRadiusM: config.nearbyRadiusM,
  maxCaptureAccuracyM: num('VITE_LOCAL_MAX_CAPTURE_ACCURACY_M', 30),
  maxWalkingSpeedMps: num('VITE_LOCAL_MAX_WALKING_SPEED_MPS', 4),
  objectSpacingM: num('VITE_LOCAL_OBJECT_SPACING_M', 250),
  completionCoverage: num('VITE_LOCAL_COMPLETION_COVERAGE', 0.9),
  coverageBufferM: num('VITE_LOCAL_COVERAGE_BUFFER_M', 20),
  /** Distància entre mostres de la ruta per calcular la cobertura (m). */
  coverageSampleM: num('VITE_LOCAL_COVERAGE_SAMPLE_M', 5),
  turnaroundRadiusM: num('VITE_LOCAL_TURNAROUND_RADIUS_M', 30),
  bonusPointsPerKm: num('VITE_LOCAL_BONUS_POINTS_PER_KM', 20),
  walkingDetourFactor: num('VITE_LOCAL_WALKING_DETOUR_FACTOR', 1.3),
  autoRouteCandidates: num('VITE_LOCAL_AUTO_ROUTE_CANDIDATES', 6),
  maxWaypoints: num('VITE_LOCAL_MAX_WAYPOINTS', 25),
  objectBasePoints: num('VITE_LOCAL_OBJECT_BASE_POINTS', 10),
  objectPointsPerStep: num('VITE_LOCAL_OBJECT_POINTS_PER_STEP', 2),
  objectPointsStepM: num('VITE_LOCAL_OBJECT_POINTS_STEP_M', 100),
} as const;

export type LocalConfig = { -readonly [K in keyof typeof localConfig]: (typeof localConfig)[K] };

/**
 * Prefixa una ruta absoluta de `public/` amb la base del desplegament
 * (`/petjada/` a GitHub Pages). Les URL externes no es toquen.
 */
export function assetUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const base = env.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}${path}`;
}

export type AppConfig = typeof config;
