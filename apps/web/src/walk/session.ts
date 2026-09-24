import type { ActiveRouteResponse, CaptureResponse, RouteDetailDto, RouteObjectDto, UserRouteDto } from '@petjada/shared';
import { api, ApiError } from '../api/client';
import { session } from '../auth/session';
import { config } from '../config';
import { Emitter } from '../gps/emitter';
import type { FilteredPosition } from '../gps/filter';
import { FootprintTrail, type Footprint } from '../gps/footprints';
import { RealPositionSource } from '../gps/real-position-source';
import { Tracker, type TrackerState } from '../gps/tracker';
import { TrackUploader } from '../gps/track-uploader';
import type { PositionSource, PositionSourceError } from '../gps/types';
import { WakeLockController } from '../gps/wake-lock';
import { preloadObjectImages } from '../objects/html-renderer';
import { computeObjectViews, type ObjectView } from '../objects/visibility';
import { setLastKnownLocation } from '../routes/location';
import { simulation } from '../sim';

export interface CaptureResult {
  object: RouteObjectDto;
  response: CaptureResponse;
}

export type CaptureFailure = { object: RouteObjectDto; code: string; message: string };

/**
 * Sessió d'una ruta activa: GPS filtrat, petjades, pujada del track, objectes
 * pendents i captura. La comparteixen la pantalla de mapa i el mode càmera.
 */
class WalkSession {
  private active: ActiveRouteResponse | null = null;
  private tracker: Tracker | null = null;
  private uploader: TrackUploader | null = null;
  private readonly trail = new FootprintTrail(config.footprintSpacingM);
  private readonly wakeLock = new WakeLockController();
  private pending: RouteObjectDto[] = [];
  private reachedTurnaround = false;
  private unsubscribe: Array<() => void> = [];

  readonly positions = new Emitter<FilteredPosition>();
  readonly states = new Emitter<TrackerState>();
  readonly footprints = new Emitter<readonly Footprint[]>();
  readonly objectsChanged = new Emitter<readonly RouteObjectDto[]>();
  readonly views = new Emitter<ObjectView<RouteObjectDto>[]>();
  readonly captured = new Emitter<CaptureResult>();
  readonly captureFailed = new Emitter<CaptureFailure>();
  readonly turnaround = new Emitter<boolean>();
  readonly gpsErrors = new Emitter<PositionSourceError>();

  get isRunning(): boolean {
    return this.active !== null;
  }

  get route(): RouteDetailDto | null {
    return this.active?.route ?? null;
  }

  get userRoute(): UserRouteDto | null {
    return this.active?.userRoute ?? null;
  }

  get pendingObjects(): readonly RouteObjectDto[] {
    return this.pending;
  }

  get hasReachedTurnaround(): boolean {
    return this.reachedTurnaround;
  }

  get position(): FilteredPosition | null {
    return this.tracker?.current.position ?? null;
  }

  get trackerState(): TrackerState | null {
    return this.tracker?.current ?? null;
  }

  get allFootprints(): readonly Footprint[] {
    return this.trail.all;
  }

  /** Recupera la ruta activa del servidor (si n'hi ha) i engega el seguiment. */
  async resume(): Promise<ActiveRouteResponse | null> {
    if (this.active) return this.active;
    const active = await api.userRoutes.active();
    if (!active) return null;
    await this.start(active);
    return active;
  }

  async start(active: ActiveRouteResponse): Promise<void> {
    if (this.active) this.stop();
    this.active = active;
    this.reachedTurnaround = active.userRoute.reachedTurnaround;
    this.trail.reset();
    void preloadObjectImages(active.route.objects);
    simulation.setRouteTrack(active.route.geometry.coordinates, active.route.roundTrip);

    this.tracker = new Tracker(this.pickSource());
    this.uploader = new TrackUploader(active.userRoute.id, config.trackFlushIntervalMs);

    this.unsubscribe.push(
      this.tracker.onPosition((p) => this.handlePosition(p)),
      this.tracker.onState((s) => this.states.emit(s)),
      this.tracker.onError((e) => this.gpsErrors.emit(e)),
      this.uploader.onUpdate((u) => this.setTurnaround(u.reachedTurnaround)),
      simulation.onChange(() => this.tracker?.setSource(this.pickSource())),
    );

    this.tracker.start();
    this.uploader.start();
    void this.wakeLock.acquire();
    await this.refreshPending();
  }

  stop(): void {
    this.tracker?.stop();
    this.uploader?.stop();
    void this.wakeLock.release();
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.tracker = null;
    this.uploader = null;
    this.active = null;
    this.pending = [];
  }

  async refreshPending(): Promise<void> {
    if (!this.active) return;
    const res = await api.userRoutes.pendingObjects(this.active.userRoute.id);
    this.pending = res.objects;
    this.setTurnaround(res.reachedTurnaround);
    this.objectsChanged.emit(this.pending);
    this.emitViews();
  }

  currentViews(): ObjectView<RouteObjectDto>[] {
    const state = this.tracker?.current;
    return computeObjectViews(this.pending, state?.position ?? null, state?.position?.accuracy ?? null, this.reachedTurnaround, {
      visibilityRangeM: config.visibilityRangeM,
      captureRadiusM: config.captureRadiusM,
      maxAccuracyM: config.minAccuracyM,
    });
  }

  /** Intenta capturar. El servidor valida distància, precisió, ruta activa i velocitat. */
  async capture(object: RouteObjectDto): Promise<CaptureResult | null> {
    const position = this.position;
    if (!position) return null;
    try {
      const response = await api.captures.capture({
        objectId: object.id,
        lon: position.lon,
        lat: position.lat,
        accuracy: position.accuracy,
        timestamp: position.timestamp,
      });
      this.pending = this.pending.filter((o) => o.id !== object.id);
      session.setTotalPoints(response.totalPoints);
      const result = { object, response };
      this.captured.emit(result);
      this.objectsChanged.emit(this.pending);
      this.emitViews();
      return result;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'INTERNAL';
      const message = error instanceof Error ? error.message : '';
      if (code === 'ALREADY_CAPTURED') {
        this.pending = this.pending.filter((o) => o.id !== object.id);
        this.objectsChanged.emit(this.pending);
      }
      this.captureFailed.emit({ object, code, message });
      return null;
    }
  }

  /** Envia el track pendent i acaba la ruta. */
  async finish() {
    if (!this.active) throw new Error('no active route');
    await this.uploader?.flush();
    const res = await api.userRoutes.finish(this.active.userRoute.id);
    session.setTotalPoints(res.totalPoints);
    this.stop();
    return res;
  }

  private pickSource(): PositionSource {
    return simulation.isActive ? simulation.position : new RealPositionSource();
  }

  private handlePosition(p: FilteredPosition): void {
    setLastKnownLocation(p);
    this.uploader?.push({ lon: p.lon, lat: p.lat, accuracy: p.accuracy, timestamp: p.timestamp });
    const added = this.trail.push(p);
    if (added.length) this.footprints.emit(this.trail.all);
    this.positions.emit(p);
    this.emitViews();
  }

  private setTurnaround(value: boolean): void {
    if (value === this.reachedTurnaround) return;
    this.reachedTurnaround = value;
    this.turnaround.emit(value);
    this.emitViews();
  }

  private emitViews(): void {
    this.views.emit(this.currentViews());
  }
}

export const walkSession = new WalkSession();
