import { Badge, Box, Heading, HStack, Image, Text, VStack } from '@chakra-ui/react';
import type { ObjectCardDto } from '@petjada/shared';
import { LuTrophy } from 'react-icons/lu';
import { SheetDialog } from '../components/BottomSheet';
import { t } from '../i18n/ca';
import { formatCard } from './card';
import { closeCard, useCurrentCard, type ShowCardOptions } from './card-sheet-store';

/** Contingut d'una fitxa (pròpia o genèrica). */
export function CardContent({ card, options = {} }: { card: ObjectCardDto; options?: ShowCardOptions }) {
  const vm = formatCard(card);
  return (
    <VStack align="stretch" gap="3">
      <Image src={vm.imageUrl} alt={vm.title} maxH="220px" objectFit="contain" mx="auto" rounded="lg" />
      <Heading as="h3" size="md">
        {vm.title}
      </Heading>
      <Text whiteSpace="pre-line">{vm.text}</Text>
      <VStack align="stretch" gap="1" color="fg.muted" fontSize="sm">
        <Text>{vm.routeLine}</Text>
        {vm.collectionLine && <Text>{vm.collectionLine}</Text>}
        {options.capturedAt && <Text>{t.card.capturedAt(t.units.date(options.capturedAt))}</Text>}
      </VStack>
      <Badge colorPalette="accent" size="lg" alignSelf="flex-start">
        {vm.pointsLine}
      </Badge>
      {options.collectionCompleted && (
        <HStack bg="accent.subtle" borderWidth="1px" borderColor="accent.muted" rounded="xl" p="3" gap="3" align="flex-start">
          <Box color="accent.fg" fontSize="3xl" pt="1">
            <LuTrophy />
          </Box>
          <Box>
            <Heading as="h4" size="sm">
              {t.card.collectionCompletedTitle}
            </Heading>
            <Text fontSize="sm">{t.card.collectionCompletedText(options.collectionCompleted.name, options.collectionCompleted.bonusPoints)}</Text>
          </Box>
        </HStack>
      )}
    </VStack>
  );
}

/** Es munta un sol cop a l'arrel: mostra la fitxa demanada amb `openCard()`. */
export function CardSheetHost() {
  const req = useCurrentCard();
  return (
    <SheetDialog open={req !== null} onClose={closeCard} title={t.card.title}>
      {req && <CardContent card={req.card} options={req.options} />}
    </SheetDialog>
  );
}
