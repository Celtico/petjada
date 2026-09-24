import { Badge, Box, Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import type { RouteSummaryDto } from '@petjada/shared';
import { useCallback, useEffect, useState } from 'react';
import { LuFootprints, LuPlus } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Page } from '../components/AppShell';
import { EmptyState, ErrorView, LoadingView } from '../components/StatusViews';
import { t } from '../i18n/ca';
import { locate } from './location';

export function RouteCard({ route, onOpen }: { route: RouteSummaryDto; onOpen: () => void }) {
  const pending =
    route.pendingObjectCount === 0 && route.objectCount > 0 ? t.routes.allCaptured : t.routes.pendingObjects(route.pendingObjectCount);
  return (
    <Box as="button" textAlign="left" w="100%" bg="bg.panel" rounded="xl" shadow="sm" p="4" onClick={onOpen} _active={{ bg: 'bg.subtle' }}>
      <Heading as="h3" size="md" mb="1">
        {route.name}
      </Heading>
      {route.description && (
        <Text color="fg.muted" fontSize="sm" mb="2" lineClamp={2}>
          {route.description}
        </Text>
      )}
      <HStack gap="2" flexWrap="wrap" mb="2">
        {route.status === 'completed' && <Badge colorPalette="brand" variant="solid">{t.routes.completed}</Badge>}
        {route.status === 'in_progress' && <Badge colorPalette="accent" variant="solid">{t.routes.inProgress}</Badge>}
        {route.isOfficial && <Badge colorPalette="accent">{t.routes.official}</Badge>}
        {route.isMine && <Badge colorPalette="brand" variant="outline">{t.routes.mine}</Badge>}
        <Badge variant="subtle">{route.roundTrip ? t.routes.roundTrip : t.routes.oneWay}</Badge>
        <Badge variant="subtle">{t.units.distance(route.lengthM)}</Badge>
      </HStack>
      <HStack gap="3" color="fg.muted" fontSize="sm" flexWrap="wrap">
        <Text>{pending}</Text>
        {route.distanceToStartM !== null && <Text>{t.routes.distanceToStart(t.units.distance(route.distanceToStartM))}</Text>}
      </HStack>
    </Box>
  );
}

type State = { kind: 'locating' } | { kind: 'loading' } | { kind: 'error'; message: string; locationError?: boolean } | { kind: 'ready'; routes: RouteSummaryDto[] };

export function RoutesListScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'locating' });

  const load = useCallback(async () => {
    setState({ kind: 'locating' });
    let position;
    try {
      position = await locate();
    } catch {
      setState({ kind: 'error', message: t.routes.locationDenied, locationError: true });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const routes = await api.routes.nearby({ lat: position.lat, lon: position.lon });
      setState({ kind: 'ready', routes });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : t.app.genericError });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page title={t.routes.title}>
      {state.kind === 'locating' && <LoadingView label={t.routes.locating} />}
      {state.kind === 'loading' && <LoadingView />}
      {state.kind === 'error' && <ErrorView message={state.message} onRetry={() => void load()} />}
      {state.kind === 'ready' && (
        <VStack align="stretch" gap="3" pb="24">
          <Text color="fg.muted" fontSize="sm">
            {t.routes.nearbyHint}
          </Text>
          {state.routes.length === 0 ? (
            <EmptyState icon={LuFootprints} text={t.routes.empty} />
          ) : (
            state.routes.map((route) => <RouteCard key={route.id} route={route} onOpen={() => navigate(`/rutes/${route.id}`)} />)
          )}
        </VStack>
      )}
      <Button
        position="fixed"
        right="4"
        bottom="calc(var(--chakra-spacing-safe-bottom) + var(--chakra-spacing-20))"
        colorPalette="accent"
        size="lg"
        rounded="full"
        shadow="lg"
        zIndex={6}
        onClick={() => navigate('/crear')}
      >
        <LuPlus /> {t.routes.create}
      </Button>
    </Page>
  );
}
