import { Badge, Box, Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import type { CollectionSummaryDto, RouteSummaryDto } from '@petjada/shared';
import { useCallback, useEffect, useState } from 'react';
import { LuPlus } from 'react-icons/lu';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useIsEditor, useSession } from '../auth/use-session';
import { Page } from '../components/AppShell';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { t } from '../i18n/ca';
import { locate } from '../routes/location';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; collections: CollectionSummaryDto[]; routes: RouteSummaryDto[] };

export function EditorScreen() {
  const navigate = useNavigate();
  const user = useSession();
  const isEditor = useIsEditor();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const position = await locate();
      const [collections, routes] = await Promise.all([api.collections.nearby(position), api.routes.nearby(position)]);
      setState({ kind: 'ready', collections: collections.filter((c) => c.createdBy === user?.id), routes: routes.filter((r) => r.isMine) });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : t.editor.routesLoadError });
    }
  }, [user?.id]);

  useEffect(() => {
    if (isEditor) void load();
  }, [isEditor, load]);

  if (!isEditor) return <Navigate to="/rutes" replace />;

  return (
    <Page title={t.editor.title}>
      {state.kind === 'loading' && <LoadingView />}
      {state.kind === 'error' && <ErrorView message={state.message} onRetry={() => void load()} />}
      {state.kind === 'ready' && (
        <VStack align="stretch" gap="3">
          <Text fontSize="sm" color="fg.muted">
            {t.editor.intro}
          </Text>
          <Button colorPalette="accent" size="lg" onClick={() => navigate('/editor/colleccions/nova')}>
            <LuPlus /> {t.editor.newCollection}
          </Button>
          <Heading as="h2" size="md" color="fg.muted" pt="2">
            {t.editor.myCollections}
          </Heading>
          {state.collections.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              {t.editor.noCollections}
            </Text>
          ) : (
            state.collections.map((c) => (
              <Box key={c.id} as="button" textAlign="left" w="100%" bg="bg.panel" rounded="xl" shadow="sm" p="4" onClick={() => navigate(`/editor/colleccions/${c.id}`)}>
                <Heading as="h3" size="md">
                  {c.name}
                </Heading>
                {c.description && (
                  <Text fontSize="sm" color="fg.muted" lineClamp={2}>
                    {c.description}
                  </Text>
                )}
                <HStack gap="2" mt="2">
                  <Badge variant="subtle">{t.editor.assigned(c.objectCount)}</Badge>
                  <Badge colorPalette="accent">{t.album.bonus(c.bonusPoints)}</Badge>
                </HStack>
              </Box>
            ))
          )}
          <Heading as="h2" size="md" color="fg.muted" pt="2">
            {t.editor.myRoutes}
          </Heading>
          {state.routes.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              {t.routes.empty}
            </Text>
          ) : (
            state.routes.map((r) => (
              <Box key={r.id} as="button" textAlign="left" w="100%" bg="bg.panel" rounded="xl" shadow="sm" p="4" onClick={() => navigate(`/editor/rutes/${r.id}/fitxes`)}>
                <Heading as="h3" size="md">
                  {r.name}
                </Heading>
                <HStack gap="2" mt="2">
                  <Badge variant="subtle">{t.routes.objects(r.objectCount)}</Badge>
                  <Badge colorPalette="accent">{t.editor.editCards}</Badge>
                </HStack>
              </Box>
            ))
          )}
        </VStack>
      )}
    </Page>
  );
}
