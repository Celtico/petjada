import { Emitter } from './emitter';
import type {
  PositionErrorListener,
  PositionListener,
  PositionReading,
  PositionSource,
  PositionSourceError,
} from './types';

/** Font de posició real amb `watchPosition` (alta precisió, sense caché). */
export class RealPositionSource implements PositionSource {
  readonly kind = 'real' as const;
  private watchId: number | null = null;
  private readonly readings = new Emitter<PositionReading>();
  private readonly errors = new Emitter<PositionSourceError>();

  start(): void {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      this.errors.emit({ code: 'UNAVAILABLE', message: 'geolocation unsupported' });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.readings.emit({
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        });
      },
      (err) => {
        const code: PositionSourceError['code'] =
          err.code === err.PERMISSION_DENIED
            ? 'PERMISSION_DENIED'
            : err.code === err.TIMEOUT
              ? 'TIMEOUT'
              : 'UNAVAILABLE';
        this.errors.emit({ code, message: err.message });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  onReading(listener: PositionListener): () => void {
    return this.readings.on(listener);
  }

  onError(listener: PositionErrorListener): () => void {
    return this.errors.on(listener);
  }
}

/** Una sola lectura (per al llistat de rutes i la creació). */
export function getCurrentPosition(timeoutMs = 15000): Promise<PositionReading> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ code: 'UNAVAILABLE', message: 'geolocation unsupported' } satisfies PositionSourceError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) =>
        reject({
          code: err.code === err.PERMISSION_DENIED ? 'PERMISSION_DENIED' : 'UNAVAILABLE',
          message: err.message,
        } satisfies PositionSourceError),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: timeoutMs },
    );
  });
}
