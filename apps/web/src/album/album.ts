import type { AlbumEntryDto, CollectionSummaryDto } from '@petjada/shared';
import { api } from '../api/client';
import { t } from '../i18n/ca';
import { formatCard, showCard } from '../objects/card';
import { el } from '../ui/dom';
import { errorView, loadingView, page } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';

function entryCard(entry: AlbumEntryDto): HTMLElement {
  const vm = formatCard(entry.card);
  return el(
    'button',
    { className: 'card card--row', onClick: () => void showCard(entry.card, { capturedAt: entry.capturedAt }) },
    el('img', { className: 'card__thumb', src: vm.imageUrl, alt: vm.title }),
    el(
      'div',
      { className: 'card__body' },
      el('h3', { text: vm.title }),
      el('p', { text: entry.card.routeName }),
      el('div', { className: 'meta' }, el('span', { className: 'tag tag--accent', text: vm.pointsLine }), el('span', { text: t.units.date(entry.capturedAt) })),
    ),
  );
}

export function collectionCard(collection: CollectionSummaryDto): HTMLElement {
  const pct = collection.objectCount > 0 ? Math.round((collection.capturedCount / collection.objectCount) * 100) : 0;
  return el(
    'button',
    { className: 'card', onClick: () => router.navigate(`/album/colleccions/${collection.id}`) },
    el(
      'div',
      { className: 'card__head' },
      el('h3', { text: collection.name }),
      collection.completed ? el('span', { className: 'badge badge--small', title: t.album.completedBadge }, '★') : null,
    ),
    collection.description ? el('p', { text: collection.description }) : null,
    el('div', { className: 'progress' }, el('div', { className: 'progress__bar', style: { width: `${pct}%` } })),
    el(
      'div',
      { className: 'meta' },
      el('span', { className: 'tag', text: t.album.progress(collection.capturedCount, collection.objectCount) }),
      collection.completed ? el('span', { className: 'tag tag--done', text: t.album.completed }) : null,
      el('span', { className: 'tag tag--accent', text: t.album.bonus(collection.bonusPoints) }),
    ),
  );
}

export const albumScreen: Screen = async (container) => {
  const content = el('div', { className: 'content' }, loadingView());
  container.append(page({ title: t.album.title, activePath: '/album', content }));

  const load = async () => {
    try {
      const album = await api.album.get();
      content.replaceChildren(
        el('h2', { className: 'section-title', text: t.album.collections }),
        album.collections.length === 0
          ? el('p', { className: 'hint', text: t.album.noCollections })
          : el('div', {}, ...album.collections.map(collectionCard)),
        el('h2', { className: 'section-title', text: t.album.findings }),
        album.entries.length === 0 ? el('div', { className: 'empty', text: t.album.empty }) : el('div', {}, ...album.entries.map(entryCard)),
      );
    } catch (error) {
      content.replaceChildren(errorView(error instanceof Error ? error.message : t.app.genericError, () => void load()));
    }
  };
  void load();
};
