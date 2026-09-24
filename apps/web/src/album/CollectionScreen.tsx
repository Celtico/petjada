import { AspectRatio, Badge, Box, Center, HStack, Image, Progress, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import type { CollectionDetailDto, CollectionItemDto } from '@petjada/shared';
import { useEffect, useState } from 'react';
import { LuImage } from 'react-icons/lu';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Page } from '../components/AppShell';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { t } from '../i18n/ca';
import { formatCard } from '../objects/card';
import { openCard } from '../objects/card-sheet-store';

/**
 * Silueta genèrica per a una peça no trobada. No revela res de la peça:
 * sempre és la mateixa forma en to apagat.
 */
function Silhouette() {
  return (
    <Center bg="bg.muted" rounded="xl" color="fg.muted" fontSize="4xl" h="100%" title={t.album.missing} aria-label={t.album.missing}>
      <LuImage />
    </Center>
  );
}

function PieceTile({ item }: { item: CollectionItemDto }) {
  if (!item.captured || !item.card) {
    return (
      <VStack gap="1">
        <AspectRatio ratio={1} w="100%">
          <Silhouette />
        </AspectRatio>
        <Text fontSize="xs" color="fg.muted">
          {t.album.missing}
        </Text>
      </VStack>
    );
  }
  const card = item.card;
  const vm = formatCard(card);
  return (
    <VStack as="button" gap="1" onClick={() => void openCard(card)}>
      <AspectRatio ratio={1} w="100%">
        <Image src={item.imageUrl ?? vm.imageUrl} alt={vm.title} objectFit="contain" bg="bg.panel" rounded="xl" shadow="sm" p="2" />
      </AspectRatio>
      <Text fontSize="xs" truncate maxW="100%">
        {vm.title}
      </Text>
    </VStack>
  );
}

export function CollectionScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CollectionDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.collections
      .get(id)
      .then(setCollection)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t.app.genericError));
  }, [id]);

  const pct = collection && collection.objectCount > 0 ? Math.round((collection.capturedCount / collection.objectCount) * 100) : 0;

  return (
    <Page title={collection?.name ?? t.album.detailTitle} onBack={() => navigate('/album')}>
      {error && <ErrorView message={error} onRetry={() => navigate('/album')} retryLabel={t.app.back} />}
      {!error && !collection && <LoadingView />}
      {collection && (
        <VStack align="stretch" gap="3">
          {collection.coverImageUrl && <Image src={collection.coverImageUrl} alt={collection.name} rounded="xl" maxH="180px" objectFit="cover" />}
          {collection.description && <Text>{collection.description}</Text>}
          <Progress.Root value={pct} colorPalette="brand" size="sm">
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <HStack gap="2" flexWrap="wrap">
            <Badge variant="subtle">{t.album.piecesFound(collection.capturedCount, collection.objectCount)}</Badge>
            {collection.completed && <Badge colorPalette="brand" variant="solid">{t.album.completed}</Badge>}
            <Badge colorPalette="accent">{t.album.bonus(collection.bonusPoints)}</Badge>
          </HStack>
          <SimpleGrid columns={{ base: 3, md: 5 }} gap="3">
            {collection.items.map((item) => (
              <Box key={item.objectId}>
                <PieceTile item={item} />
              </Box>
            ))}
          </SimpleGrid>
        </VStack>
      )}
    </Page>
  );
}
