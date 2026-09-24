import mapboxgl from 'mapbox-gl';
import type { RouteObjectDto } from '@petjada/shared';
import { config } from '../config';
import type { OrientationReading, OrientationSource } from '../gps/types';
import { t } from '../i18n/ca';
import { createMap, hasMapboxToken } from '../map/create-map';
import { haversineM, toDeg } from '../map/geo';
import { showCard } from '../objects/card';
import { HtmlObjectRenderer } from '../objects/html-renderer';
import { nearestVisible, type ObjectView } from '../objects/visibility';
import { simulation } from '../sim';
import { el } from '../ui/dom';
import { errorView } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { toast } from '../ui/toast';
import { walkSession } from '../walk/session';
import { AlignmentStateMachine, type AlignmentResult } from './alignment';
import { CameraFeed } from './camera';
import { RealOrientationSource } from './orientation';

/** Pitch màxim que accepta Mapbox (graus). */
const MAX_MAP_PITCH = 85;

interface TransformWithFov {
  transform?: { fov?: number };
}

/**
 * Ajusta el FOV vertical del mapa al de la càmera del mòbil.
 * Mapbox GL no exposa el FOV públicament: `transform.fov` és intern i el
 * limita a [0.01, 60] graus. Si no existeix, es deixa el valor per defecte (~36.9°).
 */
function applyFov(map: mapboxgl.Map, fovDeg: number): void {
  const transform = (map as unknown as TransformWithFov).transform;
  if (transform && typeof transform.fov === 'number') {
    transform.fov = Math.min(60, fovDeg);
  }
}

/** Inclinació cap a un objecte a `distanceM` situat a terra, des de l'alçada d'ulls. */
export function targetPitchDeg(distanceM: number, eyeHeightM: number): number {
  return -toDeg(Math.atan2(eyeHeightM, Math.max(1, distanceM)));
}

/** Pantalla de mode càmera (AR geogràfica sense WebXR). */
export const arScreen: Screen = async (container) => {
  const video = el('video', { className: 'ar__video' });
  const mapEl = el('div', { className: 'map ar__map' });
  const symbolImg = el('img', { src: '/objects/symbol.webp', alt: '' });
  const arrow = el('div', { className: 'ar__symbol-arrow' });
  const symbol = el('div', { className: 'ar__symbol is-hidden' }, symbolImg, arrow);
  const hint = el('div', { className: 'ar__hint', text: t.ar.alignHint });
  const distancePill = el('span', { className: 'pill pill--dark' });
  const hud = el('div', { className: 'hud' }, el('div', { className: 'hud__row' }, distancePill));
  const exitBtn = el('button', { className: 'btn btn--block', text: `🗺️ ${t.ar.exit}`, onClick: () => router.navigate('/ruta') });
  const actions = el('div', { className: 'bottom-actions bottom-actions--transparent' }, exitBtn);
  const root = el('div', { className: 'ar' }, video, mapEl, symbol, hint, hud, actions);
  container.append(el('div', { className: 'screen screen--map' }, root));

  if (!walkSession.isRunning) {
    try {
      const active = await walkSession.resume();
      if (!active) {
        router.navigate('/rutes');
        return;
      }
    } catch {
      router.navigate('/rutes');
      return;
    }
  }
  if (!hasMapboxToken()) {
    root.append(el('div', { className: 'ar__overlay', text: t.app.noMapboxToken }));
    return;
  }

  const feed = new CameraFeed(video);
  const orientation: OrientationSource = simulation.isActive ? simulation.orientation : new RealOrientationSource();
  const machine = new AlignmentStateMachine({
    movingRateDps: config.movingRateDps,
    lockAngleDeg: config.lockAngleDeg,
    unlockAngleDeg: config.unlockAngleDeg,
    lockHoldMs: config.lockHoldMs,
  });

  let map: mapboxgl.Map | null = null;
  let renderer: HtmlObjectRenderer | null = null;
  let lastOrientation: OrientationReading | null = null;
  let lastViews: ObjectView<RouteObjectDto>[] = walkSession.currentViews();
  let calibrationShown = false;
  const unsubscribe: Array<() => void> = [];

  // Els permisos (càmera i sensors) es demanen des d'un gest de l'usuari.
  const enableBtn = el('button', { className: 'btn btn--accent', text: t.ar.enable, onClick: () => void enable() });
  const overlay = el('div', { className: 'ar__overlay' }, el('p', { text: t.ar.enableHint }), enableBtn);
  root.append(overlay);

  async function enable(): Promise<void> {
    enableBtn.disabled = true;
    if (!simulation.isActive) {
      const permission = await orientation.requestPermission();
      if (permission === 'unsupported') {
        overlay.replaceChildren(errorView(t.ar.sensorsUnsupported, () => router.navigate('/ruta')));
        return;
      }
      if (permission === 'denied') {
        overlay.replaceChildren(errorView(t.ar.sensorsDenied, () => router.navigate('/ruta')));
        return;
      }
      if (CameraFeed.supported) {
        try {
          await feed.start();
        } catch {
          toast(t.ar.cameraDenied, 'error', 4000);
        }
      }
    }
    overlay.remove();
    startAr();
  }

  function startAr(): void {
    const start = walkSession.position ?? simulation.currentPosition() ?? { lon: 0, lat: 0 };
    map = createMap({ container: mapEl, center: start, zoom: 18, pitch: MAX_MAP_PITCH, transparent: true, interactive: false });
    map.setMaxPitch(MAX_MAP_PITCH);
    renderer = new HtmlObjectRenderer(map);
    renderer.setObjects(walkSession.pendingObjects);
    map.on('load', () => {
      if (!map) return;
      applyFov(map, config.cameraFovDeg);
      updateCamera();
      renderer?.update(lastViews);
    });

    unsubscribe.push(
      orientation.onReading((reading) => {
        lastOrientation = reading;
        updateCamera();
        updateAlignment();
      }),
      walkSession.positions.on(() => updateCamera()),
      walkSession.views.on((views) => {
        lastViews = views;
        renderer?.update(views);
        updateAlignment();
      }),
      walkSession.objectsChanged.on((objects) => renderer?.setObjects(objects)),
      walkSession.captured.on(async ({ object, response }) => {
        await renderer?.playCapture(object.id);
        toast(t.objects.captured(response.points, t.objects.names[object.type] ?? object.type), 'success');
        await showCard(response.card, { capturedAt: response.capturedAt, collectionCompleted: response.collectionCompleted });
      }),
      walkSession.captureFailed.on(({ code, message }) => toast(t.objects.errors[code] ?? message, 'error')),
      renderer.onTap((object) => {
        const view = lastViews.find((v) => v.object.id === object.id);
        if (!view?.capturable) {
          toast(t.objects.approach, 'info');
          return;
        }
        void walkSession.capture(object);
      }),
    );
    orientation.start();
  }

  /** Sincronitza la càmera lliure del mapa amb la posició GPS i l'orientació del mòbil. */
  function updateCamera(): void {
    const position = walkSession.position;
    if (!map || !position || !lastOrientation) return;
    const camera = map.getFreeCameraOptions();
    camera.position = mapboxgl.MercatorCoordinate.fromLngLat([position.lon, position.lat], config.eyeHeightM);
    // Mapbox: pitch 0 = mirant a terra, 90 = horitzó. El nostre pitch: 0 = horitzó.
    const mapPitch = Math.max(0, Math.min(MAX_MAP_PITCH, 90 + lastOrientation.pitch));
    camera.setPitchBearing(mapPitch, lastOrientation.heading);
    map.setFreeCameraOptions(camera);
  }

  function updateAlignment(): void {
    if (!lastOrientation) return;
    const position = walkSession.position;
    const target = nearestVisible(lastViews);
    const distance = target && position ? haversineM(position, target.object) : null;
    const result: AlignmentResult = machine.update({
      heading: lastOrientation.heading,
      pitch: lastOrientation.pitch,
      targetHeading: target ? target.bearing : null,
      targetPitch: distance !== null ? targetPitchDeg(distance, config.eyeHeightM) : 0,
      rotationRate: lastOrientation.rotationRate,
      timestamp: lastOrientation.timestamp,
    });
    renderSymbol(result, target, distance);
  }

  function renderSymbol(result: AlignmentResult, target: ObjectView<RouteObjectDto> | null, distance: number | null): void {
    if (
      !calibrationShown &&
      lastOrientation?.compassAccuracy !== null &&
      lastOrientation !== null &&
      (lastOrientation.compassAccuracy ?? 0) > config.compassCalibrationDeg
    ) {
      calibrationShown = true;
      toast(t.ar.calibrate, 'accent', 5000);
    }
    distancePill.textContent = distance !== null ? t.ar.targetDistance(t.units.distance(distance)) : t.ar.noTarget;
    if (!result.hasTarget || !target) {
      symbol.classList.add('is-hidden');
      renderer?.setHidden(false);
      hint.textContent = t.ar.noTarget;
      return;
    }
    switch (result.state) {
      case 'MOVING':
        renderer?.setHidden(true);
        symbol.classList.remove('is-hidden', 'is-locked');
        symbol.style.transform = 'translate(0, 0)';
        arrow.style.opacity = '0';
        hint.textContent = t.ar.alignHint;
        break;
      case 'ALIGNING': {
        renderer?.setHidden(true);
        symbol.classList.remove('is-hidden', 'is-locked');
        // El símbol es desplaça cap a on cal girar (proporcional a l'error, limitat a la pantalla).
        const dx = Math.max(-140, Math.min(140, result.headingError * 4));
        const dy = Math.max(-140, Math.min(140, -result.pitchError * 4));
        symbol.style.transform = `translate(${dx}px, ${dy}px)`;
        arrow.style.opacity = '1';
        arrow.style.transform = `rotate(${toDeg(Math.atan2(dx, -dy))}deg)`;
        const horizontal = Math.abs(result.headingError) >= Math.abs(result.pitchError);
        hint.textContent = horizontal
          ? result.headingError > 0
            ? t.ar.turnRight
            : t.ar.turnLeft
          : result.pitchError > 0
            ? t.ar.tiltUp
            : t.ar.tiltDown;
        break;
      }
      case 'LOCKED':
        symbol.classList.remove('is-hidden');
        symbol.classList.add('is-locked');
        symbol.style.transform = 'translate(0, 0)';
        arrow.style.opacity = '0';
        renderer?.setHidden(false);
        hint.textContent = target.capturable ? t.objects.tapToCapture : t.ar.locked;
        // El símbol s'esvaeix en favor de l'objecte.
        window.setTimeout(() => {
          if (machine.current === 'LOCKED') symbol.classList.add('is-hidden');
        }, 600);
        break;
    }
  }

  return () => {
    for (const off of unsubscribe) off();
    orientation.stop();
    feed.stop();
    renderer?.destroy();
    map?.remove();
  };
};
