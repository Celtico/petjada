/**
 * Router de pantalles basat en el hash de la URL (`#/rutes`, `#/rutes/:id`…).
 * Cada pantalla és una funció que rep el contenidor i els paràmetres i retorna
 * opcionalment una funció de neteja.
 */

export type RouteParams = Record<string, string>;

export type Screen = (container: HTMLElement, params: RouteParams) => void | Cleanup | Promise<void | Cleanup>;

export type Cleanup = () => void;

interface Registered {
  pattern: string;
  regex: RegExp;
  keys: string[];
  screen: Screen;
}

const registered: Registered[] = [];
let current: Cleanup | null = null;
let container: HTMLElement | null = null;
let notFound: Screen | null = null;
let guard: ((path: string) => string | null) | null = null;

function compile(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}/?$`), keys };
}

export const router = {
  register(pattern: string, screen: Screen): void {
    const { regex, keys } = compile(pattern);
    registered.push({ pattern, regex, keys, screen });
  },

  setNotFound(screen: Screen): void {
    notFound = screen;
  },

  /** Retorna un camí alternatiu (redirecció) o `null` per deixar passar. */
  setGuard(fn: (path: string) => string | null): void {
    guard = fn;
  },

  currentPath(): string {
    const hash = window.location.hash.replace(/^#/, '');
    return hash === '' ? '/' : hash;
  },

  navigate(path: string, replace = false): void {
    const target = `#${path}`;
    if (replace) window.location.replace(target);
    else window.location.hash = path;
    if (window.location.hash === target) void this.render();
  },

  start(root: HTMLElement): void {
    container = root;
    window.addEventListener('hashchange', () => void this.render());
    void this.render();
  },

  async render(): Promise<void> {
    if (!container) return;
    let path = this.currentPath();
    const redirect = guard?.(path);
    if (redirect && redirect !== path) {
      window.location.replace(`#${redirect}`);
      path = redirect;
    }

    if (current) {
      try {
        current();
      } catch (error) {
        console.error(error);
      }
      current = null;
    }
    container.replaceChildren();

    for (const route of registered) {
      const match = route.regex.exec(path);
      if (!match) continue;
      const params: RouteParams = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1] ?? '')));
      const cleanup = await route.screen(container, params);
      if (typeof cleanup === 'function') current = cleanup;
      return;
    }
    if (notFound) {
      const cleanup = await notFound(container, {});
      if (typeof cleanup === 'function') current = cleanup;
    }
  },
};
