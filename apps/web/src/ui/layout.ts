import { session } from '../auth/session';
import { t } from '../i18n/ca';
import { el } from './dom';
import { router } from './router';

const BANNER_DISMISSED_KEY = 'petjada.guestBannerDismissed';

interface Tab {
  path: string;
  label: string;
  icon: string;
  visible: () => boolean;
}

const TABS: Tab[] = [
  { path: '/rutes', label: t.nav.routes, icon: '🥾', visible: () => true },
  { path: '/album', label: t.nav.album, icon: '📒', visible: () => true },
  { path: '/editor', label: t.nav.editor, icon: '🏛️', visible: () => session.isEditor() },
  { path: '/compte', label: t.nav.account, icon: '👤', visible: () => true },
];

function bannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissBanner(): void {
  try {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
  } catch {
    /* ignora */
  }
}

/** Banner discret (tancable) que proposa crear compte als convidats. */
export function guestBanner(): HTMLElement | null {
  const user = session.user;
  if (!user?.isGuest || bannerDismissed()) return null;
  const banner = el(
    'div',
    { className: 'guest-banner' },
    el('span', { text: t.auth.guestBanner }),
    el('button', { className: 'guest-banner__action', text: t.auth.guestBannerAction, onClick: () => router.navigate('/compte') }),
    el('button', {
      className: 'guest-banner__close',
      text: '×',
      title: t.app.close,
      onClick: () => {
        dismissBanner();
        banner.remove();
      },
    }),
  );
  return banner;
}

/** Barra de navegació inferior amb pestanyes grans. */
export function bottomNav(activePath: string): HTMLElement {
  return el(
    'nav',
    { className: 'bottom-nav' },
    ...TABS.filter((tab) => tab.visible()).map((tab) =>
      el(
        'button',
        {
          className: `bottom-nav__tab ${activePath.startsWith(tab.path) ? 'is-active' : ''}`,
          onClick: () => router.navigate(tab.path),
        },
        el('span', { className: 'bottom-nav__icon', text: tab.icon }),
        el('span', { text: tab.label }),
      ),
    ),
  );
}

export interface PageOptions {
  title: string;
  activePath: string;
  content: HTMLElement;
  /** Botó "enrere" en lloc del logo. */
  back?: () => void;
  /** Sense barra de navegació inferior. */
  noNav?: boolean;
  actions?: HTMLElement[];
}

/** Pàgina estàndard: barra superior, contingut desplaçable i navegació inferior. */
export function page(options: PageOptions): HTMLElement {
  const banner = guestBanner();
  return el(
    'div',
    { className: 'screen' },
    el(
      'header',
      { className: 'topbar' },
      options.back
        ? el('button', { className: 'btn btn--icon', text: '‹', title: t.app.back, onClick: options.back })
        : el('img', { className: 'topbar__logo', src: '/logo.svg', alt: t.app.name }),
      el('h1', { text: options.title }),
      ...(options.actions ?? []),
    ),
    banner,
    options.content,
    options.noNav ? null : bottomNav(options.activePath),
  );
}

export function loadingView(): HTMLElement {
  return el('div', { className: 'centered' }, el('div', { className: 'spinner' }), el('p', { text: t.app.loading }));
}

export function errorView(message: string, retry?: () => void): HTMLElement {
  return el(
    'div',
    { className: 'centered' },
    el('p', { className: 'error', text: message }),
    retry ? el('button', { className: 'btn btn--secondary', text: t.app.retry, onClick: retry }) : null,
  );
}
