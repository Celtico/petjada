import type { RouteObjectDto } from '@petjada/shared';
import type { ObjectView } from './visibility';

/**
 * Renderitzador de billboards. La implementació actual fa servir markers HTML
 * de Mapbox amb animació CSS (`HtmlObjectRenderer`).
 *
 * Preparat per a una implementació alternativa amb sprites de Three.js en un
 * `CustomLayerInterface` de Mapbox (vegeu l'esbós a sota), que permetria
 * oclusió amb els edificis 3D i milers d'objectes sense cost de DOM.
 */
export interface ObjectRenderer {
  /** Substitueix el conjunt d'objectes a renderitzar. */
  setObjects(objects: readonly RouteObjectDto[]): void;
  /** Actualitza visibilitat, escala i estat capturable de cada objecte. */
  update(views: readonly ObjectView<RouteObjectDto>[]): void;
  /** Reprodueix l'animació de captura i treu l'objecte. */
  playCapture(objectId: string): Promise<void>;
  /** Amaga tots els objectes (p. ex. estat MOVING del mode càmera). */
  setHidden(hidden: boolean): void;
  onTap(listener: (object: RouteObjectDto) => void): () => void;
  destroy(): void;
}

/*
 * Esbós de `ThreeSpriteObjectRenderer` (no implementat):
 *
 *   class ThreeSpriteObjectRenderer implements ObjectRenderer, mapboxgl.CustomLayerInterface {
 *     id = 'petjada-objects'; type = 'custom' as const; renderingMode = '3d' as const;
 *     onAdd(map, gl) { this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl }); … }
 *     render(gl, matrix) {
 *       // Per a cada objecte: THREE.Sprite amb textura WebP, posició via
 *       // mapboxgl.MercatorCoordinate.fromLngLat({lng, lat}, altitude), flotació amb sin(t + fase).
 *       // Ombra: mesh pla circular sota el sprite escalat per (1 - alçada/amplitud).
 *       this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
 *       this.renderer.resetState(); this.renderer.render(this.scene, this.camera); map.triggerRepaint();
 *     }
 *   }
 */
