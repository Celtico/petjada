import type { LngLat } from '@petjada/shared';
import { bearingDeg, haversineM } from '../map/geo';

export interface Footprint {
  lon: number;
  lat: number;
  /** Rumb en graus (0 = nord). */
  heading: number;
  /** Peu esquerre o dret, per alternar-los al rastre. */
  side: 'left' | 'right';
}

/**
 * Genera petjades a partir de posicions filtrades: una cada `spacingM`,
 * orientada segons el rumb entre l'última petjada i la posició nova.
 */
export class FootprintTrail {
  private readonly footprints: Footprint[] = [];
  private lastAnchor: LngLat | null = null;
  private nextSide: Footprint['side'] = 'left';

  constructor(private readonly spacingM: number) {}

  get all(): readonly Footprint[] {
    return this.footprints;
  }

  reset(): void {
    this.footprints.length = 0;
    this.lastAnchor = null;
  }

  /** Retorna les petjades noves afegides amb aquesta posició. */
  push(position: LngLat): Footprint[] {
    if (!this.lastAnchor) {
      this.lastAnchor = position;
      return [];
    }
    const added: Footprint[] = [];
    let dist = haversineM(this.lastAnchor, position);
    while (dist >= this.spacingM) {
      const heading = bearingDeg(this.lastAnchor, position);
      const ratio = this.spacingM / dist;
      const next: LngLat = {
        lon: this.lastAnchor.lon + (position.lon - this.lastAnchor.lon) * ratio,
        lat: this.lastAnchor.lat + (position.lat - this.lastAnchor.lat) * ratio,
      };
      const fp: Footprint = { ...next, heading, side: this.nextSide };
      this.nextSide = this.nextSide === 'left' ? 'right' : 'left';
      this.footprints.push(fp);
      added.push(fp);
      this.lastAnchor = next;
      dist = haversineM(this.lastAnchor, position);
    }
    return added;
  }
}
