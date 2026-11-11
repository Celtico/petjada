import type { TrackPointDto } from '@petjada/shared';

/**
 * Prepara els punts d'un lot de track abans de desar-los: descarta els de mala
 * precisió, els ordena per temps i garanteix almenys dos punts (una LineString
 * d'un sol punt no és vàlida), duplicant-lo si cal.
 */
export function prepareTrackPoints(points: TrackPointDto[], maxAccuracyM: number): TrackPointDto[] {
  const kept = points
    .filter((p) => Number.isFinite(p.accuracy) && p.accuracy <= maxAccuracyM)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (kept.length === 1) return [kept[0], kept[0]];
  return kept;
}

/** Bonus per completar una ruta: proporcional a la longitud. */
export function completionBonus(lengthM: number, bonusPointsPerKm: number): number {
  return Math.round((lengthM / 1000) * bonusPointsPerKm);
}

/** Una ruta està completada si s'ha cobert prou i, si és d'anada i tornada, s'ha arribat al gir. */
export function isRouteCompleted(coverage: number, reachedTurnaround: boolean, roundTrip: boolean, minCoverage: number): boolean {
  if (coverage < minCoverage) return false;
  return roundTrip ? reachedTurnaround : true;
}
