import { Emitter } from '../gps/emitter';
import type { OrientationListener, OrientationReading, OrientationSource } from '../gps/types';
import { angleDiffDeg, normalizeDeg } from '../map/geo';

const TICK_MS = 100;

/** Orientació simulada controlada per sliders (rumb i inclinació). */
export class SimOrientationSource implements OrientationSource {
  readonly kind = 'sim' as const;
  private readonly readings = new Emitter<OrientationReading>();
  private timer: number | null = null;
  private heading = 0;
  private pitch = 0;
  private previousHeading = 0;
  private previousPitch = 0;

  async requestPermission(): Promise<'granted'> {
    return 'granted';
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  onReading(listener: OrientationListener): () => void {
    return this.readings.on(listener);
  }

  setHeading(deg: number): void {
    this.heading = normalizeDeg(deg);
  }

  setPitch(deg: number): void {
    this.pitch = deg;
  }

  get currentHeading(): number {
    return this.heading;
  }

  get currentPitch(): number {
    return this.pitch;
  }

  private tick(): void {
    const dH = angleDiffDeg(this.previousHeading, this.heading);
    const dP = this.pitch - this.previousPitch;
    const rotationRate = Math.hypot(dH, dP) / (TICK_MS / 1000);
    this.previousHeading = this.heading;
    this.previousPitch = this.pitch;
    this.readings.emit({
      heading: this.heading,
      pitch: this.pitch,
      rotationRate,
      compassAccuracy: 0,
      timestamp: Date.now(),
    });
  }
}
