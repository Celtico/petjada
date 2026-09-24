import type { RouteSummaryDto } from '@petjada/shared';
import { api } from '../api/client';
import { t } from '../i18n/ca';
import { el } from '../ui/dom';
import { errorView, loadingView, page } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { locate } from './location';

export function routeCard(route: RouteSummaryDto): HTMLElement {
  const tags: HTMLElement[] = [];
  if (route.status === 'completed') tags.push(el('span', { className: 'tag tag--done', text: `✓ ${t.routes.completed}` }));
  if (route.status === 'in_progress') tags.push(el('span', { className: 'tag tag--accent', text: t.routes.inProgress }));
  if (route.isOfficial) tags.push(el('span', { className: 'tag tag--official', text: t.routes.official }));
  if (route.isMine) tags.push(el('span', { className: 'tag', text: t.routes.mine }));
  tags.push(el('span', { className: 'tag', text: route.roundTrip ? t.routes.roundTrip : t.routes.oneWay }));
  tags.push(el('span', { className: 'tag', text: t.units.distance(route.lengthM) }));

  const pending =
    route.pendingObjectCount === 0 && route.objectCount > 0 ? t.routes.allCaptured : t.routes.pendingObjects(route.pendingObjectCount);

  return el(
    'button',
    { className: 'card', onClick: () => router.navigate(`/rutes/${route.id}`) },
    el('h3', { text: route.name }),
    route.description ? el('p', { text: route.description }) : null,
    el('div', { className: 'meta' }, ...tags),
    el(
      'div',
      { className: 'meta', style: { marginTop: '8px', color: 'var(--color-muted)' } },
      el('span', { text: pending }),
      route.distanceToStartM !== null ? el('span', { text: `· ${t.routes.distanceToStart(t.units.distance(route.distanceToStartM))}` }) : null,
    ),
  );
}

export const routesListScreen: Screen = async (container) => {
  const content = el('div', { className: 'content' }, loadingView());
  const fab = el('button', {
    className: 'btn btn--accent btn--fab',
    text: `+ ${t.routes.create}`,
    onClick: () => router.navigate('/crear'),
  });
  fab.style.bottom = 'calc(var(--safe-bottom) + 84px)';
  fab.style.width = 'auto';
  fab.style.borderRadius = '999px';
  fab.style.padding = '0 20px';

  const screen = page({ title: t.routes.title, activePath: '/rutes', content });
  screen.append(fab);
  container.append(screen);

  const load = async () => {
    content.replaceChildren(loadingView());
    let position;
    try {
      content.replaceChildren(el('div', { className: 'centered' }, el('p', { text: t.routes.locating })));
      position = await locate();
    } catch {
      content.replaceChildren(errorView(t.routes.locationDenied, () => void load()));
      return;
    }
    try {
      const routes = await api.routes.nearby({ lat: position.lat, lon: position.lon });
      content.replaceChildren(
        el('p', { className: 'hint', text: t.routes.nearbyHint }),
        routes.length === 0 ? el('div', { className: 'empty', text: t.routes.empty }) : el('div', {}, ...routes.map(routeCard)),
      );
    } catch (error) {
      content.replaceChildren(errorView(error instanceof Error ? error.message : t.app.genericError, () => void load()));
    }
  };
  void load();
};
