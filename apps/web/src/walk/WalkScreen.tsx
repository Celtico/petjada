import { Badge, Box, Button, HStack, IconButton, VStack } from '@chakra-ui/react';
import type mapboxgl from 'mapbox-gl';
import type { RouteObjectDto } from '@petjada/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuCamera, LuLocate, LuStar } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/use-session';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MapView } from '../components/MapView';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { toast } from '../components/ui/toaster';
import { t } from '../i18n/ca';
import { WALK_PITCH, WALK_ZOOM, afterMapReady } from '../map/create-map';
import { FootprintLayer } from '../map/footprint-layer';
import { drawRoute } from '../map/route-layer';
import { UserMarker } from '../map/user-marker';
import { openCard } from '../objects/card-sheet-store';
import { HtmlObjectRenderer } from '../objects/html-renderer';
import { nearestPending } from '../objects/visibility';
import { simulation } from '../sim';
import { walkSession } from './session';
import { useWalkSession } from './use-walk-session';

type Load = { kind: 'loading' } | { kind: 'none' } | { kind: 'error'; message: string } | { kind: 'ready' };

/** HUD: punts, pendents, senyal i proper objecte. */
function Hud() {
  const session = useWalkSession();
  const user = useSession();
  const state = session.trackerState;
  const signal =
    !state || state.improvingSignal || !state.position ? t.walk.improvingSignal : state.position.accuracy > 15 ? t.walk.accuracy(state.position.accuracy) : null;
  const nearest = nearestPending(session.currentViews(), session.hasReachedTurnaround);
  const next = nearest && Number.isFinite(nearest.distanceM) ? t.walk.nextObject(t.units.distance(nearest.distanceM)) : t.walk.noNextObject;
  return (
    <VStack position="absolute" top="calc(var(--chakra-spacing-safe-top) + var(--chakra-spacing-3))" left="3" right="3" align="flex-start" gap="2" zIndex={4} pointerEvents="none">
      <HStack gap="2" flexWrap="wrap">
        <Badge colorPalette="accent" variant="solid" size="lg" shadow="sm">
          <LuStar /> {user?.totalPoints ?? 0} {t.app.pointsShort}
        </Badge>
        <Badge bg="bg.panel" color="fg" size="lg" shadow="sm">
          {t.walk.pending(session.pendingObjects.length)}
        </Badge>
        {signal && (
          <Badge colorPalette="orange" variant="solid" size="lg" shadow="sm">
            {signal}
          </Badge>
        )}
      </HStack>
      <Badge bg="blackAlpha.700" color="white" size="lg" shadow="sm">
        {next}
      </Badge>
    </VStack>
  );
}

/** Pantalla de ruta activa: mapa 3D, HUD, petjades, objectes i captura. */
export function WalkScreen() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<{ title: string; lines: string[] } | null>(null);
  const followRef = useRef(true);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const cleanupRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    let cancelled = false;
    walkSession
      .resume()
      .then((active) => !cancelled && setLoad(active ? { kind: 'ready' } : { kind: 'none' }))
      .catch((e: unknown) => !cancelled && setLoad({ kind: 'error', message: e instanceof Error ? e.message : t.app.genericError }));
    return () => {
      cancelled = true;
    };
  }, []);

  const recenter = useCallback(() => {
    followRef.current = true;
    const map = mapRef.current;
    const p = walkSession.position;
    if (!map || !p) return;
    map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), WALK_ZOOM - 1), pitch: WALK_PITCH, duration: 600 });
  }, []);

  const onMapReady = useCallback((map: mapboxgl.Map) => {
    const route = walkSession.route;
    if (!route) return;
    mapRef.current = map;
    const renderer = new HtmlObjectRenderer(map);
    const userMarker = new UserMarker(map);
    const footprintLayer = new FootprintLayer(map);
    simulation.attachMap(map);
    map.on('dragstart', () => (followRef.current = false));
    afterMapReady(map, () => {
      void drawRoute(map, route.geometry);
      void footprintLayer.update(walkSession.allFootprints);
      renderer.setObjects(walkSession.pendingObjects);
      renderer.update(walkSession.currentViews());
    });
    cleanupRef.current = [
      walkSession.positions.on((p) => {
        userMarker.update(p, p.accuracy);
        if (followRef.current) map.easeTo({ center: [p.lon, p.lat], duration: 800, easing: (x) => x });
      }),
      walkSession.footprints.on((fps) => void footprintLayer.update(fps)),
      walkSession.objectsChanged.on((objects) => renderer.setObjects(objects)),
      walkSession.views.on((views) => renderer.update(views)),
      walkSession.turnaround.on((reached) => {
        if (reached) toast(t.walk.turnaroundReached, 'success', 4000);
      }),
      walkSession.captured.on(async ({ object, response }) => {
        await renderer.playCapture(object.id);
        toast(t.objects.captured(response.points, t.objects.names[object.type] ?? object.type), 'success');
        await openCard(response.card, { capturedAt: response.capturedAt, collectionCompleted: response.collectionCompleted });
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
      () => {
        simulation.attachMap(null);
        renderer.destroy();
        userMarker.remove();
        mapRef.current = null;
      },
    ];
  }, []);

  const onDispose = useCallback(() => {
    for (const off of cleanupRef.current) off();
    cleanupRef.current = [];
  }, []);

  const finish = async () => {
    setConfirmFinish(false);
    setFinishing(true);
    try {
      const res = await walkSession.finish();
      setResult({
        title: res.completed ? t.walk.resultCompleted : t.walk.resultNotCompleted,
        lines: [t.walk.coverage(Math.round(res.coverage * 100)), t.walk.bonus(res.bonusPoints), t.walk.totalPoints(res.totalPoints)],
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : t.app.genericError, 'error');
    } finally {
      setFinishing(false);
    }
  };

  if (load.kind === 'loading') return <LoadingView />;
  if (load.kind === 'none') return <ErrorView message={t.walk.noActive} onRetry={() => navigate('/rutes')} retryLabel={t.walk.backToRoutes} />;
  if (load.kind === 'error') return <ErrorView message={load.message} onRetry={() => navigate('/rutes')} retryLabel={t.walk.backToRoutes} />;

  const route = walkSession.route!;
  const start = walkSession.position ?? simulation.currentPosition() ?? { lon: route.geometry.coordinates[0][0], lat: route.geometry.coordinates[0][1] };

  return (
    <Box position="relative" h="100%" overflow="hidden">
      <MapView center={start} zoom={WALK_ZOOM} pitch={WALK_PITCH} onReady={onMapReady} onDispose={onDispose} />
      <Hud />
      <HStack position="absolute" left="3" right="3" bottom="calc(var(--chakra-spacing-safe-bottom) + var(--chakra-spacing-4))" gap="2" zIndex={4}>
        <IconButton aria-label={t.walk.center} size="lg" rounded="full" bg="bg.panel" color="fg" shadow="md" onClick={recenter}>
          <LuLocate />
        </IconButton>
        <Button colorPalette="brand" size="lg" flex="1" shadow="md" onClick={() => navigate('/ruta/camera')}>
          <LuCamera /> {t.walk.camera}
        </Button>
        <Button variant="solid" bg="bg.panel" color="fg" size="lg" shadow="md" onClick={() => setConfirmFinish(true)} loading={finishing}>
          {t.walk.finish}
        </Button>
      </HStack>
      <ConfirmDialog
        open={confirmFinish}
        title={t.walk.finishConfirm}
        confirmLabel={t.walk.finishConfirmYes}
        onConfirm={() => void finish()}
        onCancel={() => setConfirmFinish(false)}
      />
      <ConfirmDialog
        open={result !== null}
        infoOnly
        title={result?.title ?? ''}
        lines={result?.lines}
        confirmLabel={t.walk.backToRoutes}
        onConfirm={() => navigate('/rutes')}
        onCancel={() => navigate('/rutes')}
      />
    </Box>
  );
}
