import mapboxgl from 'mapbox-gl';
import {
  AUTO_ROUTE_LENGTHS_M,
  STORY_TEXT_MAX_LENGTH,
  objectImageUrl,
  type AutoRouteLengthM,
  type CreateRouteObjectInput,
  type LngLat,
  type PlacedObjectDto,
  type PreviewRouteResponse,
} from '@petjada/shared';
import { api } from '../api/client';
import { t } from '../i18n/ca';
import { createMap, hasMapboxToken } from '../map/create-map';
import { drawRoute, fitRoute } from '../map/route-layer';
import { el } from '../ui/dom';
import { errorView } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { openSheet } from '../ui/sheet';
import { toast } from '../ui/toast';
import { locate } from './location';

type Mode = 'auto' | 'manual';

interface DraftObject extends PlacedObjectDto {
  title: string | null;
  storyText: string | null;
  storyImageUrl: string | null;
  marker: mapboxgl.Marker;
}

const PREVIEW_DEBOUNCE_MS = 600;
const LONG_PRESS_MS = 500;

/** Sheet per editar la fitxa d'un objecte proposat. Retorna `null` si s'ha demanat treure'l. */
function editObjectContent(draft: DraftObject): Promise<'saved' | 'removed'> {
  return new Promise((resolve) => {
    let result: 'saved' | 'removed' = 'saved';
    const title = el('input', { type: 'text', value: draft.title ?? '' });
    const story = el('textarea', { value: draft.storyText ?? '', rows: 4 });
    story.maxLength = STORY_TEXT_MAX_LENGTH;
    const counter = el('span', { className: 'hint', text: t.create.charsLeft(STORY_TEXT_MAX_LENGTH - story.value.length) });
    story.addEventListener('input', () => (counter.textContent = t.create.charsLeft(STORY_TEXT_MAX_LENGTH - story.value.length)));
    const image = el('input', { type: 'url', value: draft.storyImageUrl ?? '', placeholder: 'https://…', inputmode: 'url' });
    const body = el(
      'div',
      {},
      el('p', { className: 'hint', text: t.create.objectSheetHint }),
      el('div', { className: 'field' }, el('label', { text: t.create.objectTitle }), title),
      el('div', { className: 'field' }, el('label', { text: t.create.objectStory }), story, counter),
      el('div', { className: 'field' }, el('label', { text: t.create.objectImage }), image),
      el('button', {
        className: 'btn btn--ghost btn--block',
        text: t.create.removeObject,
        onClick: () => {
          result = 'removed';
          (document.querySelector('.sheet-overlay') as HTMLElement | null)?.click();
        },
      }),
    );
    void openSheet({ title: t.create.objectSheetTitle, body, closeLabel: t.app.save }).then(() => {
      if (result === 'saved') {
        draft.title = title.value.trim() || null;
        draft.storyText = story.value.trim() || null;
        draft.storyImageUrl = image.value.trim() || null;
      }
      resolve(result);
    });
  });
}

export const createRouteScreen: Screen = async (container) => {
  let mode: Mode = 'auto';
  let roundTrip = true;
  let targetLength: AutoRouteLengthM = AUTO_ROUTE_LENGTHS_M[1];
  let preview: PreviewRouteResponse | null = null;
  let origin: LngLat | null = null;
  const waypoints: LngLat[] = [];
  const waypointMarkers: mapboxgl.Marker[] = [];
  let drafts: DraftObject[] = [];
  let map: mapboxgl.Map | null = null;
  let previewTimer: number | null = null;
  let busy = false;

  const mapEl = el('div', { className: 'map' });
  const status = el('p', { className: 'hint', text: t.create.autoHint });
  const errorBox = el('p', { className: 'error hidden' });

  // --- Controls: mode ---
  const autoBtn = el('button', { className: 'is-active', text: t.create.modeAuto, onClick: () => setMode('auto') });
  const manualBtn = el('button', { text: t.create.modeManual, onClick: () => setMode('manual') });
  const modeSeg = el('div', { className: 'segmented' }, autoBtn, manualBtn);

  // --- Controls: auto ---
  const lengthChips = AUTO_ROUTE_LENGTHS_M.map((len) =>
    el('button', {
      className: `btn btn--chip ${len === targetLength ? 'is-active' : ''}`,
      text: t.create.lengthKm(len / 1000),
      onClick: () => {
        targetLength = len;
        for (const chip of lengthChips) chip.classList.toggle('is-active', chip.textContent === t.create.lengthKm(len / 1000));
      },
    }),
  );
  const generateBtn = el('button', { className: 'btn btn--block', text: t.create.generate, onClick: () => void runPreview() });
  const autoControls = el(
    'div',
    {},
    el('div', { className: 'chip-row' }, ...lengthChips),
    generateBtn,
  );

  // --- Controls: manual ---
  const undoBtn = el('button', { className: 'btn btn--secondary', text: t.create.undo, onClick: () => removeLastWaypoint() });
  const clearBtn = el('button', { className: 'btn btn--ghost', text: t.create.clear, onClick: () => clearWaypoints() });
  const manualInfo = el('span', { className: 'hint', text: t.create.points(0) });
  const manualControls = el('div', { className: 'hidden' }, el('div', { className: 'chip-row' }, undoBtn, clearBtn, manualInfo));

  // --- Round trip + form ---
  const roundTripInput = el('input', { type: 'checkbox', checked: roundTrip, onChange: () => {
    roundTrip = roundTripInput.checked;
    if (preview) void runPreview();
  } });
  const roundTripRow = el('label', { className: 'switch' }, el('span', { text: t.create.roundTrip }), roundTripInput);

  const nameInput = el('input', { type: 'text', autocomplete: 'off' });
  const descInput = el('textarea', { rows: 2 });
  const publicInput = el('input', { type: 'checkbox', checked: true });
  const lengthLabel = el('span', { className: 'tag' });
  const objectsLabel = el('span', { className: 'tag tag--accent' });
  const saveBtn = el('button', { className: 'btn btn--block btn--accent', text: t.create.save, onClick: () => void save() });
  const form = el(
    'div',
    { className: 'hidden' },
    el('div', { className: 'meta', style: { marginBottom: '12px' } }, lengthLabel, objectsLabel),
    el('div', { className: 'field' }, el('label', { text: t.create.name }), nameInput),
    el('div', { className: 'field' }, el('label', { text: t.create.description }), descInput),
    el('label', { className: 'switch' }, el('span', {}, el('div', { text: t.create.isPublic }), el('div', { className: 'hint', text: t.create.isPublicHint })), publicInput),
    saveBtn,
  );

  const sheet = el(
    'div',
    { className: 'sheet' },
    el('div', { className: 'sheet__handle' }),
    modeSeg,
    status,
    autoControls,
    manualControls,
    roundTripRow,
    errorBox,
    form,
  );

  container.append(
    el(
      'div',
      { className: 'screen screen--map' },
      mapEl,
      el(
        'header',
        { className: 'topbar topbar--overlay' },
        el('button', { className: 'btn btn--icon', text: '‹', title: t.app.back, onClick: () => router.navigate('/rutes') }),
        el('h1', { text: t.create.title }),
      ),
      sheet,
    ),
  );

  if (!hasMapboxToken()) {
    mapEl.append(el('div', { className: 'centered', text: t.app.noMapboxToken }));
    return;
  }

  try {
    origin = await locate();
  } catch {
    sheet.replaceChildren(errorView(t.create.locationNeeded, () => router.navigate('/crear')));
    return;
  }

  map = createMap({ container: mapEl, center: origin, zoom: 15.5, pitch: 40 });
  map.on('load', () => {
    new mapboxgl.Marker({ color: '#F5A623' }).setLngLat([origin!.lon, origin!.lat]).addTo(map!);
  });

  // Toc curt: afegeix waypoint (manual). Toc llarg: afegeix objecte (manual, amb previsualització).
  let pressTimer: number | null = null;
  let longPressed = false;
  map.on('mousedown', (e) => startPress(e.lngLat));
  map.on('touchstart', (e) => startPress(e.lngLat));
  map.on('mouseup', cancelPress);
  map.on('touchend', cancelPress);
  map.on('dragstart', cancelPress);
  map.on('click', (e) => {
    if (mode !== 'manual' || longPressed) {
      longPressed = false;
      return;
    }
    addWaypoint({ lon: e.lngLat.lng, lat: e.lngLat.lat });
  });

  function startPress(lngLat: mapboxgl.LngLat): void {
    cancelPress();
    if (mode !== 'manual' || !preview) return;
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      addDraftObject({ lon: lngLat.lng, lat: lngLat.lat });
    }, LONG_PRESS_MS);
  }

  function cancelPress(): void {
    if (pressTimer !== null) window.clearTimeout(pressTimer);
    pressTimer = null;
  }

  function setMode(next: Mode): void {
    mode = next;
    autoBtn.classList.toggle('is-active', next === 'auto');
    manualBtn.classList.toggle('is-active', next === 'manual');
    autoControls.classList.toggle('hidden', next !== 'auto');
    manualControls.classList.toggle('hidden', next !== 'manual');
    status.textContent = next === 'auto' ? t.create.autoHint : t.create.manualHint;
    clearPreview();
    clearWaypoints();
  }

  function showError(message: string | null): void {
    errorBox.textContent = message ?? '';
    errorBox.classList.toggle('hidden', message === null);
  }

  function addWaypoint(p: LngLat): void {
    waypoints.push(p);
    const marker = new mapboxgl.Marker({
      element: el('div', { className: `waypoint-marker ${waypoints.length === 1 ? 'waypoint-marker--first' : ''}` }),
    })
      .setLngLat([p.lon, p.lat])
      .addTo(map!);
    waypointMarkers.push(marker);
    manualInfo.textContent = t.create.points(waypoints.length);
    schedulePreview();
  }

  function removeLastWaypoint(): void {
    waypoints.pop();
    waypointMarkers.pop()?.remove();
    manualInfo.textContent = t.create.points(waypoints.length);
    if (waypoints.length < 2) clearPreview();
    else schedulePreview();
  }

  function clearWaypoints(): void {
    waypoints.length = 0;
    for (const m of waypointMarkers) m.remove();
    waypointMarkers.length = 0;
    manualInfo.textContent = t.create.points(0);
  }

  function schedulePreview(): void {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    if (waypoints.length < 2) return;
    previewTimer = window.setTimeout(() => void runPreview(), PREVIEW_DEBOUNCE_MS);
  }

  function clearPreview(): void {
    preview = null;
    for (const d of drafts) d.marker.remove();
    drafts = [];
    if (map) void drawRoute(map, null);
    form.classList.add('hidden');
    showError(null);
  }

  async function runPreview(): Promise<void> {
    if (!map || !origin || busy) return;
    if (mode === 'manual' && waypoints.length < 2) {
      showError(t.create.manualNeedsTwo);
      return;
    }
    busy = true;
    showError(null);
    generateBtn.disabled = true;
    status.textContent = t.create.generating;
    try {
      preview = await api.routes.preview(
        mode === 'auto'
          ? { mode: 'auto', origin, targetLengthM: targetLength, roundTrip }
          : { mode: 'manual', waypoints: [...waypoints], roundTrip },
      );
      void drawRoute(map, preview.geometry);
      fitRoute(map, preview.geometry, 80);
      for (const d of drafts) d.marker.remove();
      drafts = preview.objects.map((o) => createDraft(o));
      lengthLabel.textContent = t.create.length_m(t.units.distance(preview.lengthM));
      objectsLabel.textContent = t.create.objectsCount(drafts.length);
      if (!nameInput.value) nameInput.value = preview.suggestedName;
      if (!descInput.value) descInput.value = preview.suggestedDescription;
      form.classList.remove('hidden');
      generateBtn.textContent = t.create.regenerate;
      status.textContent = mode === 'manual' ? t.create.manualObjectsHint : t.create.autoHint;
    } catch {
      showError(t.create.previewError);
      status.textContent = mode === 'auto' ? t.create.autoHint : t.create.manualHint;
    } finally {
      busy = false;
      generateBtn.disabled = false;
    }
  }

  function createDraft(placed: PlacedObjectDto, content?: Partial<DraftObject>): DraftObject {
    const img = el('img', { className: 'draft-object', src: objectImageUrl(placed.type), alt: placed.type });
    img.draggable = false;
    const marker = new mapboxgl.Marker({ element: img, anchor: 'bottom', draggable: mode === 'manual' })
      .setLngLat([placed.lon, placed.lat])
      .addTo(map!);
    const draft: DraftObject = {
      ...placed,
      title: content?.title ?? null,
      storyText: content?.storyText ?? null,
      storyImageUrl: content?.storyImageUrl ?? null,
      marker,
    };
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      draft.lon = p.lng;
      draft.lat = p.lat;
    });
    if (mode === 'manual') {
      img.addEventListener('click', (event) => {
        event.stopPropagation();
        void editObjectContent(draft).then((result) => {
          if (result === 'removed') {
            marker.remove();
            drafts = drafts.filter((d) => d !== draft);
            objectsLabel.textContent = t.create.objectsCount(drafts.length);
          } else {
            img.classList.toggle('has-content', Boolean(draft.title || draft.storyText));
          }
        });
      });
    }
    return draft;
  }

  function addDraftObject(p: LngLat): void {
    if (!preview) return;
    const draft = createDraft({ lon: p.lon, lat: p.lat, type: 'gla', leg: 'anada', points: 0, distanceFromStartM: 0 });
    drafts.push(draft);
    objectsLabel.textContent = t.create.objectsCount(drafts.length);
  }

  async function save(): Promise<void> {
    if (!preview) return;
    const name = nameInput.value.trim();
    if (!name) {
      showError(t.create.nameRequired);
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = t.create.saving;
    const objects: CreateRouteObjectInput[] | undefined =
      mode === 'manual'
        ? drafts.map((d) => ({
            lon: d.lon,
            lat: d.lat,
            type: d.type,
            leg: d.leg,
            title: d.title,
            storyText: d.storyText,
            storyImageUrl: d.storyImageUrl,
          }))
        : undefined;
    try {
      const created = await api.routes.create({
        name,
        description: descInput.value.trim(),
        isPublic: publicInput.checked,
        roundTrip,
        geometry: preview.geometry,
        objects,
      });
      router.navigate(`/rutes/${created.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : t.create.saveError, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = t.create.save;
    }
  }

  return () => {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    for (const d of drafts) d.marker.remove();
    for (const m of waypointMarkers) m.remove();
    map?.remove();
  };
};
