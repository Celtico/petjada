import type { ObjectCardDto } from '@petjada/shared';
import { t } from '../i18n/ca';

export interface CardViewModel {
  title: string;
  text: string;
  imageUrl: string;
  routeLine: string;
  collectionLine: string | null;
  pointsLine: string;
}

/** Text de la fitxa: pròpia si té contingut; genèrica (ruta + distància) si no. */
export function formatCard(card: ObjectCardDto): CardViewModel {
  const typeName = t.objects.names[card.type] ?? card.type;
  const generic = !card.hasContent || (!card.title && !card.storyText);
  return {
    title: generic ? card.title ?? t.card.genericTitle(card.routeName) : (card.title ?? typeName),
    text: generic ? t.card.genericText(t.units.distance(card.distanceFromStartM)) : (card.storyText ?? ''),
    imageUrl: (!generic && card.storyImageUrl) || card.imageUrl,
    routeLine: t.card.route(card.routeName),
    collectionLine: card.collectionName ? t.card.collection(card.collectionName) : null,
    pointsLine: t.card.points(card.points),
  };
}
