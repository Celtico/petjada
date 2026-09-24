import type { ObjectCardDto } from '@petjada/shared';
import { t } from '../i18n/ca';
import { el } from '../ui/dom';
import { openSheet } from '../ui/sheet';

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

export interface ShowCardOptions {
  capturedAt?: string;
  collectionCompleted?: { name: string; bonusPoints: number } | null;
}

/** Obre la fitxa en un sheet inferior. */
export function showCard(card: ObjectCardDto, options: ShowCardOptions = {}): Promise<void> {
  const vm = formatCard(card);
  const body = el(
    'div',
    { className: 'card-view' },
    el('img', { className: 'card-view__img', src: vm.imageUrl, alt: vm.title }),
    el('h2', { text: vm.title }),
    el('p', { className: 'card-view__text', text: vm.text }),
    el('p', { className: 'card-view__meta', text: vm.routeLine }),
    vm.collectionLine ? el('p', { className: 'card-view__meta', text: vm.collectionLine }) : null,
    options.capturedAt ? el('p', { className: 'card-view__meta', text: t.card.capturedAt(t.units.date(options.capturedAt)) }) : null,
    el('p', { className: 'card-view__points', text: vm.pointsLine }),
    options.collectionCompleted
      ? el(
          'div',
          { className: 'card-view__badge' },
          el('div', { className: 'badge' }, '★'),
          el('h3', { text: t.card.collectionCompletedTitle }),
          el('p', {
            text: t.card.collectionCompletedText(options.collectionCompleted.name, options.collectionCompleted.bonusPoints),
          }),
        )
      : null,
  );
  return openSheet({ title: t.card.title, body, closeLabel: t.app.close });
}
