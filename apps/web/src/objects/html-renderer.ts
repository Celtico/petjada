import mapboxgl from 'mapbox-gl';
import type { RouteObjectDto } from '@petjada/shared';
import { config } from '../config';
import { Emitter } from '../gps/emitter';
import { el } from '../ui/dom';
import type { ObjectRenderer } from './renderer';
import type { ObjectView } from './visibility';

interface Entry {
  object: RouteObjectDto;
  marker: mapboxgl.Marker;
  root: HTMLElement;
  img: HTMLImageElement;
  visible: boolean;
}

const BASE_SIZE_PX = 72;
const CAPTURE_ANIMATION_MS = 500;

/**
 * Billboards com a markers HTML de Mapbox: sempre miren la càmera, floten amb
 * una animació CSS de fase aleatòria i tenen una ombra el·líptica al terra.
 */
export class HtmlObjectRenderer implements ObjectRenderer {
  private readonly entries = new Map<string, Entry>();
  private readonly taps = new Emitter<RouteObjectDto>();
  private hidden = false;

  constructor(private readonly map: mapboxgl.Map) {}

  setObjects(objects: readonly RouteObjectDto[]): void {
    const ids = new Set(objects.map((o) => o.id));
    for (const [id, entry] of this.entries) {
      if (!ids.has(id)) {
        entry.marker.remove();
        this.entries.delete(id);
      }
    }
    for (const object of objects) {
      if (this.entries.has(object.id)) continue;
      this.entries.set(object.id, this.createEntry(object));
    }
  }

  update(views: readonly ObjectView<RouteObjectDto>[]): void {
    for (const view of views) {
      const entry = this.entries.get(view.object.id);
      if (!entry) continue;
      const show = view.visible && !this.hidden;
      if (show && !entry.visible) {
        entry.marker.addTo(this.map);
        entry.visible = true;
      } else if (!show && entry.visible) {
        entry.marker.remove();
        entry.visible = false;
      }
      if (!show) continue;
      entry.root.style.setProperty('--object-size', `${Math.round(BASE_SIZE_PX * view.scale)}px`);
      entry.root.classList.toggle('is-capturable', view.capturable);
      entry.root.classList.toggle('is-hidden', false);
    }
  }

  async playCapture(objectId: string): Promise<void> {
    const entry = this.entries.get(objectId);
    if (!entry) return;
    entry.root.classList.remove('is-capturable');
    entry.root.classList.add('is-captured');
    await new Promise((resolve) => window.setTimeout(resolve, CAPTURE_ANIMATION_MS));
    entry.marker.remove();
    this.entries.delete(objectId);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const entry of this.entries.values()) entry.root.classList.toggle('is-hidden', hidden);
  }

  onTap(listener: (object: RouteObjectDto) => void): () => void {
    return this.taps.on(listener);
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.marker.remove();
    this.entries.clear();
    this.taps.clear();
  }

  private createEntry(object: RouteObjectDto): Entry {
    const img = el('img', { className: 'object-marker__img', src: object.imageUrl, alt: object.type });
    img.draggable = false;
    const root = el(
      'div',
      { className: 'object-marker', dataset: { id: object.id } },
      el('div', { className: 'object-marker__ring' }),
      el('div', { className: 'object-marker__shadow' }),
      img,
    );
    root.style.setProperty('--float-period', `${config.objectFloatPeriodMs}ms`);
    root.style.setProperty('--float-delay', `${-(Math.random() * config.objectFloatPeriodMs).toFixed(0)}ms`);
    img.addEventListener('click', (event) => {
      event.stopPropagation();
      this.taps.emit(object);
    });
    const marker = new mapboxgl.Marker({ element: root, anchor: 'bottom' }).setLngLat([object.lon, object.lat]);
    return { object, marker, root, img, visible: false };
  }
}

/** Precarrega les imatges dels objectes d'una ruta. */
export async function preloadObjectImages(objects: readonly { imageUrl: string }[]): Promise<void> {
  const urls = Array.from(new Set(objects.map((o) => o.imageUrl)));
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
}
