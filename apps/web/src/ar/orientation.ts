import { config } from '../config';
import { Emitter } from '../gps/emitter';
import { CircularLowPassFilter, LowPassFilter } from '../gps/lowpass';
import type { OrientationListener, OrientationReading, OrientationSource } from '../gps/types';

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Converteix `alpha`, `beta`, `gamma` (Android, `deviceorientationabsolute`)
 * en un rumb de la càmera posterior, tenint en compte l'orientació de la
 * pantalla. Retorna graus [0, 360).
 */
export function headingFromEuler(alpha: number, beta: number, gamma: number, screenAngle: number): number {
  const rad = Math.PI / 180;
  const a = alpha * rad;
  const b = beta * rad;
  const g = gamma * rad;
  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);
  // Vector que surt de la part posterior del mòbil (eix -Z del dispositiu), en coordenades del món.
  const rA = -cA * sG - sA * sB * cG;
  const rB = -sA * sG + cA * sB * cG;
  let heading = Math.atan2(rA, rB);
  heading -= screenAngle * rad;
  heading = ((heading / rad) % 360 + 360) % 360;
  return heading;
}

/**
 * Inclinació de la càmera: 0 = horitzontal, +90 = cap al zenit, -90 = a terra.
 * En vertical (portrait), `beta` = 90 vol dir mòbil dret mirant l'horitzó.
 */
export function pitchFromBeta(beta: number): number {
  return beta - 90;
}

/**
 * Font d'orientació real. Emet lectures ja filtrades amb passa-baix.
 * A iOS cal `requestPermission()` des d'un gest de l'usuari.
 */
export class RealOrientationSource implements OrientationSource {
  readonly kind = 'real' as const;
  private readonly readings = new Emitter<OrientationReading>();
  private readonly headingFilter = new CircularLowPassFilter(config.headingLpfAlpha);
  private readonly pitchFilter = new LowPassFilter(config.headingLpfAlpha);
  private rotationRate = 0;
  private compassAccuracy: number | null = null;
  private running = false;
  private usingAbsolute = false;

  private readonly onOrientation = (event: DeviceOrientationEvent) => this.handleOrientation(event);
  private readonly onMotion = (event: DeviceMotionEvent) => {
    const r = event.rotationRate;
    if (!r) return;
    this.rotationRate = Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0);
  };

  static get supported(): boolean {
    return typeof DeviceOrientationEvent !== 'undefined';
  }

  async requestPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
    if (!RealOrientationSource.supported) return 'unsupported';
    const ctor = DeviceOrientationEvent as unknown as PermissionCapable;
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission();
        const motion = DeviceMotionEvent as unknown as PermissionCapable;
        if (typeof motion.requestPermission === 'function') await motion.requestPermission().catch(() => 'denied');
        return result === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'denied';
      }
    }
    return 'granted';
  }

  start(): void {
    if (this.running || !RealOrientationSource.supported) return;
    this.running = true;
    this.headingFilter.reset();
    this.pitchFilter.reset();
    // Android: `deviceorientationabsolute` dona alpha referenciat al nord.
    const w = window as Window & { ondeviceorientationabsolute?: unknown };
    if ('ondeviceorientationabsolute' in w) {
      this.usingAbsolute = true;
      w.addEventListener('deviceorientationabsolute', this.onOrientation as EventListener);
    } else {
      window.addEventListener('deviceorientation', this.onOrientation);
    }
    window.addEventListener('devicemotion', this.onMotion);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('deviceorientationabsolute', this.onOrientation as EventListener);
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
  }

  onReading(listener: OrientationListener): () => void {
    return this.readings.on(listener);
  }

  private handleOrientation(event: DeviceOrientationEvent): void {
    const ios = event as IOSOrientationEvent;
    let heading: number | null = null;
    if (typeof ios.webkitCompassHeading === 'number' && !Number.isNaN(ios.webkitCompassHeading)) {
      heading = ios.webkitCompassHeading;
      this.compassAccuracy = typeof ios.webkitCompassAccuracy === 'number' ? ios.webkitCompassAccuracy : null;
    } else if (event.alpha !== null && (event.absolute || this.usingAbsolute)) {
      const screenAngle = typeof screen.orientation?.angle === 'number' ? screen.orientation.angle : 0;
      heading = headingFromEuler(event.alpha, event.beta ?? 0, event.gamma ?? 0, screenAngle);
    } else if (event.alpha !== null) {
      // Sense referència absoluta: fem servir alpha igualment (rumb relatiu).
      heading = (360 - event.alpha) % 360;
    }
    if (heading === null || event.beta === null) return;

    const filteredHeading = this.headingFilter.push(heading);
    const filteredPitch = this.pitchFilter.push(pitchFromBeta(event.beta));
    this.readings.emit({
      heading: filteredHeading,
      pitch: filteredPitch,
      rotationRate: this.rotationRate,
      compassAccuracy: this.compassAccuracy,
      timestamp: Date.now(),
    });
  }
}
