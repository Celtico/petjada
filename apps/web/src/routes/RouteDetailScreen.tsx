import { afterMapReady } from '../map/create-map';
import { Badge, Box, Button, Heading, HStack, Text } from '@chakra-ui/react';
import type mapboxgl from 'mapbox-gl';
import type { RouteDetailDto } from '@petjada/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { OverlayTopBar } from '../components/AppShell';
import { BottomPanel } from '../components/BottomSheet';
import { MapView } from '../components/MapView';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { toast } from '../components/ui/toaster';
import { t } from '../i18n/ca';
import { toLngLat } from '../map/geo';
import { drawRoute, fitRoute } from '../map/route-layer';
import { createObjectMarker } from './markers';

export function RouteDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState<RouteDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.routes
      .get(id)
      .then((r) => !cancelled && setRoute(r))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : t.app.genericError));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onMapReady = useCallback(
    (map: mapboxgl.Map) => {
      if (!route) return;
      afterMapReady(map, () => {
        void drawRoute(map, route.geometry);
        markersRef.current = route.objects.map((o) => {
          const { marker } = createObjectMarker({ imageUrl: o.imageUrl, alt: o.type, lon: o.lon, lat: o.lat, dimmed: o.captured });
          return marker.addTo(map);
        });
        fitRoute(map, route.geometry, 80);
      });
    },
    [route],
  );

  const onDispose = useCallback(() => {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
  }, []);

  const start = async () => {
    if (!route) return;
    if (route.status === 'in_progress') {
      navigate('/ruta');
      return;
    }
    setStarting(true);
    try {
      await api.routes.start(route.id);
      navigate('/ruta');
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'CONFLICT' ? t.routes.activeElsewhere : t.routes.startError, 'error');
      setStarting(false);
    }
  };

  return (
    <Box position="relative" h="100%" overflow="hidden">
      {route && <MapView center={toLngLat(route.geometry.coordinates[0])} pitch={45} onReady={onMapReady} onDispose={onDispose} />}
      <OverlayTopBar title={t.routes.detailTitle} onBack={() => navigate('/rutes')} />
      <BottomPanel>
        {error && <ErrorView message={error} onRetry={() => navigate('/rutes')} retryLabel={t.app.back} />}
        {!error && !route && <LoadingView />}
        {route && (
          <>
            <Heading as="h2" size="lg" mb="1">
              {route.name}
            </Heading>
            {route.description && (
              <Text color="fg.muted" fontSize="sm" mb="2">
                {route.description}
              </Text>
            )}
            <HStack gap="2" flexWrap="wrap" mb="2">
              {route.status === 'completed' && <Badge colorPalette="brand" variant="solid">{t.routes.completed}</Badge>}
              {route.isOfficial && <Badge colorPalette="accent">{t.routes.official}</Badge>}
              <Badge variant="subtle">{route.roundTrip ? t.routes.roundTrip : t.routes.oneWay}</Badge>
              <Badge variant="subtle">{t.units.distance(route.lengthM)}</Badge>
              <Badge variant="subtle">{t.routes.objects(route.objectCount)}</Badge>
              <Badge variant="subtle">{route.isPublic ? t.routes.public : t.routes.private}</Badge>
            </HStack>
            <Text color="fg.muted" fontSize="sm" mb="3">
              {route.pendingObjectCount === 0 && route.objectCount > 0 ? t.routes.allCaptured : t.routes.pendingObjects(route.pendingObjectCount)}
            </Text>
            <Button colorPalette="brand" size="lg" w="100%" onClick={() => void start()} loading={starting}>
              {route.status === 'in_progress' ? t.routes.resume : t.routes.start}
            </Button>
          </>
        )}
      </BottomPanel>
    </Box>
  );
}
