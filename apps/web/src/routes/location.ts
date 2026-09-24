import type { LngLat } from '@petjada/shared';
import { getCurrentPosition } from '../gps/real-position-source';
import type { PositionSourceError } from '../gps/types';
import { simulation } from '../sim';

let lastKnown: LngLat | null = null;

/** Es resol amb la posició simulada si la simulació s'activa mentre esperem el GPS real. */
function whenSimulationActivates(): { promise: Promise<LngLat>; cancel: () => void } {
  let cancel = () => {};
  const promise = new Promise<LngLat>((resolve) => {
    if (!simulation.enabled) return;
    const off = simulation.onChange((active) => {
      if (!active) return;
      off();
      resolve(simulation.position.currentPosition);
    });
    cancel = off;
  });
  return { promise, cancel };
}

/**
 * Ubicació puntual per a llistats i creació de rutes. Amb la simulació activa,
 * retorna la posició simulada.
 */
export async function locate(): Promise<LngLat> {
  const simulated = simulation.currentPosition();
  if (simulated) {
    lastKnown = simulated;
    return simulated;
  }
  const sim = whenSimulationActivates();
  try {
    const real = getCurrentPosition().then((reading): LngLat => ({ lon: reading.lon, lat: reading.lat }));
    lastKnown = await Promise.race([real, sim.promise]);
    return lastKnown;
  } catch (error) {
    if (lastKnown) return lastKnown;
    throw error as PositionSourceError;
  } finally {
    sim.cancel();
  }
}

export function lastKnownLocation(): LngLat | null {
  return lastKnown;
}

export function setLastKnownLocation(position: LngLat): void {
  lastKnown = position;
}
