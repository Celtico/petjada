import type { CollectionItemDto } from '@petjada/shared';
import { api } from '../api/client';
import { t } from '../i18n/ca';
import { formatCard, showCard } from '../objects/card';
import { el, setChildren } from '../ui/dom';
import { errorView, loadingView, page } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';

/**
 * Silueta genèrica per a una peça no trobada. No revela res de la peça:
 * sempre és la mateixa forma en to apagat.
 */
export function silhouette(): HTMLElement {
  return el('div', {
    className: 'silhouette',
    html: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6c-9 0-14 7-14 15 0 6 3 9 3 14 0 4-4 6-4 11 0 7 7 12 15 12s15-5 15-12c0-5-4-7-4-11 0-5 3-8 3-14 0-8-5-15-14-15z"/><text x="32" y="40" text-anchor="middle" font-size="22" fill="#fff" font-weight="700">?</text></svg>',
    title: t.album.missing,
  });
}

function pieceTile(item: CollectionItemDto): HTMLElement {
  if (!item.captured || !item.card) {
    return el('div', { className: 'piece piece--missing' }, silhouette(), el('span', { className: 'piece__label', text: t.album.missing }));
  }
  const card = item.card;
  const vm = formatCard(card);
  return el(
    'button',
    { className: 'piece', onClick: () => void showCard(card) },
    el('img', { src: item.imageUrl ?? vm.imageUrl, alt: vm.title }),
    el('span', { className: 'piece__label', text: vm.title }),
  );
}

export const collectionDetailScreen: Screen = async (container, params) => {
  const content = el('div', { className: 'content' }, loadingView());
  const screen = page({ title: t.album.detailTitle, activePath: '/album', content, back: () => router.navigate('/album') });
  container.append(screen);

  try {
    const collection = await api.collections.get(params.id);
    const title = screen.querySelector('h1');
    if (title) title.textContent = collection.name;
    const pct = collection.objectCount > 0 ? Math.round((collection.capturedCount / collection.objectCount) * 100) : 0;
    setChildren(
      content,
      collection.coverImageUrl ? el('img', { className: 'cover', src: collection.coverImageUrl, alt: collection.name }) : null,
      collection.description ? el('p', { text: collection.description }) : null,
      el('div', { className: 'progress' }, el('div', { className: 'progress__bar', style: { width: `${pct}%` } })),
      el(
        'div',
        { className: 'meta', style: { margin: '8px 0 16px' } },
        el('span', { className: 'tag', text: t.album.piecesFound(collection.capturedCount, collection.objectCount) }),
        collection.completed ? el('span', { className: 'tag tag--done', text: `★ ${t.album.completed}` }) : null,
        el('span', { className: 'tag tag--accent', text: t.album.bonus(collection.bonusPoints) }),
      ),
      el('div', { className: 'pieces' }, ...collection.items.map(pieceTile)),
    );
  } catch (error) {
    content.replaceChildren(errorView(error instanceof Error ? error.message : t.app.genericError, () => router.navigate('/album')));
  }
};
