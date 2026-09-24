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

/**
 * Executa `callback` un sol cop quan el mapa ja accepta fonts i capes. No depèn
 * només de `load`: amb l'estil standard de v3 i navegació SPA (o StrictMode, que
 * crea i destrueix un mapa abans de l'actiu) aquest esdeveniment pot no arribar
 * mai. Es resol amb el primer de `style.load`, `load`, `idle` o `styledata` amb
 * l'estil ja carregat, o immediatament si ja ho està.
 */
export function afterMapReady(map: mapboxgl.Map, callback: () => void): void {
  let done = false;
  const events = ['style.load', 'load', 'idle', 'styledata'] as const;
  const fire = () => {
    if (done) return;
    done = true;
    for (const e of events) map.off(e, handler);
    callback();
  };
  const handler = (event: { type: string }) => {
    if (event.type === 'styledata' && !map.isStyleLoaded()) return;
    fire();
  };
  if (map.isStyleLoaded()) {
    // Diferit perquè el comportament sigui sempre asíncron.
    queueMicrotask(fire);
    return;
  }
  for (const e of events) map.on(e, handler);
}

/** Espera que l'estil estigui carregat (idempotent). */
export function whenStyleLoaded(map: mapboxgl.Map): Promise<void> {
  return new Promise((resolve) => afterMapReady(map, resolve));
}
