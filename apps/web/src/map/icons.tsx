import type mapboxgl from 'mapbox-gl';
import type { IconType } from 'react-icons';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Converteix una icona de `react-icons` en una imatge per a Mapbox
 * (`map.addImage`). Així les icones del mapa surten del mateix conjunt que la
 * UI i no cal cap fitxer d'imatge.
 */
export function iconToDataUrl(Icon: IconType, color: string, sizePx: number): string {
  const svg = renderToStaticMarkup(<Icon color={color} size={sizePx} />);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function loadIconImage(Icon: IconType, color: string, sizePx: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(sizePx, sizePx);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('icon render failed'));
    img.src = iconToDataUrl(Icon, color, sizePx);
  });
}

/** Registra la icona al mapa si encara no hi és. */
export async function ensureMapIcon(map: mapboxgl.Map, id: string, Icon: IconType, color: string, sizePx = 64): Promise<void> {
  if (map.hasImage(id)) return;
  try {
    const img = await loadIconImage(Icon, color, sizePx);
    if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
  } catch {
    /* sense icona: la capa no es dibuixa */
  }
}
