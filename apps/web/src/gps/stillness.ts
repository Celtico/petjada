import { Emitter } from './emitter';

export interface StillnessOptions {
  /** Acceleració (m/s², sense gravetat) per sota de la qual no hi ha moviment. */
  accelThreshold: number;
  /** Temps sense moviment per considerar l'usuari quiet (ms). */
  stillAfterMs: number;
}

/**
 * Detecta si l'usuari està quiet a partir de `DeviceMotionEvent`, per reduir
 * la freqüència de processament del GPS i estalviar bateria.
 *
 * Si el dispositiu no té sensors de moviment, mai es considera quiet.
 */
export class StillnessDetector {
  private lastMovementAt = Date.now();
  private stillState = false;
  private timer: number | null = null;
  private readonly changes = new Emitter<boolean>();
  private readonly handler = (event: DeviceMotionEvent) => this.onMotion(event);

  constructor(private readonly options: StillnessOptions) {}

  get isStill(): boolean {
    return this.stillState;
  }

  onChange(listener: (still: boolean) => void): () => void {
    return this.changes.on(listener);
  }

  start(): void {
    if (typeof DeviceMotionEvent === 'undefined') return;
    window.addEventListener('devicemotion', this.handler);
    this.timer = window.setInterval(() => this.evaluate(), 2000);
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.handler);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.setStill(false);
  }

  /** Marca moviment extern (p. ex. una lectura GPS que s'ha desplaçat). */
  noteMovement(): void {
    this.lastMovementAt = Date.now();
    this.setStill(false);
  }

  private onMotion(event: DeviceMotionEvent): void {
    const a = event.acceleration;
    if (!a) return;
    const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    if (magnitude > this.options.accelThreshold) this.noteMovement();
  }

  private evaluate(): void {
    const still = Date.now() - this.lastMovementAt > this.options.stillAfterMs;
    this.setStill(still);
  }

  private setStill(still: boolean): void {
    if (still === this.stillState) return;
    this.stillState = still;
    this.changes.emit(still);
  }
}
