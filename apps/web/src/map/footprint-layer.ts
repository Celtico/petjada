import type mapboxgl from 'mapbox-gl';
import type { Footprint } from '../gps/footprints';
import { whenStyleLoaded } from './create-map';

const SOURCE_ID = 'petjada-footprints';
const LAYER_ID = 'petjada-footprints';
const IMAGE_ID = 'petjada-footprint';
const IMAGE_URL = '/objects/footprint.webp';

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
 * Capa de petjades: símbols orientats amb `icon-rotate` = rumb, alineats al mapa
 * perquè girin amb ell. Els peus esquerre i dret es desplacen lateralment.
 */
export class FootprintLayer {
  private ready: Promise<void>;

  constructor(private readonly map: mapboxgl.Map) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await whenStyleLoaded(this.map);
    if (!this.map.hasImage(IMAGE_ID)) {
      await new Promise<void>((resolve) => {
        this.map.loadImage(IMAGE_URL, (error, image) => {
          if (!error && image && !this.map.hasImage(IMAGE_ID)) this.map.addImage(IMAGE_ID, image);
          resolve();
        });
      });
    }
    if (this.map.getSource(SOURCE_ID)) return;
    this.map.addSource(SOURCE_ID, { type: 'geojson', data: toFeatureCollection([]) });
    this.map.addLayer({
      id: LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      slot: 'top',
      layout: {
        'icon-image': IMAGE_ID,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.15, 18, 0.4, 20, 0.6],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-offset': ['*', ['get', 'side'], 40],
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
