import type mapboxgl from 'mapbox-gl';
import { LuFootprints } from 'react-icons/lu';
import type { Footprint } from '../gps/footprints';
import { themeColor } from './colors';
import { whenStyleLoaded } from './create-map';
import { ensureMapIcon } from './icons';

const SOURCE_ID = 'petjada-footprints';
const LAYER_ID = 'petjada-footprints';
const IMAGE_ID = 'petjada-footprint';

function toFeatureCollection(footprints: readonly Footprint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: footprints.map((fp, i) => ({
      type: 'Feature',
      properties: { heading: fp.heading, side: fp.side === 'left' ? -1 : 1, index: i },
      geometry: { type: 'Point', coordinates: [fp.lon, fp.lat] },
    })),
  };
}

/**
 * Capa de petjades: la icona `LuFootprints` (apunta al nord) es renderitza a
 * imatge en temps d'execució i es gira amb `icon-rotate` = rumb, alineada al
 * mapa perquè giri amb ell. Els peus esquerre i dret es desplacen lateralment.
 */
export class FootprintLayer {
  private ready: Promise<void>;

  constructor(private readonly map: mapboxgl.Map) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await whenStyleLoaded(this.map);
    await ensureMapIcon(this.map, IMAGE_ID, LuFootprints, themeColor('brand.700'), 64);
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, { type: 'geojson', data: toFeatureCollection([]) });
    this.map.addLayer({
      id: LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      slot: 'top',
      layout: {
        'icon-image': IMAGE_ID,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.3, 18, 0.7, 20, 1],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-offset': ['*', ['get', 'side'], 12],
      },
      paint: { 'icon-opacity': 0.85 },
    });
  }

  async update(footprints: readonly Footprint[]): Promise<void> {
    await this.ready;
    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(footprints));
  }
}
