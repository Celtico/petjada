import { haversineM } from '../map/geo';
import type { PositionReading } from './types';

export interface PositionFilterOptions {
  /** Lectures amb `accuracy` superior es descarten. */
  maxAccuracyM: number;
  /** Velocitat màxima plausible caminant (m/s); per sobre, la lectura és un salt. */
  maxSpeedMps: number;
  /** Nombre de lectures recents sobre les quals es fa la mitjana ponderada. */
  windowSize: number;
  /** Nombre de salts consecutius a partir del qual s'accepta la nova posició (reinici). */
  maxConsecutiveJumps?: number;
}

export interface FilteredPosition {
  lon: number;
  lat: number;
  /** Precisió efectiva (mitjana ponderada de les precisions de la finestra). */
  accuracy: number;
  timestamp: number;
  /** Nombre de lectures que han contribuït. */
  samples: number;
}

export type RejectReason = 'accuracy' | 'jump';

/**
 * Filtre de posició: descarta lectures imprecises i salts impossibles, i
 * retorna una mitjana ponderada per 1/accuracy² sobre una finestra de lectures.
 *
 * És una classe pura (no toca el DOM) perquè es pugui provar i reutilitzar
 * amb la simulació.
 */
export class PositionFilter {
  private readonly window: PositionReading[] = [];
  private consecutiveJumps = 0;
  private lastAccepted: PositionReading | null = null;
  private readonly maxConsecutiveJumps: number;

  constructor(private readonly options: PositionFilterOptions) {
    this.maxConsecutiveJumps = options.maxConsecutiveJumps ?? 5;
  }

  reset(): void {
    this.window.length = 0;
    this.consecutiveJumps = 0;
    this.lastAccepted = null;
  }

  /** Retorna la posició filtrada o el motiu de rebuig. */
  push(reading: PositionReading): { accepted: true; position: FilteredPosition } | { accepted: false; reason: RejectReason } {
    if (!Number.isFinite(reading.accuracy) || reading.accuracy > this.options.maxAccuracyM) {
      return { accepted: false, reason: 'accuracy' };
    }

    if (this.lastAccepted) {
      const dt = (reading.timestamp - this.lastAccepted.timestamp) / 1000;
      const dist = haversineM(this.lastAccepted, reading);
      // Tolerància: el salt es mesura descomptant la incertesa de les dues lectures.
      const slack = this.lastAccepted.accuracy + reading.accuracy;
      const effective = Math.max(0, dist - slack);
      if (dt > 0 && effective / dt > this.options.maxSpeedMps) {
        this.consecutiveJumps++;
        if (this.consecutiveJumps < this.maxConsecutiveJumps) {
          return { accepted: false, reason: 'jump' };
        }
        // Massa salts seguits: probablement la posició anterior era dolenta. Reiniciem.
        this.window.length = 0;
      }
    }

    this.consecutiveJumps = 0;
    this.lastAccepted = reading;
    this.window.push(reading);
    while (this.window.length > this.options.windowSize) this.window.shift();

    return { accepted: true, position: this.average() };
  }

  get current(): FilteredPosition | null {
    return this.window.length ? this.average() : null;
  }

  private average(): FilteredPosition {
    let wSum = 0;
    let lon = 0;
    let lat = 0;
    let acc = 0;
    for (const r of this.window) {
      const w = 1 / Math.max(1, r.accuracy) ** 2;
      wSum += w;
      lon += r.lon * w;
      lat += r.lat * w;
      acc += r.accuracy * w;
    }
    const last = this.window[this.window.length - 1];
    return {
      lon: lon / wSum,
      lat: lat / wSum,
      accuracy: acc / wSum,
      timestamp: last.timestamp,
      samples: this.window.length,
    };
  }
}
