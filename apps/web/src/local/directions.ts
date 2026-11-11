import type { LngLat, Position } from '@petjada/shared';
import { LocalApiError } from './errors';

export interface DirectionsResult {
  coordinates: Position[];
  /** Distància a peu segons Directions, en metres. */
  distanceM: number;
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

/**
 * Mapbox Directions amb perfil `walking`, cridat directament des del
 * navegador amb el token públic (a l'API ho fa el servidor).
 */
export function mapboxDirections(token: string): (waypoints: LngLat[]) => Promise<DirectionsResult> {
  return async (waypoints) => {
    if (!token) {
      throw new LocalApiError(502, 'DIRECTIONS_FAILED', 'No es poden calcular rutes: falta el token de Mapbox (VITE_MAPBOX_TOKEN).');
    }
    if (waypoints.length < 2) {
      throw new LocalApiError(400, 'VALIDATION', 'Calen almenys dos punts per calcular una ruta');
    }
    const coords = waypoints.map((w) => `${w.lon.toFixed(COORD_DECIMALS)},${w.lat.toFixed(COORD_DECIMALS)}`).join(';');
    const params = new URLSearchParams({ geometries: 'geojson', overview: 'full', steps: 'false', access_token: token });

    let data: MapboxDirectionsResponse;
    try {
      const res = await fetch(`${DIRECTIONS_BASE}${coords}?${params.toString()}`);
      data = (await res.json()) as MapboxDirectionsResponse;
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new LocalApiError(502, 'DIRECTIONS_FAILED', `No s'ha pogut calcular la ruta a peu (${reason}).`);
    }

    const best = data.routes?.[0];
    if (data.code !== 'Ok' || !best || best.geometry.coordinates.length < 2) {
      throw new LocalApiError(
        502,
        'DIRECTIONS_FAILED',
        "No s'ha trobat cap camí a peu entre aquests punts. Prova amb punts més a prop de carrers o camins.",
      );
    }
    return { coordinates: best.geometry.coordinates, distanceM: best.distance };
  };
}
