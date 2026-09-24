import mapboxgl from 'mapbox-gl';
import type { LngLat } from '@petjada/shared';

/** Marcador de l'usuari: punt amb halo de precisió (estils a `styles/map.css`). */
export class UserMarker {
  private readonly marker: mapboxgl.Marker;
  private readonly halo: HTMLElement;

  constructor(private readonly map: mapboxgl.Map) {
    const root = document.createElement('div');
    root.className = 'user-marker';
    this.halo = document.createElement('div');
    this.halo.className = 'user-marker__halo';
    const dot = document.createElement('div');
    dot.className = 'user-marker__dot';
    root.append(this.halo, dot);
    this.marker = new mapboxgl.Marker({ element: root, anchor: 'center' });
  }

  update(position: LngLat, accuracyM: number): void {
    this.marker.setLngLat([position.lon, position.lat]);
    if (!this.marker.getElement().isConnected) this.marker.addTo(this.map);
    // Escala aproximada: metres a píxels segons el zoom actual.
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
