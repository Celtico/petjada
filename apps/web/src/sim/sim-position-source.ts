import type { LngLat, Position } from '@petjada/shared';
import { Emitter } from '../gps/emitter';
import type { PositionErrorListener, PositionListener, PositionReading, PositionSource, PositionSourceError } from '../gps/types';
import { destination, bearingDeg, haversineM, lineLengthM, pointAlongLine } from '../map/geo';

export type SimMode = 'follow' | 'click';

export interface SimPositionOptions {
  /** Velocitat base (m/s). */
  speedMps: number;
  /** Precisió simulada (m). */
  accuracyM: number;
  /** Interval entre lectures (ms). */
  tickMs: number;
}

/**
 * Font de posició simulada. Dos modes:
 *  - `follow`: reprodueix un track (la geometria de la ruta, amb la tornada si cal).
 *  - `click`: es mou cap a l'últim punt tocat al mapa, a passos de velocitat de
 *    caminar (× multiplicador) perquè el filtre de salts no descarti les lectures.
 */
export class SimPositionSource implements PositionSource {
  readonly kind = 'sim' as const;
  private readonly readings = new Emitter<PositionReading>();
  private readonly errors = new Emitter<PositionSourceError>();
  private readonly progress = new Emitter<number>();
  private timer: number | null = null;
  private mode: SimMode = 'click';
  private track: Position[] = [];
  private trackLengthM = 0;
  private distanceAlongM = 0;
  private playing = false;
  private multiplier = 1;
  private position: LngLat;
  private target: LngLat | null = null;
  private lastHeading = 0;

  constructor(
    initial: LngLat,
    private options: SimPositionOptions,
  ) {
    this.position = initial;
  }

  // --- PositionSource ---

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), this.options.tickMs);
    this.emitReading();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  onReading(listener: PositionListener): () => void {
    return this.readings.on(listener);
  }

  onError(listener: PositionErrorListener): () => void {
    return this.errors.on(listener);
  }

  // --- Control ---

  get currentPosition(): LngLat {
    return this.position;
  }

  get currentHeading(): number {
    return this.lastHeading;
  }

  get currentMode(): SimMode {
    return this.mode;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get progressFraction(): number {
    return this.trackLengthM > 0 ? Math.min(1, this.distanceAlongM / this.trackLengthM) : 0;
  }

  onProgress(listener: (fraction: number) => void): () => void {
    return this.progress.on(listener);
  }

  setMode(mode: SimMode): void {
    this.mode = mode;
    this.playing = false;
    this.target = null;
  }

  setMultiplier(multiplier: number): void {
    this.multiplier = multiplier;
  }

  setAccuracy(accuracyM: number): void {
    this.options = { ...this.options, accuracyM };
  }

  /** Track a reproduir (anada; si `roundTrip`, s'hi afegeix la tornada invertida). */
  setTrack(coords: Position[], roundTrip: boolean): void {
    const forward = [...coords];
    this.track = roundTrip ? forward.concat([...forward].reverse().slice(1)) : forward;
    this.trackLengthM = lineLengthM(this.track);
    this.distanceAlongM = 0;
    if (this.track.length) this.position = { lon: this.track[0][0], lat: this.track[0][1] };
    this.progress.emit(0);
  }

  get hasTrack(): boolean {
    return this.track.length > 1;
  }

  play(): void {
    if (!this.hasTrack) return;
    this.mode = 'follow';
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  reset(): void {
    this.distanceAlongM = 0;
    if (this.track.length) this.position = { lon: this.track[0][0], lat: this.track[0][1] };
    this.playing = false;
    this.progress.emit(0);
    this.emitReading();
  }

  /** Mode `click`: nou destí. */
  moveTo(target: LngLat): void {
    this.mode = 'click';
    this.target = target;
  }

  /** Teletransport (p. ex. per situar l'inici). */
  jumpTo(position: LngLat): void {
    this.position = position;
    this.target = null;
    this.emitReading();
  }

  private tick(): void {
    const step = (this.options.speedMps * this.multiplier * this.options.tickMs) / 1000;
    if (this.mode === 'follow' && this.playing && this.hasTrack) {
      this.distanceAlongM = Math.min(this.trackLengthM, this.distanceAlongM + step);
      const { point, bearing } = pointAlongLine(this.track, this.distanceAlongM);
      this.position = point;
      this.lastHeading = bearing;
      this.progress.emit(this.progressFraction);
      if (this.distanceAlongM >= this.trackLengthM) this.playing = false;
    } else if (this.mode === 'click' && this.target) {
      const dist = haversineM(this.position, this.target);
      if (dist <= step) {
        this.position = this.target;
        this.target = null;
      } else {
        this.lastHeading = bearingDeg(this.position, this.target);
        this.position = destination(this.position, this.lastHeading, step);
      }
    }
    this.emitReading();
  }

  private emitReading(): void {
    // Soroll petit perquè el filtre tingui feina però sense disparar el salt.
    const noise = this.options.accuracyM * 0.15;
    const jittered = destination(this.position, Math.random() * 360, Math.random() * noise);
    this.readings.emit({
      lon: jittered.lon,
      lat: jittered.lat,
      accuracy: this.options.accuracyM,
      timestamp: Date.now(),
      heading: this.lastHeading,
      speed: this.playing || this.target ? this.options.speedMps * this.multiplier : 0,
    });
  }
}
