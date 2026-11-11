import type { LocalBackend } from './backend';
import { LocalApiError } from './errors';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type Handler = (backend: LocalBackend, ctx: { params: string[]; query: URLSearchParams; body: never }) => unknown;

interface RouteDef {
  method: Method;
  pattern: RegExp;
  handler: Handler;
}

const ID = '([^/]+)';

function route(method: Method, path: string, handler: Handler): RouteDef {
  return { method, pattern: new RegExp(`^${path.replace(/:id/g, ID)}$`), handler };
}

const num = (query: URLSearchParams, name: string): number => Number(query.get(name) ?? Number.NaN);

/** En local no hi ha comptes: l'usuari és el del dispositiu i no s'envien correus. */
function noAccounts(): never {
  throw new LocalApiError(400, 'VALIDATION', 'Aquesta versió desa les dades només en aquest dispositiu i no té comptes per correu.');
}

/**
 * Les mateixes rutes HTTP que l'API (vegeu el contracte a `@petjada/shared`),
 * servides pel backend local. `null` equival a una resposta 204.
 */
const ROUTES: RouteDef[] = [
  route('POST', '/auth/guest', (b) => b.guest()),
  route('POST', '/auth/refresh', (b) => b.refresh()),
  route('POST', '/auth/logout', () => null),
  route('POST', '/auth/magic-link', noAccounts),
  route('POST', '/auth/verify-code', noAccounts),

  route('GET', '/users/me', (b) => b.me()),
  route('PATCH', '/users/me', (b, { body }) => b.updateProfile(body)),
  route('DELETE', '/users/me', (b) => (b.deleteAccount(), null)),

  route('GET', '/routes', (b, { query }) => b.nearbyRoutes(num(query, 'lat'), num(query, 'lon'))),
  route('POST', '/routes/preview', (b, { body }) => b.preview(body)),
  route('POST', '/routes', (b, { body }) => b.createRoute(body)),
  route('GET', '/routes/:id', (b, { params }) => b.routeDetail(params[0])),
  route('POST', '/routes/:id/start', (b, { params }) => b.startRoute(params[0])),
  route('GET', '/routes/:id/objects/content', (b, { params }) => b.routeContent(params[0])),
  route('PATCH', '/objects/:id/content', (b, { params, body }) => b.updateContent(params[0], body)),

  route('GET', '/user-routes/active', (b) => b.activeRoute()),
  route('PUT', '/user-routes/:id/track', (b, { params, body }) => b.appendTrack(params[0], body)),
  route('GET', '/user-routes/:id/objects', (b, { params }) => b.pendingObjects(params[0])),
  route('POST', '/user-routes/:id/finish', (b, { params }) => b.finishRoute(params[0])),

  route('POST', '/captures', (b, { body }) => b.capture(body)),

  route('GET', '/album', (b) => b.album()),
  route('GET', '/collections', (b, { query }) => b.nearbyCollections(num(query, 'lat'), num(query, 'lon'))),
  route('GET', '/collections/:id', (b, { params }) => b.collectionDetail(params[0])),
  route('POST', '/collections', (b, { body }) => b.createCollection(body)),
  route('PATCH', '/collections/:id', (b, { params, body }) => b.updateCollection(params[0], body)),
  route('DELETE', '/collections/:id', (b, { params }) => (b.removeCollection(params[0]), null)),
  route('PUT', '/collections/:id/objects', (b, { params, body }) => b.assignObjects(params[0], body)),
];

/** Resol una petició contra el backend local. Llança `LocalApiError` en cas d'error. */
export async function dispatch(backend: LocalBackend, method: Method, path: string, body?: unknown): Promise<unknown> {
  const [pathname, search = ''] = path.split('?');
  for (const def of ROUTES) {
    if (def.method !== method) continue;
    const match = def.pattern.exec(pathname);
    if (!match) continue;
    const params = match.slice(1).map(decodeURIComponent);
    return def.handler(backend, { params, query: new URLSearchParams(search), body: (body ?? {}) as never });
  }
  throw new LocalApiError(404, 'NOT_FOUND', `Ruta desconeguda: ${method} ${pathname}`);
}
