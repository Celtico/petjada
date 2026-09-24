import type { AppendTrackResponse, TrackPointDto } from '@petjada/shared';
import { api } from '../api/client';
import { Emitter } from './emitter';

/**
 * Acumula punts del track i els envia periòdicament al servidor
 * (`PUT /user-routes/:id/track`). El servidor respon amb l'estat
 * (`reachedTurnaround`, `coverage`), que es reemet.
 */
export class TrackUploader {
  private buffer: TrackPointDto[] = [];
  private timer: number | null = null;
  private inFlight = false;
  private readonly updates = new Emitter<AppendTrackResponse>();

  constructor(
    private readonly userRouteId: string,
    private readonly intervalMs: number,
  ) {}

  onUpdate(listener: (update: AppendTrackResponse) => void): () => void {
    return this.updates.on(listener);
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => void this.flush(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  push(point: TrackPointDto): void {
    this.buffer.push(point);
  }

  /** Envia el que hi ha al buffer. Retorna l'última resposta o `null`. */
  async flush(): Promise<AppendTrackResponse | null> {
    if (this.inFlight || this.buffer.length === 0) return null;
    const points = this.buffer;
    this.buffer = [];
    this.inFlight = true;
    try {
      const res = await api.userRoutes.appendTrack(this.userRouteId, { points });
      this.updates.emit(res);
      return res;
    } catch (error) {
      // Tornem a posar els punts al buffer per reintentar al següent interval.
      this.buffer = points.concat(this.buffer);
      console.warn('track upload failed', error);
      return null;
    } finally {
      this.inFlight = false;
    }
  }
}
