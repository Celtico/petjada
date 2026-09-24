import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { LngLat } from '@petjada/shared';
import { config } from '../config';

export const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

/** Estil buit per al mode AR: sense fons, només els marcadors. */
export const TRANSPARENT_STYLE: mapboxgl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
};

export interface CreateMapOptions {
  container: HTMLElement;
  center: LngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  transparent?: boolean;
  interactive?: boolean;
}

export const DEFAULT_ZOOM = 16;
export const WALK_ZOOM = 17.5;
export const WALK_PITCH = 60;

export function hasMapboxToken(): boolean {
  return config.mapboxToken.length > 0;
}

/**
 * Crea un mapa de Mapbox v3. L'estil "standard" ja inclou els edificis 3D.
 * En mode transparent es fa servir un estil buit i el contenidor sense fons.
 */
export function createMap(options: CreateMapOptions): mapboxgl.Map {
  mapboxgl.accessToken = config.mapboxToken;
  const transparent = options.transparent ?? false;
  const map = new mapboxgl.Map({
    container: options.container,
    style: transparent ? TRANSPARENT_STYLE : STANDARD_STYLE,
    center: [options.center.lon, options.center.lat],
    zoom: options.zoom ?? DEFAULT_ZOOM,
    pitch: options.pitch ?? 0,
    bearing: options.bearing ?? 0,
    interactive: options.interactive ?? true,
    attributionControl: !transparent,
    antialias: true,
    // Mapbox v3 amb estil standard: configurem el mode de llum en carregar.
  });

  if (!transparent) {
    map.on('style.load', () => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', 'day');
        map.setConfigProperty('basemap', 'show3dObjects', true);
      } catch {
        /* estil sense configuració */
      }
    });
  } else {
    options.container.classList.add('map--transparent');
  }

  return map;
}

/** Espera que l'estil estigui carregat (idempotent). */
export function whenStyleLoaded(map: mapboxgl.Map): Promise<void> {
  if (map.isStyleLoaded()) return Promise.resolve();
  return new Promise((resolve) => map.once('style.load', () => resolve()));
}
