import type mapboxgl from 'mapbox-gl';
import type { LineStringGeometry, Position } from '@petjada/shared';
import { themeColor } from './colors';
import { whenStyleLoaded } from './create-map';

const SOURCE_ID = 'petjada-route';
const CASING_ID = 'petjada-route-casing';
const LINE_ID = 'petjada-route-line';
const ENDPOINTS_SOURCE = 'petjada-route-endpoints';
const ENDPOINTS_ID = 'petjada-route-endpoints';


function lineFeature(coords: Position[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
}

function endpoints(coords: Position[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (coords.length === 0) return { type: 'FeatureCollection', features: [] };
  const first = coords[0];
  const last = coords[coords.length - 1];
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'start' }, geometry: { type: 'Point', coordinates: first } },
      { type: 'Feature', properties: { kind: 'end' }, geometry: { type: 'Point', coordinates: last } },
    ],
  };
}

/** Dibuixa (o actualitza) la línia de la ruta amb els punts d'inici i final. */
export async function drawRoute(map: mapboxgl.Map, geometry: LineStringGeometry | null): Promise<void> {
  await whenStyleLoaded(map);
  const coords = geometry?.coordinates ?? [];
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(lineFeature(coords));
    (map.getSource(ENDPOINTS_SOURCE) as mapboxgl.GeoJSONSource).setData(endpoints(coords));
    return;
  }
  const primary = themeColor('brand.solid');
  const accent = themeColor('accent.500');
  const surface = themeColor('bg.panel');
  map.addSource(SOURCE_ID, { type: 'geojson', data: lineFeature(coords), lineMetrics: true });
  map.addSource(ENDPOINTS_SOURCE, { type: 'geojson', data: endpoints(coords) });
  map.addLayer({
    id: CASING_ID,
    type: 'line',
    source: SOURCE_ID,
    slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': surface, 'line-width': 9, 'line-opacity': 0.9, 'line-emissive-strength': 1 },
  });
  map.addLayer({
    id: LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': primary, 'line-width': 5, 'line-emissive-strength': 1 },
  });
  map.addLayer({
    id: ENDPOINTS_ID,
    type: 'circle',
    source: ENDPOINTS_SOURCE,
    slot: 'top',
    paint: {
      'circle-radius': 8,
      'circle-color': ['case', ['==', ['get', 'kind'], 'start'], accent, primary],
      'circle-stroke-color': surface,
      'circle-stroke-width': 3,
      'circle-emissive-strength': 1,
    },
  });
}

/** Ajusta la càmera perquè es vegi tota la ruta. */
export function fitRoute(map: mapboxgl.Map, geometry: LineStringGeometry, padding = 60): void {
  const coords = geometry.coordinates;
  if (coords.length === 0) return;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding, pitch: 45, duration: 800, maxZoom: 17 },
  );
}
