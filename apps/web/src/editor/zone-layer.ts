import type mapboxgl from 'mapbox-gl';
import type { Position } from '@petjada/shared';
import { themeColor } from '../map/colors';
import { whenStyleLoaded } from '../map/create-map';

const ZONE_SOURCE = 'petjada-zone';

function zoneFeature(vertices: Position[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = vertices.map((v) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: v } }));
  if (vertices.length >= 2) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: vertices } });
  }
  if (vertices.length >= 3) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] } });
  }
  return { type: 'FeatureCollection', features };
}

/** Dibuixa (o actualitza) la zona d'una col·lecció: vèrtexs, contorn i àrea. */
export async function drawZone(map: mapboxgl.Map, vertices: Position[]): Promise<void> {
  await whenStyleLoaded(map);
  const source = map.getSource(ZONE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(zoneFeature(vertices));
    return;
  }
  const primary = themeColor('brand.solid');
  const accent = themeColor('accent.500');
  const surface = themeColor('bg.panel');
  map.addSource(ZONE_SOURCE, { type: 'geojson', data: zoneFeature(vertices) });
  map.addLayer({ id: `${ZONE_SOURCE}-fill`, type: 'fill', source: ZONE_SOURCE, slot: 'top', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': primary, 'fill-opacity': 0.18, 'fill-emissive-strength': 1 } });
  map.addLayer({ id: `${ZONE_SOURCE}-line`, type: 'line', source: ZONE_SOURCE, slot: 'top', filter: ['==', '$type', 'LineString'], paint: { 'line-color': primary, 'line-width': 3, 'line-emissive-strength': 1 } });
  map.addLayer({
    id: `${ZONE_SOURCE}-points`,
    type: 'circle',
    source: ZONE_SOURCE,
    slot: 'top',
    filter: ['==', '$type', 'Point'],
    paint: { 'circle-radius': 7, 'circle-color': accent, 'circle-stroke-color': surface, 'circle-stroke-width': 2, 'circle-emissive-strength': 1 },
  });
}
