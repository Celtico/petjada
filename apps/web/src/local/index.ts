import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { assetUrl, config, localConfig } from '../config';
import { LocalBackend } from './backend';
import { LocalDb } from './db';
import { mapboxDirections } from './directions';
import { LocalApiError } from './errors';
import { loadDatabaseBytes, requestPersistentStorage, saveDatabaseBytes } from './persist';
import { dispatch, type Method } from './router';

/**
 * Punt d'entrada del backend local al navegador: carrega SQLite (WASM), obre
 * la base desada a IndexedDB i resol les peticions de `api/client.ts` sense
 * xarxa. Es carrega amb `import()` només quan `VITE_BACKEND=local`.
 */

interface Runtime {
  db: LocalDb;
  backend: LocalBackend;
}

let runtime: Promise<Runtime> | null = null;
/** Cua: una petició (i el seu desat) acaba abans que comenci la següent. */
let queue: Promise<unknown> = Promise.resolve();

async function start(): Promise<Runtime> {
  const [sql, bytes] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), loadDatabaseBytes()]);
  const db = LocalDb.open(sql, bytes);
  requestPersistentStorage();
  return { db, backend: new LocalBackend({ db, config: localConfig, directions: mapboxDirections(config.mapboxToken), assetUrl }) };
}

function getRuntime(): Promise<Runtime> {
  runtime ??= start().catch((error: unknown) => {
    runtime = null;
    console.error('local backend failed to start', error);
    throw new LocalApiError(500, 'INTERNAL', "No s'ha pogut obrir la base de dades d'aquest dispositiu.");
  });
  return runtime;
}

async function handle(method: Method, path: string, body?: unknown): Promise<unknown> {
  const { db, backend } = await getRuntime();
  const result = await dispatch(backend, method, path, body);
  if (method !== 'GET') await saveDatabaseBytes(db.export());
  return result;
}

/** Equivalent local d'una petició HTTP a l'API. `null` equival a un 204. */
export function localRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const result = queue.then(() => handle(method, path, body));
  queue = result.catch(() => undefined);
  return result as Promise<T>;
}

export { LocalApiError };
