import { OBJECT_TYPES, type Leg, type ObjectType } from '@petjada/shared';

/**
 * Lògica pura de col·locació d'objectes al llarg de la línia de la ruta.
 * La interpolació geogràfica (`ST_LineInterpolatePoint`) es fa a PostGIS;
 * aquí només es decideixen les fraccions, els trams, els tipus i els punts.
 */

export interface PlacementSlot {
  index: number;
  /** Fracció (0..1) al llarg de la línia d'anada. */
  fraction: number;
  leg: Leg;
  /** Distància caminada real des de l'inici fins a l'objecte, en metres. */
  distanceFromStartM: number;
}

export interface PointsConfig {
  objectBasePoints: number;
  objectPointsPerStep: number;
  objectPointsStepM: number;
}

/** Distància caminada fins a un punt de la línia segons el tram. */
export function walkedDistanceM(fraction: number, lineLengthM: number, leg: Leg): number {
  const along = fraction * lineLengthM;
  return leg === 'anada' ? along : lineLengthM + (lineLengthM - along);
}

/**
 * Un objecte cada `spacingM` metres, començant a `spacingM / 2` i mai al punt
 * final. En rutes d'anada i tornada s'alternen els trams (parell → anada,
 * senar → tornada) perquè hi hagi objectes a tots dos sentits sobre la mateixa línia.
 */
export function placementSlots(lineLengthM: number, spacingM: number, roundTrip: boolean): PlacementSlot[] {
  if (!(lineLengthM > 0) || !(spacingM > 0)) return [];
  const slots: PlacementSlot[] = [];
  for (let k = 0; ; k++) {
    const along = spacingM / 2 + k * spacingM;
    if (along >= lineLengthM) break;
    const fraction = along / lineLengthM;
    const leg: Leg = roundTrip && k % 2 === 1 ? 'tornada' : 'anada';
    slots.push({ index: k, fraction, leg, distanceFromStartM: walkedDistanceM(fraction, lineLengthM, leg) });
  }
  return slots;
}

/** Més lluny de l'inici, més punts. */
export function pointsFor(distanceFromStartM: number, cfg: PointsConfig): number {
  const steps = Math.floor(Math.max(0, distanceFromStartM) / cfg.objectPointsStepM);
  return cfg.objectBasePoints + steps * cfg.objectPointsPerStep;
}

/** Tipus determinista però variat: depèn de l'índex i de la longitud de la línia. */
export function pickType(index: number, lineLengthM: number): ObjectType {
  let h = (Math.imul(Math.round(lineLengthM), 2654435761) + index * 40503) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return OBJECT_TYPES[h % OBJECT_TYPES.length];
}

/** Ordre de visita: primer l'anada (creixent) i després la tornada (decreixent). */
export function sortByWalk<T extends { distanceFromStartM: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.distanceFromStartM - b.distanceFromStartM);
}
