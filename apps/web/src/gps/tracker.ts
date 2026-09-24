import { config } from '../config';
import { Emitter } from './emitter';
import { PositionFilter, type FilteredPosition } from './filter';
import { StillnessDetector } from './stillness';
import type { PositionReading, PositionSource, PositionSourceError } from './types';

export interface TrackerState {
  position: FilteredPosition | null;
  /** `true` mentre no hi ha cap posició acceptada o l'última lectura crua és dolenta. */
  improvingSignal: boolean;
  lastRawAccuracy: number | null;
  still: boolean;
}

/**
 * Orquestra la font de posició (real o simulada), el filtre, i l'estalvi de
 * bateria quan l'usuari està quiet. Emet posicions filtrades.
 */
export class Tracker {
  private readonly filter = new PositionFilter({
    maxAccuracyM: config.minAccuracyM,
    maxSpeedMps: config.maxWalkingSpeedMps,
    windowSize: config.gpsWindowSize,
  });
  private readonly stillness = new StillnessDetector({
    accelThreshold: config.stillAccelThreshold,
    stillAfterMs: config.stillAfterMs,
  });
  private readonly positions = new Emitter<FilteredPosition>();
  private readonly states = new Emitter<TrackerState>();
  private readonly errors = new Emitter<PositionSourceError>();
  private unsubscribe: Array<() => void> = [];
  private lastProcessedAt = 0;
  private state: TrackerState = { position: null, improvingSignal: true, lastRawAccuracy: null, still: false };

  constructor(private source: PositionSource) {}

  get current(): TrackerState {
    return this.state;
  }

  onPosition(listener: (p: FilteredPosition) => void): () => void {
    return this.positions.on(listener);
  }

  onState(listener: (s: TrackerState) => void): () => void {
    return this.states.on(listener);
  }

  onError(listener: (e: PositionSourceError) => void): () => void {
    return this.errors.on(listener);
  }

  start(): void {
    this.bind();
    this.source.start();
    this.stillness.start();
  }

  stop(): void {
    this.source.stop();
    this.stillness.stop();
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  /** Canvia la font (p. ex. GPS real ↔ simulació) sense perdre l'estat de la UI. */
  setSource(source: PositionSource): void {
    const wasBound = this.unsubscribe.length > 0;
    if (wasBound) {
      this.source.stop();
      for (const off of this.unsubscribe) off();
      this.unsubscribe = [];
    }
    this.source = source;
    this.filter.reset();
    if (wasBound) {
      this.bind();
      this.source.start();
    }
  }

  get sourceKind(): PositionSource['kind'] {
    return this.source.kind;
  }

  private bind(): void {
    this.unsubscribe.push(
      this.source.onReading((r) => this.handleReading(r)),
      this.source.onError((e) => this.errors.emit(e)),
      this.stillness.onChange((still) => this.setState({ still })),
    );
  }

  private handleReading(reading: PositionReading): void {
    // Estalvi de bateria: si l'usuari és quiet, processem menys sovint.
    const now = Date.now();
    if (this.stillness.isStill && now - this.lastProcessedAt < config.stillGpsIntervalMs) return;
    this.lastProcessedAt = now;

    const result = this.filter.push(reading);
    if (!result.accepted) {
      this.setState({ lastRawAccuracy: reading.accuracy, improvingSignal: result.reason === 'accuracy' });
      return;
    }
    const previous = this.state.position;
    if (previous && (previous.lon !== result.position.lon || previous.lat !== result.position.lat)) {
      this.stillness.noteMovement();
    }
    this.setState({ position: result.position, lastRawAccuracy: reading.accuracy, improvingSignal: false });
    this.positions.emit(result.position);
  }

  private setState(patch: Partial<TrackerState>): void {
    this.state = { ...this.state, ...patch };
    this.states.emit(this.state);
  }
}
