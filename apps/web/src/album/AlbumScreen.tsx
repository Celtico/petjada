import { Badge, Box, Heading, HStack, Image, Progress, Text, VStack } from '@chakra-ui/react';
import type { AlbumEntryDto, AlbumResponse, CollectionSummaryDto } from '@petjada/shared';
import { useCallback, useEffect, useState } from 'react';
import { LuBookImage, LuTrophy } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Page } from '../components/AppShell';
import { EmptyState, ErrorView, LoadingView } from '../components/StatusViews';
import { t } from '../i18n/ca';
import { formatCard } from '../objects/card';
import { openCard } from '../objects/card-sheet-store';

function EntryCard({ entry }: { entry: AlbumEntryDto }) {
  const vm = formatCard(entry.card);
  return (
    <HStack as="button" textAlign="left" w="100%" bg="bg.panel" rounded="xl" shadow="sm" p="3" gap="3" align="flex-start" onClick={() => void openCard(entry.card, { capturedAt: entry.capturedAt })}>
      <Image src={vm.imageUrl} alt={vm.title} boxSize="16" objectFit="contain" rounded="md" flexShrink={0} />
      <Box flex="1" minW="0">
        <Heading as="h3" size="sm" truncate>
          {vm.title}
        </Heading>
        <Text fontSize="sm" color="fg.muted" truncate>
          {entry.card.routeName}
        </Text>
        <HStack gap="2" mt="1" fontSize="xs" color="fg.muted">
          <Badge colorPalette="accent">{vm.pointsLine}</Badge>
          <Text>{t.units.date(entry.capturedAt)}</Text>
        </HStack>
      </Box>
    </HStack>
  );
}

export function CollectionCard({ collection, onOpen }: { collection: CollectionSummaryDto; onOpen: () => void }) {
  const pct = collection.objectCount > 0 ? Math.round((collection.capturedCount / collection.objectCount) * 100) : 0;
  return (
    <Box as="button" textAlign="left" w="100%" bg="bg.panel" rounded="xl" shadow="sm" p="4" onClick={onOpen}>
      <HStack justify="space-between" mb="1">
        <Heading as="h3" size="md">
          {collection.name}
        </Heading>
        {collection.completed && (
          <Box color="accent.fg" fontSize="xl" title={t.album.completedBadge}>
            <LuTrophy />
          </Box>
        )}
      </HStack>
      {collection.description && (
        <Text fontSize="sm" color="fg.muted" mb="2" lineClamp={2}>
          {collection.description}
        </Text>
      )}
      <Progress.Root value={pct} colorPalette="brand" size="sm" mb="2">
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <HStack gap="2" flexWrap="wrap">
        <Badge variant="subtle">{t.album.progress(collection.capturedCount, collection.objectCount)}</Badge>
        {collection.completed && <Badge colorPalette="brand" variant="solid">{t.album.completed}</Badge>}
        <Badge colorPalette="accent">{t.album.bonus(collection.bonusPoints)}</Badge>
      </HStack>
    </Box>
  );
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; album: AlbumResponse };

export function AlbumScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', album: await api.album.get() });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : t.app.genericError });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page title={t.album.title}>
      {state.kind === 'loading' && <LoadingView />}
      {state.kind === 'error' && <ErrorView message={state.message} onRetry={() => void load()} />}
      {state.kind === 'ready' && (
        <VStack align="stretch" gap="3">
          <Heading as="h2" size="md" color="fg.muted">
            {t.album.collections}
          </Heading>
          {state.album.collections.length === 0 ? (
            <Text color="fg.muted" fontSize="sm">
              {t.album.noCollections}
            </Text>
          ) : (
            state.album.collections.map((c) => <CollectionCard key={c.id} collection={c} onOpen={() => navigate(`/album/colleccions/${c.id}`)} />)
          )}
          <Heading as="h2" size="md" color="fg.muted" pt="2">
            {t.album.findings}
          </Heading>
          {state.album.entries.length === 0 ? (
            <EmptyState icon={LuBookImage} text={t.album.empty} />
          ) : (
            state.album.entries.map((entry) => <EntryCard key={entry.captureId} entry={entry} />)
          )}
        </VStack>
      )}
    </Page>
  );
}
