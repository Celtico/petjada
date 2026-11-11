/**
 * Persistència del fitxer SQLite a IndexedDB: un sol registre amb els bytes de
 * la base. Es desa sencera després de cada escriptura; és petita (rutes,
 * objectes i captures d'un sol usuari).
 */

const IDB_NAME = 'petjada-local';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'db';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB no disponible'));
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openIdb().then(
    (idb) =>
      new Promise<T>((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, mode);
        const request = run(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => {
          idb.close();
          resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
          idb.close();
          reject(tx.error ?? new Error("No s'han pogut desar les dades"));
        };
      }),
  );
}

export async function loadDatabaseBytes(): Promise<Uint8Array | null> {
  const stored = await withStore<unknown>('readonly', (store) => store.get(IDB_KEY));
  return stored instanceof Uint8Array ? stored : null;
}

export async function saveDatabaseBytes(bytes: Uint8Array): Promise<void> {
  await withStore('readwrite', (store) => store.put(bytes, IDB_KEY));
}

/** Demana al navegador que no esborri les dades si li falta espai. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => false);
}
