import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LngLat, Position } from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiError } from '../common/api-error';

export interface DirectionsResult {
  coordinates: Position[];
  /** Distància a peu segons Directions, en metres. */
  distanceM: number;
}

/** Contracte del proveïdor de rutes a peu (substituïble als tests). */
export abstract class DirectionsProvider {
  abstract route(waypoints: LngLat[]): Promise<DirectionsResult>;
}

interface MapboxDirectionsResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    geometry: { type: 'LineString'; coordinates: Position[] };
  }>;
}

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/walking/';
const COORD_DECIMALS = 6;

/** Client de la Mapbox Directions API amb perfil `walking`. */
@Injectable()
export class DirectionsService extends DirectionsProvider {
  private readonly logger = new Logger(DirectionsService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async route(waypoints: LngLat[]): Promise<DirectionsResult> {
    if (!this.config.mapboxToken) {
      throw new ApiError(
        502,
        'DIRECTIONS_FAILED',
        'No es poden calcular rutes: falta el token de Mapbox al servidor (MAPBOX_TOKEN).',
      );
    }
    if (waypoints.length < 2) {
      throw new ApiError(400, 'VALIDATION', 'Calen almenys dos punts per calcular una ruta');
    }
    const coords = waypoints
      .map((w) => `${w.lon.toFixed(COORD_DECIMALS)},${w.lat.toFixed(COORD_DECIMALS)}`)
      .join(';');
    const params = new URLSearchParams({
      geometries: 'geojson',
      overview: 'full',
      steps: 'false',
      access_token: this.config.mapboxToken,
    });
    const url = `${DIRECTIONS_BASE}${coords}?${params.toString()}`;

    let data: MapboxDirectionsResponse;
    try {
      const res = await fetch(url);
      data = (await res.json()) as MapboxDirectionsResponse;
      if (!res.ok) {
        this.logger.warn(`Directions HTTP ${res.status}: ${data.message ?? data.code}`);
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ApiError(502, 'DIRECTIONS_FAILED', `No s'ha pogut calcular la ruta a peu (${reason}).`);
    }

    const best = data.routes?.[0];
    if (data.code !== 'Ok' || !best || best.geometry.coordinates.length < 2) {
      throw new ApiError(
        502,
        'DIRECTIONS_FAILED',
        "No s'ha trobat cap camí a peu entre aquests punts. Prova amb punts més a prop de carrers o camins.",
      );
    }
    return { coordinates: best.geometry.coordinates, distanceM: best.distance };
  }
}
