import type { Leg, LngLat } from '@petjada/shared';
import { bearingDeg, haversineM } from '../map/geo';

export interface VisibilityOptions {
  visibilityRangeM: number;
  captureRadiusM: number;
  /** Precisió màxima del GPS per poder capturar (m). */
  maxAccuracyM: number;
}

export interface ObjectLike {
  id: string;
  lon: number;
  lat: number;
  leg: Leg;
}

export interface ObjectView<T extends ObjectLike = ObjectLike> {
  object: T;
  distanceM: number;
  bearing: number;
  visible: boolean;
  capturable: boolean;
  /** Escala relativa (1 a prop, més petit lluny). */
  scale: number;
}

/** Escala del billboard segons la distància: 1 dins de 20 m, 0.35 al límit del rang. */
export function scaleForDistance(distanceM: number, rangeM: number): number {
  const near = 20;
  if (distanceM <= near) return 1;
  const ratio = Math.min(1, (distanceM - near) / Math.max(1, rangeM - near));
  return 1 - ratio * 0.65;
}

/**
 * Calcula, per a cada objecte pendent, si és visible (dins del rang i el tram
 * desbloquejat) i capturable (dins del radi i amb bona precisió).
 */
export function computeObjectViews<T extends ObjectLike>(
  objects: readonly T[],
  user: LngLat | null,
  accuracyM: number | null,
  reachedTurnaround: boolean,
  options: VisibilityOptions,
): ObjectView<T>[] {
  return objects.map((object) => {
    if (!user) return { object, distanceM: Infinity, bearing: 0, visible: false, capturable: false, scale: 0 };
    const distanceM = haversineM(user, object);
    const legUnlocked = object.leg === 'anada' || reachedTurnaround;
    const visible = legUnlocked && distanceM <= options.visibilityRangeM;
    const goodAccuracy = accuracyM !== null && accuracyM <= options.maxAccuracyM;
    const capturable = visible && goodAccuracy && distanceM <= options.captureRadiusM;
    return {
      object,
      distanceM,
      bearing: bearingDeg(user, object),
      visible,
      capturable,
      scale: scaleForDistance(distanceM, options.visibilityRangeM),
    };
  });
}

/** El més proper dels visibles, o `null`. */
export function nearestVisible<T extends ObjectLike>(views: readonly ObjectView<T>[]): ObjectView<T> | null {
  let best: ObjectView<T> | null = null;
  for (const v of views) {
    if (!v.visible) continue;
    if (!best || v.distanceM < best.distanceM) best = v;
  }
  return best;
}

/** El més proper de tots els pendents desbloquejats (encara que no sigui visible). */
export function nearestPending<T extends ObjectLike>(
  views: readonly ObjectView<T>[],
  reachedTurnaround: boolean,
): ObjectView<T> | null {
  let best: ObjectView<T> | null = null;
  for (const v of views) {
    if (v.object.leg === 'tornada' && !reachedTurnaround) continue;
    if (!best || v.distanceM < best.distanceM) best = v;
  }
  return best;
}
