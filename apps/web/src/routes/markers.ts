import mapboxgl from 'mapbox-gl';

/** Marcador d'imatge d'un objecte (previsualització, edició, assignació). */
export function createObjectMarker(options: {
  imageUrl: string;
  alt: string;
  lon: number;
  lat: number;
  draggable?: boolean;
  dimmed?: boolean;
  onClick?: (event: MouseEvent) => void;
}): { marker: mapboxgl.Marker; img: HTMLImageElement } {
  const img = document.createElement('img');
  img.className = 'draft-object';
  img.src = options.imageUrl;
  img.alt = options.alt;
  img.draggable = false;
  if (options.dimmed) img.style.opacity = '0.35';
  if (options.onClick) {
    img.style.cursor = 'pointer';
    img.addEventListener('click', (event) => {
      event.stopPropagation();
      options.onClick?.(event);
    });
  } else {
    img.style.cursor = options.draggable ? 'grab' : 'default';
  }
  const marker = new mapboxgl.Marker({ element: img, anchor: 'bottom', draggable: options.draggable ?? false }).setLngLat([
    options.lon,
    options.lat,
  ]);
  return { marker, img };
}

/** Marcador d'un punt de pas de la ruta manual. */
export function createWaypointMarker(lon: number, lat: number, first: boolean): mapboxgl.Marker {
  const dot = document.createElement('div');
  dot.className = `waypoint-marker${first ? ' waypoint-marker--first' : ''}`;
  return new mapboxgl.Marker({ element: dot }).setLngLat([lon, lat]);
}
