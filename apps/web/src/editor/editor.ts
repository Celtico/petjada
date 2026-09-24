import mapboxgl from 'mapbox-gl';
import {
  STORY_TEXT_MAX_LENGTH,
  type CollectionDetailDto,
  type CollectionSummaryDto,
  type LngLat,
  type PolygonGeometry,
  type Position,
  type RouteObjectContentDto,
  type RouteSummaryDto,
} from '@petjada/shared';
import { api } from '../api/client';
import { session } from '../auth/session';
import { t } from '../i18n/ca';
import { createMap, hasMapboxToken, whenStyleLoaded } from '../map/create-map';
import { locate } from '../routes/location';
import { el } from '../ui/dom';
import { errorView, loadingView, page } from '../ui/layout';
import { confirmDialog } from '../ui/modal';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { openSheet } from '../ui/sheet';
import { toast } from '../ui/toast';

const ZONE_SOURCE = 'petjada-zone';

/** Test punt-dins-polígon (ray casting) per filtrar rutes dins de la zona. */
export function pointInPolygon(point: LngLat, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

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

async function drawZone(map: mapboxgl.Map, vertices: Position[]): Promise<void> {
  await whenStyleLoaded(map);
  const source = map.getSource(ZONE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(zoneFeature(vertices));
    return;
  }
  map.addSource(ZONE_SOURCE, { type: 'geojson', data: zoneFeature(vertices) });
  map.addLayer({ id: `${ZONE_SOURCE}-fill`, type: 'fill', source: ZONE_SOURCE, slot: 'top', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#1F8A70', 'fill-opacity': 0.18 } });
  map.addLayer({ id: `${ZONE_SOURCE}-line`, type: 'line', source: ZONE_SOURCE, slot: 'top', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#1F8A70', 'line-width': 3 } });
  map.addLayer({ id: `${ZONE_SOURCE}-points`, type: 'circle', source: ZONE_SOURCE, slot: 'top', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#F5A623', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
}

// ---------------------------------------------------------------------------
// Llistat
// ---------------------------------------------------------------------------

export const editorScreen: Screen = async (container) => {
  if (!session.isEditor()) {
    router.navigate('/rutes', true);
    return;
  }
  const content = el('div', { className: 'content' }, loadingView());
  container.append(page({ title: t.editor.title, activePath: '/editor', content }));

  const load = async () => {
    try {
      const position = await locate();
      const [collections, routes] = await Promise.all([api.collections.nearby(position), api.routes.nearby(position)]);
      const mine = collections.filter((c) => c.createdBy === session.user?.id);
      const myRoutes = routes.filter((r) => r.isMine);
      content.replaceChildren(
        el('p', { className: 'hint', text: t.editor.intro }),
        el('button', { className: 'btn btn--accent btn--block', text: `+ ${t.editor.newCollection}`, onClick: () => router.navigate('/editor/colleccions/nova') }),
        el('h2', { className: 'section-title', text: t.editor.myCollections }),
        mine.length === 0 ? el('p', { className: 'hint', text: t.editor.noCollections }) : el('div', {}, ...mine.map(editorCollectionCard)),
        el('h2', { className: 'section-title', text: t.editor.myRoutes }),
        myRoutes.length === 0 ? el('p', { className: 'hint', text: t.routes.empty }) : el('div', {}, ...myRoutes.map(editorRouteCard)),
      );
    } catch (error) {
      content.replaceChildren(errorView(error instanceof Error ? error.message : t.editor.routesLoadError, () => void load()));
    }
  };
  void load();
};

function editorCollectionCard(c: CollectionSummaryDto): HTMLElement {
  return el(
    'button',
    { className: 'card', onClick: () => router.navigate(`/editor/colleccions/${c.id}`) },
    el('h3', { text: c.name }),
    c.description ? el('p', { text: c.description }) : null,
    el('div', { className: 'meta' }, el('span', { className: 'tag', text: t.editor.assigned(c.objectCount) }), el('span', { className: 'tag tag--accent', text: t.album.bonus(c.bonusPoints) })),
  );
}

function editorRouteCard(r: RouteSummaryDto): HTMLElement {
  return el(
    'button',
    { className: 'card', onClick: () => router.navigate(`/editor/rutes/${r.id}/fitxes`) },
    el('h3', { text: r.name }),
    el('div', { className: 'meta' }, el('span', { className: 'tag', text: t.routes.objects(r.objectCount) }), el('span', { className: 'tag tag--accent', text: t.editor.editCards })),
  );
}

// ---------------------------------------------------------------------------
// Crear / editar col·lecció (zona + dades + assignació d'objectes)
// ---------------------------------------------------------------------------

export const editorCollectionScreen: Screen = async (container, params) => {
  if (!session.isEditor()) {
    router.navigate('/rutes', true);
    return;
  }
  const isNew = params.id === 'nova';
  let collection: CollectionDetailDto | null = null;
  let vertices: Position[] = [];
  let map: mapboxgl.Map | null = null;
  let selected = new Set<string>();
  let objectMarkers: mapboxgl.Marker[] = [];

  const mapEl = el('div', { className: 'map' });
  const nameInput = el('input', { type: 'text' });
  const descInput = el('textarea', { rows: 2 });
  const coverInput = el('input', { type: 'url', placeholder: 'https://…', inputmode: 'url' });
  const bonusInput = el('input', { type: 'number', inputmode: 'numeric', min: '0', step: '10', value: '50' });
  const zoneInfo = el('span', { className: 'hint', text: t.editor.zoneHint });
  const saveBtn = el('button', { className: 'btn btn--block btn--accent', text: t.editor.saveCollection, onClick: () => void save() });
  const assignBox = el('div', { className: 'hidden' });
  const assignInfo = el('span', { className: 'hint' });
  const assignSaveBtn = el('button', { className: 'btn btn--block', text: t.editor.assignSave, onClick: () => void saveAssignment() });
  assignBox.append(el('h3', { text: t.editor.assignTitle }), el('p', { className: 'hint', text: t.editor.assignHint }), assignInfo, assignSaveBtn);

  const sheet = el(
    'div',
    { className: 'sheet' },
    el('div', { className: 'sheet__handle' }),
    el('h2', { text: isNew ? t.editor.newCollection : t.editor.editCollection }),
    el('div', { className: 'chip-row' }, el('button', { className: 'btn btn--chip', text: t.editor.undoVertex, onClick: () => setVertices(vertices.slice(0, -1)) }), el('button', { className: 'btn btn--chip', text: t.editor.clearZone, onClick: () => setVertices([]) }), zoneInfo),
    el('div', { className: 'field' }, el('label', { text: t.editor.name }), nameInput),
    el('div', { className: 'field' }, el('label', { text: t.editor.description }), descInput),
    el('div', { className: 'field' }, el('label', { text: t.editor.coverImage }), coverInput),
    el('div', { className: 'field' }, el('label', { text: t.editor.bonusPoints }), bonusInput),
    saveBtn,
    assignBox,
    isNew
      ? null
      : el('button', {
          className: 'btn btn--ghost btn--block',
          style: { marginTop: '8px' },
          text: t.editor.deleteCollection,
          onClick: async () => {
            if (!collection) return;
            const ok = await confirmDialog({ title: t.editor.deleteConfirm, confirmLabel: t.app.delete, cancelLabel: t.app.cancel, danger: true });
            if (!ok) return;
            await api.collections.remove(collection.id);
            toast(t.editor.deleted, 'info');
            router.navigate('/editor');
          },
        }),
  );

  container.append(
    el(
      'div',
      { className: 'screen screen--map' },
      mapEl,
      el('header', { className: 'topbar topbar--overlay' }, el('button', { className: 'btn btn--icon', text: '‹', title: t.app.back, onClick: () => router.navigate('/editor') }), el('h1', { text: t.editor.title })),
      sheet,
    ),
  );

  if (!hasMapboxToken()) {
    mapEl.append(el('div', { className: 'centered', text: t.app.noMapboxToken }));
    return;
  }

  let center: LngLat;
  try {
    if (!isNew) {
      collection = await api.collections.get(params.id);
      nameInput.value = collection.name;
      descInput.value = collection.description;
      coverInput.value = collection.coverImageUrl ?? '';
      bonusInput.value = String(collection.bonusPoints);
      vertices = collection.zone.coordinates[0].slice(0, -1);
      selected = new Set(collection.items.map((i) => i.objectId));
      center = { lon: vertices[0][0], lat: vertices[0][1] };
    } else {
      center = await locate();
    }
  } catch {
    sheet.replaceChildren(errorView(t.editor.locationNeeded, () => router.navigate('/editor')));
    return;
  }

  map = createMap({ container: mapEl, center, zoom: 13 });
  map.on('load', () => {
    void drawZone(map!, vertices);
    if (!isNew) void loadObjectsInZone();
  });
  map.on('click', (e) => {
    if (objectMarkers.length > 0) return; // en mode assignació no s'editen vèrtexs
    setVertices([...vertices, [e.lngLat.lng, e.lngLat.lat]]);
  });

  function setVertices(next: Position[]): void {
    vertices = next;
    zoneInfo.textContent = vertices.length < 3 ? t.editor.zoneHint : t.create.points(vertices.length);
    if (map) void drawZone(map, vertices);
  }

  function polygon(): PolygonGeometry {
    return { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] };
  }

  async function save(): Promise<void> {
    const name = nameInput.value.trim();
    if (!name) return toast(t.editor.nameRequired, 'error');
    if (vertices.length < 3) return toast(t.editor.zoneNeeded, 'error');
    saveBtn.disabled = true;
    const body = {
      name,
      description: descInput.value.trim(),
      zone: polygon(),
      coverImageUrl: coverInput.value.trim() || null,
      bonusPoints: Math.max(0, Number(bonusInput.value) || 0),
    };
    try {
      collection = collection ? await api.collections.update(collection.id, body) : await api.collections.create(body);
      toast(t.editor.saved, 'success');
      if (isNew) {
        router.navigate(`/editor/colleccions/${collection.id}`, true);
        return;
      }
      await loadObjectsInZone();
    } catch (error) {
      toast(error instanceof Error ? error.message : t.app.genericError, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  /** Mostra els objectes de les rutes pròpies dins de la zona com a marcadors seleccionables. */
  async function loadObjectsInZone(): Promise<void> {
    if (!map || !collection) return;
    for (const m of objectMarkers) m.remove();
    objectMarkers = [];
    assignBox.classList.remove('hidden');
    const routes = await api.routes.nearby({ lon: vertices[0][0], lat: vertices[0][1] });
    const ring = [...vertices, vertices[0]];
    const mine = routes.filter((r) => r.isMine);
    let count = 0;
    for (const summary of mine) {
      const route = await api.routes.get(summary.id);
      for (const object of route.objects) {
        if (!pointInPolygon(object, ring)) continue;
        count++;
        const img = el('img', { className: `draft-object ${selected.has(object.id) ? 'is-selected' : ''}`, src: object.imageUrl, alt: object.type });
        img.addEventListener('click', (event) => {
          event.stopPropagation();
          if (selected.has(object.id)) selected.delete(object.id);
          else selected.add(object.id);
          img.classList.toggle('is-selected', selected.has(object.id));
          assignInfo.textContent = t.editor.assigned(selected.size);
        });
        objectMarkers.push(new mapboxgl.Marker({ element: img, anchor: 'bottom' }).setLngLat([object.lon, object.lat]).addTo(map));
      }
    }
    assignInfo.textContent = count === 0 ? t.editor.noRoutesInZone : t.editor.assigned(selected.size);
  }

  async function saveAssignment(): Promise<void> {
    if (!collection) return;
    assignSaveBtn.disabled = true;
    try {
      collection = await api.collections.assignObjects(collection.id, { objectIds: [...selected] });
      toast(t.editor.saved, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : t.app.genericError, 'error');
    } finally {
      assignSaveBtn.disabled = false;
    }
  }

  return () => {
    for (const m of objectMarkers) m.remove();
    map?.remove();
  };
};

// ---------------------------------------------------------------------------
// Fitxes dels objectes d'una ruta pròpia
// ---------------------------------------------------------------------------

function editCardSheet(object: RouteObjectContentDto): Promise<RouteObjectContentDto | null> {
  return new Promise((resolve) => {
    const title = el('input', { type: 'text', value: object.title ?? '' });
    const story = el('textarea', { value: object.storyText ?? '', rows: 5 });
    story.maxLength = STORY_TEXT_MAX_LENGTH;
    const counter = el('span', { className: 'hint', text: t.create.charsLeft(STORY_TEXT_MAX_LENGTH - story.value.length) });
    story.addEventListener('input', () => (counter.textContent = t.create.charsLeft(STORY_TEXT_MAX_LENGTH - story.value.length)));
    const image = el('input', { type: 'url', value: object.storyImageUrl ?? '', placeholder: 'https://…', inputmode: 'url' });
    let saved: RouteObjectContentDto | null = null;
    const saveBtn = el('button', {
      className: 'btn btn--block btn--accent',
      text: t.app.save,
      onClick: async () => {
        saveBtn.disabled = true;
        try {
          saved = await api.objects.updateContent(object.id, {
            title: title.value.trim() || null,
            storyText: story.value.trim() || null,
            storyImageUrl: image.value.trim() || null,
          });
          toast(t.create.objectSaved, 'success');
          (document.querySelector('.sheet-overlay') as HTMLElement | null)?.click();
        } catch (error) {
          toast(error instanceof Error ? error.message : t.app.genericError, 'error');
          saveBtn.disabled = false;
        }
      },
    });
    const body = el(
      'div',
      {},
      el('img', { className: 'card-view__img', src: object.imageUrl, alt: object.type }),
      el('div', { className: 'field' }, el('label', { text: t.create.objectTitle }), title),
      el('div', { className: 'field' }, el('label', { text: t.create.objectStory }), story, counter),
      el('div', { className: 'field' }, el('label', { text: t.create.objectImage }), image),
      saveBtn,
    );
    void openSheet({ title: t.create.objectSheetTitle, body, closeLabel: t.app.close }).then(() => resolve(saved));
  });
}

export const editorRouteCardsScreen: Screen = async (container, params) => {
  if (!session.isEditor()) {
    router.navigate('/rutes', true);
    return;
  }
  const content = el('div', { className: 'content' }, loadingView());
  const screen = page({ title: t.editor.title, activePath: '/editor', content, back: () => router.navigate('/editor') });
  container.append(screen);

  const load = async () => {
    try {
      const [route, objects] = await Promise.all([api.routes.get(params.id), api.routes.objectsContent(params.id)]);
      const title = screen.querySelector('h1');
      if (title) title.textContent = t.editor.cardsTitle(route.name);
      content.replaceChildren(
        objects.length === 0
          ? el('p', { className: 'hint', text: t.editor.noObjects })
          : el(
              'div',
              {},
              ...objects.map((object) =>
                el(
                  'button',
                  {
                    className: 'card card--row',
                    onClick: async () => {
                      const updated = await editCardSheet(object);
                      if (updated) void load();
                    },
                  },
                  el('img', { className: 'card__thumb', src: object.imageUrl, alt: object.type }),
                  el(
                    'div',
                    { className: 'card__body' },
                    el('h3', { text: object.title ?? t.objects.names[object.type] ?? object.type }),
                    el('p', { text: object.storyText ?? `${t.units.distance(object.distanceFromStartM)} · ${object.leg}` }),
                    el('div', { className: 'meta' }, el('span', { className: 'tag', text: `${object.points} ${t.app.points}` }), object.title || object.storyText ? el('span', { className: 'tag tag--accent', text: t.routes.hasContent }) : null),
                  ),
                ),
              ),
            ),
      );
    } catch (error) {
      content.replaceChildren(errorView(error instanceof Error ? error.message : t.app.genericError, () => void load()));
    }
  };
  void load();
};
