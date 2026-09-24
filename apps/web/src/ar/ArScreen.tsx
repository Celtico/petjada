import { afterMapReady } from '../map/create-map';
import { Badge, Box, Button, Center, Text, VStack } from '@chakra-ui/react';
import mapboxgl from 'mapbox-gl';
import type { RouteObjectDto } from '@petjada/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuMap } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { ErrorView } from '../components/StatusViews';
import { toast } from '../components/ui/toaster';
import { config } from '../config';
import type { OrientationReading, OrientationSource } from '../gps/types';
import { t } from '../i18n/ca';
import { haversineM, toDeg } from '../map/geo';
import { openCard } from '../objects/card-sheet-store';
import { HtmlObjectRenderer } from '../objects/html-renderer';
import { nearestVisible, type ObjectView } from '../objects/visibility';
import { simulation } from '../sim';
import { walkSession } from '../walk/session';
import { AlignmentStateMachine, type AlignmentResult, type AlignmentState } from './alignment';
import { AlignmentSymbol } from './AlignmentSymbol';
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
 * limita a [0.01, 60] graus. Si no existeix, es deixa el valor per defecte.
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

interface SymbolUi {
  state: AlignmentState;
  visible: boolean;
  dx: number;
  dy: number;
  arrowDeg: number;
  hint: string;
  distance: string;
}

type Phase = { kind: 'checking' } | { kind: 'permission' } | { kind: 'running' } | { kind: 'error'; message: string };

/** Pantalla de mode càmera (AR geogràfica sense WebXR). */
export function ArScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [symbol, setSymbol] = useState<SymbolUi>({ state: 'MOVING', visible: false, dx: 0, dy: 0, arrowDeg: 0, hint: t.ar.noTarget, distance: t.ar.noTarget });
  const [enabling, setEnabling] = useState(false);
  const [start, setStart] = useState<{ lon: number; lat: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const feedRef = useRef<CameraFeed | null>(null);
  const orientationRef = useRef<OrientationSource | null>(null);
  const machineRef = useRef(
    new AlignmentStateMachine({
      movingRateDps: config.movingRateDps,
      lockAngleDeg: config.lockAngleDeg,
      unlockAngleDeg: config.unlockAngleDeg,
      lockHoldMs: config.lockHoldMs,
    }),
  );
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const rendererRef = useRef<HtmlObjectRenderer | null>(null);
  const lastOrientation = useRef<OrientationReading | null>(null);
  const lastViews = useRef<ObjectView<RouteObjectDto>[]>([]);
  const calibrationShown = useRef(false);
  const cleanupRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walkSession.isRunning) {
        try {
          const active = await walkSession.resume();
          if (!active) {
            navigate('/rutes');
            return;
          }
        } catch {
          navigate('/rutes');
          return;
        }
      }
      if (cancelled) return;
      lastViews.current = walkSession.currentViews();
      setPhase({ kind: 'permission' });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    return () => {
      for (const off of cleanupRef.current) off();
      cleanupRef.current = [];
      orientationRef.current?.stop();
      feedRef.current?.stop();
    };
  }, []);

  /** Sincronitza la càmera lliure del mapa amb la posició GPS i l'orientació del mòbil. */
  const updateCamera = useCallback(() => {
    const map = mapRef.current;
    const position = walkSession.position;
    const o = lastOrientation.current;
    if (!map || !position || !o) return;
    const camera = map.getFreeCameraOptions();
    camera.position = mapboxgl.MercatorCoordinate.fromLngLat([position.lon, position.lat], config.eyeHeightM);
    // Mapbox: pitch 0 = mirant a terra, 90 = horitzó. El nostre pitch: 0 = horitzó.
    const mapPitch = Math.max(0, Math.min(MAX_MAP_PITCH, 90 + o.pitch));
    camera.setPitchBearing(mapPitch, o.heading);
    map.setFreeCameraOptions(camera);
  }, []);

  const renderSymbol = useCallback((result: AlignmentResult, target: ObjectView<RouteObjectDto> | null, distance: number | null) => {
    const o = lastOrientation.current;
    if (!calibrationShown.current && o && o.compassAccuracy !== null && o.compassAccuracy > config.compassCalibrationDeg) {
      calibrationShown.current = true;
      toast(t.ar.calibrate, 'warning', 5000);
    }
    const distanceText = distance !== null ? t.ar.targetDistance(t.units.distance(distance)) : t.ar.noTarget;
    const renderer = rendererRef.current;
    if (!result.hasTarget || !target) {
      renderer?.setHidden(false);
      setSymbol((s) => ({ ...s, state: result.state, visible: false, hint: t.ar.noTarget, distance: distanceText }));
      return;
    }
    switch (result.state) {
      case 'MOVING':
        renderer?.setHidden(true);
        setSymbol({ state: 'MOVING', visible: true, dx: 0, dy: 0, arrowDeg: 0, hint: t.ar.alignHint, distance: distanceText });
        break;
      case 'ALIGNING': {
        renderer?.setHidden(true);
        // El símbol es desplaça cap a on cal girar (proporcional a l'error, limitat a la pantalla).
        const dx = Math.max(-140, Math.min(140, result.headingError * 4));
        const dy = Math.max(-140, Math.min(140, -result.pitchError * 4));
        const horizontal = Math.abs(result.headingError) >= Math.abs(result.pitchError);
        const hint = horizontal ? (result.headingError > 0 ? t.ar.turnRight : t.ar.turnLeft) : result.pitchError > 0 ? t.ar.tiltUp : t.ar.tiltDown;
        setSymbol({ state: 'ALIGNING', visible: true, dx, dy, arrowDeg: toDeg(Math.atan2(dx, -dy)), hint, distance: distanceText });
        break;
      }
      case 'LOCKED':
        renderer?.setHidden(false);
        setSymbol({ state: 'LOCKED', visible: true, dx: 0, dy: 0, arrowDeg: 0, hint: target.capturable ? t.objects.tapToCapture : t.ar.locked, distance: distanceText });
        // El símbol s'esvaeix en favor de l'objecte.
        window.setTimeout(() => {
          if (machineRef.current.current === 'LOCKED') setSymbol((s) => (s.state === 'LOCKED' ? { ...s, visible: false } : s));
        }, 600);
        break;
    }
  }, []);

  const updateAlignment = useCallback(() => {
    const o = lastOrientation.current;
    if (!o) return;
    const position = walkSession.position;
    const target = nearestVisible(lastViews.current);
    const distance = target && position ? haversineM(position, target.object) : null;
    const result = machineRef.current.update({
      heading: o.heading,
      pitch: o.pitch,
      targetHeading: target ? target.bearing : null,
      targetPitch: distance !== null ? targetPitchDeg(distance, config.eyeHeightM) : 0,
      rotationRate: o.rotationRate,
      timestamp: o.timestamp,
    });
    renderSymbol(result, target, distance);
  }, [renderSymbol]);

  const enable = async () => {
    setEnabling(true);
    const video = videoRef.current;
    const orientation: OrientationSource = simulation.isActive ? simulation.orientation : new RealOrientationSource();
    orientationRef.current = orientation;
    if (!simulation.isActive) {
      const permission = await orientation.requestPermission();
      if (permission === 'unsupported') {
        setPhase({ kind: 'error', message: t.ar.sensorsUnsupported });
        return;
      }
      if (permission === 'denied') {
        setPhase({ kind: 'error', message: t.ar.sensorsDenied });
        return;
      }
      if (video && CameraFeed.supported) {
        feedRef.current = new CameraFeed(video);
        try {
          await feedRef.current.start();
        } catch {
          toast(t.ar.cameraDenied, 'error', 4000);
        }
      }
    }
    setStart(walkSession.position ?? simulation.currentPosition() ?? { lon: 0, lat: 0 });
    setPhase({ kind: 'running' });
  };

  const onMapReady = useCallback(
    (map: mapboxgl.Map) => {
      mapRef.current = map;
      map.setMaxPitch(MAX_MAP_PITCH);
      const renderer = new HtmlObjectRenderer(map);
      rendererRef.current = renderer;
      renderer.setObjects(walkSession.pendingObjects);
      afterMapReady(map, () => {
        applyFov(map, config.cameraFovDeg);
        updateCamera();
        renderer.update(lastViews.current);
      });
      const orientation = orientationRef.current;
      cleanupRef.current = [
        orientation
          ? orientation.onReading((reading) => {
              lastOrientation.current = reading;
              updateCamera();
              updateAlignment();
            })
          : () => undefined,
        walkSession.positions.on(() => updateCamera()),
        walkSession.views.on((views) => {
          lastViews.current = views;
          renderer.update(views);
          updateAlignment();
        }),
        walkSession.objectsChanged.on((objects) => renderer.setObjects(objects)),
        walkSession.captured.on(async ({ object, response }) => {
          await renderer.playCapture(object.id);
          toast(t.objects.captured(response.points, t.objects.names[object.type] ?? object.type), 'success');
          await openCard(response.card, { capturedAt: response.capturedAt, collectionCompleted: response.collectionCompleted });
        }),
        walkSession.captureFailed.on(({ code, message }) => toast(t.objects.errors[code] ?? message, 'error')),
        renderer.onTap((object) => {
          const view = lastViews.current.find((v) => v.object.id === object.id);
          if (!view?.capturable) {
            toast(t.objects.approach, 'info');
            return;
          }
          void walkSession.capture(object);
        }),
        () => {
          renderer.destroy();
          rendererRef.current = null;
          mapRef.current = null;
        },
      ];
      orientation?.start();
    },
    [updateCamera, updateAlignment],
  );

  const onDispose = useCallback(() => {
    for (const off of cleanupRef.current) off();
    cleanupRef.current = [];
  }, []);

  return (
    <Box position="absolute" inset="0" bg="black" overflow="hidden">
      <video ref={videoRef} className="ar__video" autoPlay muted playsInline />
      {phase.kind === 'running' && start && (
        <MapView center={start} zoom={18} pitch={MAX_MAP_PITCH} transparent interactive={false} onReady={onMapReady} onDispose={onDispose} />
      )}
      {phase.kind === 'running' && <AlignmentSymbol state={symbol.state} dx={symbol.dx} dy={symbol.dy} arrowDeg={symbol.arrowDeg} visible={symbol.visible} />}
      {phase.kind === 'running' && (
        <VStack position="absolute" top="calc(var(--chakra-spacing-safe-top) + var(--chakra-spacing-3))" left="3" right="3" gap="2" zIndex={4} pointerEvents="none">
          <Badge bg="blackAlpha.700" color="white" size="lg">
            {symbol.distance}
          </Badge>
          <Text color="white" textAlign="center" fontWeight="semibold" textShadow="0 1px 4px rgba(0,0,0,0.8)" px="4">
            {symbol.hint}
          </Text>
        </VStack>
      )}
      {(phase.kind === 'permission' || phase.kind === 'checking') && (
        <Center position="absolute" inset="0" bg="blackAlpha.700" zIndex={5} px="6">
          <VStack gap="4" textAlign="center" color="white">
            <Text>{t.ar.enableHint}</Text>
            <Button colorPalette="accent" size="lg" onClick={() => void enable()} loading={enabling} disabled={phase.kind === 'checking'}>
              {t.ar.enable}
            </Button>
          </VStack>
        </Center>
      )}
      {phase.kind === 'error' && (
        <Center position="absolute" inset="0" bg="bg" zIndex={5}>
          <ErrorView message={phase.message} onRetry={() => navigate('/ruta')} retryLabel={t.ar.exit} />
        </Center>
      )}
      <Box position="absolute" left="3" right="3" bottom="calc(var(--chakra-spacing-safe-bottom) + var(--chakra-spacing-4))" zIndex={6}>
        <Button colorPalette="brand" size="lg" w="100%" shadow="md" onClick={() => navigate('/ruta')}>
          <LuMap /> {t.ar.exit}
        </Button>
      </Box>
    </Box>
  );
}
