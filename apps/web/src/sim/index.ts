import type mapboxgl from 'mapbox-gl';
import type { LngLat, Position } from '@petjada/shared';
import { config } from '../config';
import { Emitter } from '../gps/emitter';
import { SimOrientationSource } from './sim-orientation-source';
import { SimPositionSource } from './sim-position-source';

/** Posició inicial per defecte de la simulació (plaça de Catalunya, Barcelona). */
const DEFAULT_START: LngLat = { lon: 2.1700, lat: 41.3870 };
const SIM_ACTIVE_KEY = 'petjada.sim.active';
const SIM_POSITION_KEY = 'petjada.sim.position';
const TICK_MS = 1000;

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignora */
  }
}

/**
 * Estat global de la simulació (només si `VITE_ENABLE_SIM`). Exposa fonts de
 * posició i orientació intercanviables amb les reals. Quan està activa, tot el
 * que depèn del GPS (llistat, creació, ruta, AR) la fa servir.
 */
class Simulation {
  readonly enabled = config.enableSim;
  readonly position: SimPositionSource;
  readonly orientation = new SimOrientationSource();
  private active = false;
  private readonly changes = new Emitter<boolean>();
  private map: mapboxgl.Map | null = null;
  private readonly onMapClick = (e: mapboxgl.MapMouseEvent) => {
    if (this.active && this.position.currentMode === 'click') this.position.moveTo({ lon: e.lngLat.lng, lat: e.lngLat.lat });
  };

  constructor() {
    const start = readStored<LngLat>(SIM_POSITION_KEY) ?? DEFAULT_START;
    this.position = new SimPositionSource(start, {
      speedMps: config.simSpeedMps,
      accuracyM: config.simAccuracyM,
      tickMs: TICK_MS,
    });
    this.position.onReading((r) => store(SIM_POSITION_KEY, { lon: r.lon, lat: r.lat }));
    this.active = this.enabled && readStored<boolean>(SIM_ACTIVE_KEY) === true;
  }

  get isActive(): boolean {
    return this.enabled && this.active;
  }

  setActive(active: boolean): void {
    if (!this.enabled || active === this.active) return;
    this.active = active;
    store(SIM_ACTIVE_KEY, active);
    this.changes.emit(active);
  }

  onChange(listener: (active: boolean) => void): () => void {
    return this.changes.on(listener);
  }

  /** Posició simulada actual si la simulació està activa. */
  currentPosition(): LngLat | null {
    return this.isActive ? this.position.currentPosition : null;
  }

  /** Track de la ruta activa per al mode "Segueix la ruta". */
  setRouteTrack(coords: Position[], roundTrip: boolean): void {
    this.position.setTrack(coords, roundTrip);
  }

  /** Mapa on escoltar clics per al mode "Clic al mapa". */
  attachMap(map: mapboxgl.Map | null): void {
    if (this.map) this.map.off('click', this.onMapClick);
    this.map = map;
    if (map) map.on('click', this.onMapClick);
  }
}

export const simulation = new Simulation();
