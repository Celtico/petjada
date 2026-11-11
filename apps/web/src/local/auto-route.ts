import type { LngLat } from '@petjada/shared';
import { destination as destinationPoint, haversineM } from '../map/geo';

/**
 * Lògica pura de la generació automàtica de rutes: es proven diversos rumbs
 * des de l'origen i es tria el candidat la longitud del qual s'acosta més a
 * l'objectiu. Sense crides externes: fàcil de provar.
 */

/** Distància en línia recta que cal demanar a Directions per acostar-se a `targetLengthM` a peu. */
export function straightLineTargetM(targetLengthM: number, roundTrip: boolean, detourFactor: number): number {
  const oneWay = roundTrip ? targetLengthM / 2 : targetLengthM;
  return oneWay / detourFactor;
}

/** `count` rumbs equiespaiats a partir d'un desplaçament aleatori. */
export function candidateBearings(count: number, random: () => number = Math.random): number[] {
  const offset = random() * 360;
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => (offset + i * step) % 360);
}

export interface AutoCandidate {
  bearing: number;
  waypoints: LngLat[];
}

/**
 * Construeix els waypoints d'un candidat. Per a rutes d'anada (sense tornada)
 * s'afegeix un punt intermedi desplaçat lateralment perquè la ruta no sigui una
 * recta avorrida; per a anada i tornada, només l'origen i la destinació.
 */
export function buildCandidate(
  origin: LngLat,
  bearing: number,
  straightM: number,
  roundTrip: boolean,
  lateralFraction = 0.25,
): AutoCandidate {
  const dest = destinationPoint(origin, bearing, straightM);
  if (roundTrip) return { bearing, waypoints: [origin, dest] };
  const side = bearing % 2 < 1 ? 1 : -1;
  const mid = destinationPoint(origin, bearing, straightM / 2);
  const via = destinationPoint(mid, bearing + side * 90, straightM * lateralFraction);
  return { bearing, waypoints: [origin, via, dest] };
}

/** Tria el candidat amb la longitud total més propera a l'objectiu. */
export function pickClosest<T extends { lengthM: number }>(candidates: T[], targetLengthM: number): T | null {
  let best: T | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const diff = Math.abs(c.lengthM - targetLengthM);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}

/** Nom i descripció per defecte d'una ruta generada. */
export function suggestedNames(lengthM: number, roundTrip: boolean, now: Date): { name: string; description: string } {
  const km = lengthM >= 950 ? `${(lengthM / 1000).toFixed(lengthM >= 9950 ? 0 : 1).replace('.0', '')} km` : `${Math.round(lengthM)} m`;
  const name = roundTrip ? `Anada i tornada de ${km}` : `Ruta de ${km}`;
  const date = now.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  return { name, description: `Generada automàticament des de la teva ubicació el ${date}.` };
}

export { haversineM };
