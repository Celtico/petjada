import mapboxgl from 'mapbox-gl';
import type { RouteDetailDto } from '@petjada/shared';
import { api, ApiError } from '../api/client';
import { t } from '../i18n/ca';
import { createMap, hasMapboxToken } from '../map/create-map';
import { toLngLat } from '../map/geo';
import { drawRoute, fitRoute } from '../map/route-layer';
import { el, setChildren } from '../ui/dom';
import { errorView, loadingView } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { toast } from '../ui/toast';

/** Marcadors senzills dels objectes per a la previsualització (sense flotació). */
export function addObjectPreviewMarkers(
  map: mapboxgl.Map,
  objects: readonly { lon: number; lat: number; imageUrl: string; captured?: boolean }[],
): mapboxgl.Marker[] {
  return objects.map((o) => {
    const img = el('img', { className: 'draft-object', src: o.imageUrl, alt: '' });
    if (o.captured) img.style.opacity = '0.35';
    img.style.cursor = 'default';
    return new mapboxgl.Marker({ element: img, anchor: 'bottom' }).setLngLat([o.lon, o.lat]).addTo(map);
  });
}

export const routeDetailScreen: Screen = async (container, params) => {
  const mapEl = el('div', { className: 'map' });
  const sheet = el('div', { className: 'sheet' }, el('div', { className: 'sheet__handle' }), loadingView());
  const screen = el(
    'div',
    { className: 'screen screen--map' },
    mapEl,
    el(
      'header',
      { className: 'topbar topbar--overlay' },
      el('button', { className: 'btn btn--icon', text: '‹', title: t.app.back, onClick: () => router.navigate('/rutes') }),
      el('h1', { text: t.routes.detailTitle }),
    ),
    sheet,
  );
  container.append(screen);

  let map: mapboxgl.Map | null = null;
  let markers: mapboxgl.Marker[] = [];
  let route: RouteDetailDto;
  try {
    route = await api.routes.get(params.id);
  } catch (error) {
    sheet.replaceChildren(errorView(error instanceof Error ? error.message : t.app.genericError));
    return;
  }

  if (hasMapboxToken()) {
    map = createMap({ container: mapEl, center: toLngLat(route.geometry.coordinates[0]), pitch: 45 });
    map.on('load', () => {
      if (!map) return;
      void drawRoute(map, route.geometry);
      markers = addObjectPreviewMarkers(map, route.objects);
      fitRoute(map, route.geometry, 80);
    });
  } else {
    mapEl.append(el('div', { className: 'centered', text: t.app.noMapboxToken }));
  }

  const tags = [
    route.status === 'completed' ? el('span', { className: 'tag tag--done', text: `✓ ${t.routes.completed}` }) : null,
    route.isOfficial ? el('span', { className: 'tag tag--official', text: t.routes.official }) : null,
    el('span', { className: 'tag', text: route.roundTrip ? t.routes.roundTrip : t.routes.oneWay }),
    el('span', { className: 'tag', text: t.units.distance(route.lengthM) }),
    el('span', { className: 'tag', text: t.routes.objects(route.objectCount) }),
    el('span', { className: 'tag', text: route.isPublic ? t.routes.public : t.routes.private }),
  ];

  const startButton = el('button', {
    className: 'btn btn--block',
    text: route.status === 'in_progress' ? t.routes.resume : t.routes.start,
    onClick: async () => {
      startButton.disabled = true;
      try {
        if (route.status === 'in_progress') {
          router.navigate('/ruta');
          return;
        }
        await api.routes.start(route.id);
        router.navigate('/ruta');
      } catch (error) {
        const message = error instanceof ApiError && error.code === 'CONFLICT' ? t.routes.activeElsewhere : t.routes.startError;
        toast(message, 'error');
        startButton.disabled = false;
      }
    },
  });

  setChildren(
    sheet,
    el('div', { className: 'sheet__handle' }),
    el('h2', { text: route.name }),
    route.description ? el('p', { style: { color: 'var(--color-muted)', margin: '0 0 8px' }, text: route.description }) : null,
    el('div', { className: 'meta' }, ...tags),
    el('p', {
      style: { margin: '8px 0 12px', color: 'var(--color-muted)' },
      text: route.pendingObjectCount === 0 && route.objectCount > 0 ? t.routes.allCaptured : t.routes.pendingObjects(route.pendingObjectCount),
    }),
    startButton,
  );

  return () => {
    for (const m of markers) m.remove();
    map?.remove();
  };
};
