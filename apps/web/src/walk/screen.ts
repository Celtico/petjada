import type mapboxgl from 'mapbox-gl';
import type { RouteObjectDto } from '@petjada/shared';
import { session } from '../auth/session';
import { t } from '../i18n/ca';
import { createMap, hasMapboxToken, WALK_PITCH, WALK_ZOOM } from '../map/create-map';
import { FootprintLayer } from '../map/footprint-layer';
import { drawRoute } from '../map/route-layer';
import { UserMarker } from '../map/user-marker';
import { showCard } from '../objects/card';
import { HtmlObjectRenderer } from '../objects/html-renderer';
import { nearestPending } from '../objects/visibility';
import { simulation } from '../sim';
import { el } from '../ui/dom';
import { errorView, loadingView } from '../ui/layout';
import { confirmDialog, infoDialog } from '../ui/modal';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { toast } from '../ui/toast';
import { walkSession } from './session';

/** Pantalla de ruta activa: mapa 3D, HUD, petjades, objectes i captura. */
export const walkScreen: Screen = async (container) => {
  const mapEl = el('div', { className: 'map' });
  const pointsPill = el('span', { className: 'pill pill--accent' });
  const pendingPill = el('span', { className: 'pill' });
  const signalPill = el('span', { className: 'pill pill--warn', text: t.walk.improvingSignal });
  const nextPill = el('span', { className: 'pill pill--dark', text: t.walk.noNextObject });
  const hud = el(
    'div',
    { className: 'hud' },
    el('div', { className: 'hud__row' }, pointsPill, pendingPill, signalPill),
    el('div', { className: 'hud__row' }, nextPill),
  );
  const centerBtn = el('button', { className: 'btn btn--icon', text: '◎', title: t.walk.center, onClick: () => { follow = true; recenter(); } });
  const cameraBtn = el('button', { className: 'btn btn--block', text: `📷 ${t.walk.camera}`, onClick: () => router.navigate('/ruta/camera') });
  const finishBtn = el('button', { className: 'btn btn--secondary', text: t.walk.finish, onClick: () => void finish() });
  const actions = el('div', { className: 'bottom-actions bottom-actions--transparent' }, centerBtn, cameraBtn, finishBtn);
  const screen = el('div', { className: 'screen screen--map' }, mapEl, hud, actions);
  container.append(screen);

  let follow = true;
  let map: mapboxgl.Map | null = null;
  let renderer: HtmlObjectRenderer | null = null;
  let userMarker: UserMarker | null = null;
  let footprintLayer: FootprintLayer | null = null;
  const unsubscribe: Array<() => void> = [];

  const overlay = el('div', { className: 'centered' }, loadingView());
  screen.append(overlay);

  try {
    const active = await walkSession.resume();
    if (!active) {
      overlay.replaceChildren(errorView(t.walk.noActive, () => router.navigate('/rutes')));
      return;
    }
  } catch (error) {
    overlay.replaceChildren(errorView(error instanceof Error ? error.message : t.app.genericError, () => router.navigate('/rutes')));
    return;
  }
  overlay.remove();
  const route = walkSession.route!;

  if (!hasMapboxToken()) {
    mapEl.append(el('div', { className: 'centered', text: t.app.noMapboxToken }));
    return () => undefined;
  }

  const start = walkSession.position ?? simulation.currentPosition() ?? { lon: route.geometry.coordinates[0][0], lat: route.geometry.coordinates[0][1] };
  map = createMap({ container: mapEl, center: start, zoom: WALK_ZOOM, pitch: WALK_PITCH });
  renderer = new HtmlObjectRenderer(map);
  userMarker = new UserMarker(map);
  footprintLayer = new FootprintLayer(map);
  simulation.attachMap(map);
  map.on('dragstart', () => (follow = false));
  map.on('load', () => {
    if (!map) return;
    void drawRoute(map, route.geometry);
    void footprintLayer?.update(walkSession.allFootprints);
    renderer?.setObjects(walkSession.pendingObjects);
    renderer?.update(walkSession.currentViews());
  });

  function recenter(): void {
    const p = walkSession.position;
    if (!map || !p) return;
    map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), WALK_ZOOM - 1), pitch: WALK_PITCH, duration: 600 });
  }

  function renderHud(): void {
    pointsPill.textContent = `★ ${session.user?.totalPoints ?? 0} ${t.app.pointsShort}`;
    pendingPill.textContent = t.walk.pending(walkSession.pendingObjects.length);
    const state = walkSession.trackerState;
    if (!state || state.improvingSignal || !state.position) {
      signalPill.textContent = t.walk.improvingSignal;
      signalPill.classList.remove('hidden');
    } else if (state.position.accuracy > 15) {
      signalPill.textContent = t.walk.accuracy(state.position.accuracy);
      signalPill.classList.remove('hidden');
    } else {
      signalPill.classList.add('hidden');
    }
    const nearest = nearestPending(walkSession.currentViews(), walkSession.hasReachedTurnaround);
    nextPill.textContent = nearest && Number.isFinite(nearest.distanceM) ? t.walk.nextObject(t.units.distance(nearest.distanceM)) : t.walk.noNextObject;
  }

  unsubscribe.push(
    walkSession.positions.on((p) => {
      userMarker?.update(p, p.accuracy);
      if (follow && map) map.easeTo({ center: [p.lon, p.lat], duration: 800, easing: (x) => x });
    }),
    walkSession.states.on(() => renderHud()),
    walkSession.footprints.on((fps) => void footprintLayer?.update(fps)),
    walkSession.objectsChanged.on((objects) => {
      renderer?.setObjects(objects);
      renderHud();
    }),
    walkSession.views.on((views) => {
      renderer?.update(views);
      renderHud();
    }),
    walkSession.turnaround.on((reached) => {
      if (reached) toast(t.walk.turnaroundReached, 'accent', 4000);
    }),
    walkSession.captured.on(async ({ object, response }) => {
      await renderer?.playCapture(object.id);
      toast(t.objects.captured(response.points, t.objects.names[object.type] ?? object.type), 'success');
      renderHud();
      await showCard(response.card, { capturedAt: response.capturedAt, collectionCompleted: response.collectionCompleted });
    }),
    walkSession.captureFailed.on(({ code, message }) => toast(t.objects.errors[code] ?? message ?? t.app.genericError, 'error')),
    walkSession.gpsErrors.on((e) => toast(e.code === 'PERMISSION_DENIED' ? t.walk.gpsDenied : t.walk.gpsUnavailable, 'error', 4000)),
    renderer.onTap((object: RouteObjectDto) => {
      const view = walkSession.currentViews().find((v) => v.object.id === object.id);
      if (!view?.capturable) {
        toast(t.objects.approach, 'info');
        return;
      }
      void walkSession.capture(object);
    }),
    session.subscribe(() => renderHud()),
  );
  renderHud();

  async function finish(): Promise<void> {
    const ok = await confirmDialog({ title: t.walk.finishConfirm, confirmLabel: t.walk.finishConfirmYes, cancelLabel: t.app.cancel });
    if (!ok) return;
    finishBtn.disabled = true;
    finishBtn.textContent = t.walk.finishing;
    try {
      const res = await walkSession.finish();
      await infoDialog({
        title: res.completed ? t.walk.resultCompleted : t.walk.resultNotCompleted,
        lines: [t.walk.coverage(Math.round(res.coverage * 100)), t.walk.bonus(res.bonusPoints), t.walk.totalPoints(res.totalPoints)],
        okLabel: t.walk.backToRoutes,
      });
      router.navigate('/rutes');
    } catch (error) {
      toast(error instanceof Error ? error.message : t.app.genericError, 'error');
      finishBtn.disabled = false;
      finishBtn.textContent = t.walk.finish;
    }
  }

  return () => {
    for (const off of unsubscribe) off();
    simulation.attachMap(null);
    renderer?.destroy();
    userMarker?.remove();
    map?.remove();
  };
};
