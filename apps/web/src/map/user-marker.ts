import mapboxgl from 'mapbox-gl';
import type { LngLat } from '@petjada/shared';
import { el } from '../ui/dom';

/** Marcador de l'usuari: punt amb halo de precisió. */
export class UserMarker {
  private readonly marker: mapboxgl.Marker;
  private readonly halo: HTMLElement;

  constructor(private readonly map: mapboxgl.Map) {
    this.halo = el('div', {
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '40px',
        height: '40px',
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: 'rgba(31, 138, 112, 0.18)',
        border: '1px solid rgba(31, 138, 112, 0.35)',
      },
    });
    const dot = el('div', {
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '16px',
        height: '16px',
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: '#1F8A70',
        border: '3px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      },
    });
    const root = el('div', { style: { position: 'relative', width: '0', height: '0' } }, this.halo, dot);
    this.marker = new mapboxgl.Marker({ element: root, anchor: 'center' });
  }

  update(position: LngLat, accuracyM: number): void {
    this.marker.setLngLat([position.lon, position.lat]);
    if (!this.marker.getElement().isConnected) this.marker.addTo(this.map);
    // Escala aproximada: metres → píxels segons el zoom actual.
    const metersPerPixel =
      (40075016.686 * Math.cos((position.lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
    const px = Math.max(24, Math.min(200, (accuracyM * 2) / metersPerPixel));
    this.halo.style.width = `${px}px`;
    this.halo.style.height = `${px}px`;
  }

  remove(): void {
    this.marker.remove();
  }
}
