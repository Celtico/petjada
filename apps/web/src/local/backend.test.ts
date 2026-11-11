import type { LngLat, Position, TrackPointDto } from '@petjada/shared';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localConfig, type LocalConfig } from '../config';
import { destination, lineLengthM } from '../map/geo';
import { LocalBackend } from './backend';
import { LocalDb } from './db';
import { LocalApiError } from './errors';
import { dispatch } from './router';

const ORIGIN: LngLat = { lon: 0.6206, lat: 41.6176 };
const END = destination(ORIGIN, 90, 1000);
const LINE: Position[] = [
  [ORIGIN.lon, ORIGIN.lat],
  [END.lon, END.lat],
];

let sql: SqlJsStatic;
let db: LocalDb;
let backend: LocalBackend;
let clock: number;

function setup(config: Partial<LocalConfig> = {}): void {
  db = LocalDb.open(sql);
  clock = Date.parse('2026-01-01T10:00:00Z');
  let ids = 0;
  backend = new LocalBackend({
    db,
    config: { ...localConfig, ...config },
    directions: async (waypoints) => {
      const coordinates = waypoints.map((w): Position => [w.lon, w.lat]);
      return { coordinates, distanceM: lineLengthM(coordinates) };
    },
    now: () => new Date(clock),
    newId: () => `id-${String(++ids).padStart(4, '0')}`,
  });
}

const advance = (seconds: number): void => {
  clock += seconds * 1000;
};

function track(from: LngLat, bearing: number, lengthM: number, stepM = 10): TrackPointDto[] {
  const points: TrackPointDto[] = [];
  for (let d = 0; d <= lengthM; d += stepM) {
    const p = destination(from, bearing, d);
    points.push({ lon: p.lon, lat: p.lat, accuracy: 5, timestamp: clock + d * 1000 });
  }
  return points;
}

function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LocalApiError);
    expect((error as LocalApiError).code).toBe(code);
    return;
  }
  throw new Error(`s'esperava l'error ${code}`);
}

beforeAll(async () => {
  sql = await initSqlJs();
});

beforeEach(() => setup());

describe('usuari del dispositiu', () => {
  it('no hi ha sessió fins que es crea el convidat, i després sempre és el mateix', () => {
    expectError(() => backend.refresh(), 'UNAUTHORIZED');
    const first = backend.guest();
    expect(first.user.isGuest).toBe(true);
    expect(first.user.displayName).toMatch(/^Caminant-/);
    expect(backend.guest().user.id).toBe(first.user.id);
    expect(backend.refresh().user.id).toBe(first.user.id);
  });

  it('esborrar el compte elimina totes les dades', () => {
    backend.guest();
    backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    backend.deleteAccount();
    expect(db.all('SELECT id FROM routes')).toHaveLength(0);
    expect(db.all('SELECT id FROM route_objects')).toHaveLength(0);
    expectError(() => backend.me(), 'UNAUTHORIZED');
  });
});

describe('rutes', () => {
  beforeEach(() => backend.guest());

  it('previsualitza i col·loca un objecte cada 250 m sobre la línia', async () => {
    const preview = await backend.preview({ mode: 'manual', waypoints: [ORIGIN, END], roundTrip: false });
    expect(preview.lengthM).toBeCloseTo(1000, 0);
    expect(preview.objects.map((o) => Math.round(o.distanceFromStartM))).toEqual([125, 375, 625, 875]);
    expect(preview.objects.every((o) => o.leg === 'anada')).toBe(true);
  });

  it('en anada i tornada alterna els trams i dobla la longitud', async () => {
    const preview = await backend.preview({ mode: 'manual', waypoints: [ORIGIN, END], roundTrip: true });
    expect(preview.lengthM).toBeCloseTo(2000, 0);
    expect(preview.objects.map((o) => o.leg).sort()).toEqual(['anada', 'anada', 'tornada', 'tornada']);
  });

  it('desa la ruta i la llista amb la distància a l’inici', () => {
    const route = backend.createRoute({ name: ' Passeig ', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    expect(route.name).toBe('Passeig');
    expect(route.objects).toHaveLength(4);
    expect(route.isMine).toBe(true);
    const from = destination(ORIGIN, 180, 300);
    const [listed] = backend.nearbyRoutes(from.lat, from.lon);
    expect(listed.id).toBe(route.id);
    expect(listed.distanceToStartM).toBeCloseTo(300, 0);
    expect(listed.pendingObjectCount).toBe(4);
  });

  it('projecta els objectes manuals sobre la línia i en desa la fitxa', () => {
    const off = destination(destination(ORIGIN, 90, 400), 0, 30);
    const route = backend.createRoute({
      name: 'Manual',
      description: '',
      isPublic: false,
      roundTrip: false,
      geometry: { type: 'LineString', coordinates: LINE },
      objects: [{ lon: off.lon, lat: off.lat, type: 'bolet', title: ' La font ', storyText: '  ' }],
    });
    expect(route.objects).toHaveLength(1);
    expect(route.objects[0].distanceFromStartM).toBeCloseTo(400, 0);
    expect(route.objects[0].hasContent).toBe(true);
    const [content] = backend.routeContent(route.id);
    expect(content.title).toBe('La font');
    expect(content.storyText).toBeNull();
  });

  it('rebutja geometries sense longitud', () => {
    expectError(
      () => backend.createRoute({ name: 'X', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: [LINE[0], LINE[0]] } }),
      'VALIDATION',
    );
  });

  it('només permet una ruta en curs', () => {
    const geometry = { type: 'LineString' as const, coordinates: LINE };
    const a = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: false, geometry });
    const b = backend.createRoute({ name: 'B', description: '', isPublic: false, roundTrip: false, geometry });
    const started = backend.startRoute(a.id);
    expect(backend.startRoute(a.id).userRoute.id).toBe(started.userRoute.id);
    expectError(() => backend.startRoute(b.id), 'CONFLICT');
    expect(backend.activeRoute()?.route.id).toBe(a.id);
  });
});

describe('captures', () => {
  let routeId: string;
  let userRouteId: string;

  beforeEach(() => {
    backend.guest();
    routeId = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: true, geometry: { type: 'LineString', coordinates: LINE } }).id;
    userRouteId = backend.startRoute(routeId).userRoute.id;
  });

  const objects = () => backend.pendingObjects(userRouteId).objects;
  const captureAt = (objectId: string, p: LngLat, accuracy = 5) =>
    backend.capture({ objectId, lon: p.lon, lat: p.lat, accuracy, timestamp: clock });

  it('valida distància, precisió i duplicats, i suma punts', () => {
    const first = objects()[0];
    expectError(() => captureAt(first.id, destination(first, 0, 60)), 'TOO_FAR');
    expectError(() => captureAt(first.id, first, 80), 'BAD_ACCURACY');
    const result = captureAt(first.id, destination(first, 0, 10));
    expect(result.points).toBe(first.points);
    expect(result.totalPoints).toBe(first.points);
    expect(result.card.objectId).toBe(first.id);
    expectError(() => captureAt(first.id, first), 'ALREADY_CAPTURED');
    expect(objects().some((o) => o.id === first.id)).toBe(false);
    expect(backend.album().entries).toHaveLength(1);
    expect(backend.me().totalPoints).toBe(first.points);
  });

  it('no deixa capturar sense la ruta en curs', () => {
    const first = objects()[0];
    backend.finishRoute(userRouteId);
    expectError(() => captureAt(first.id, first), 'NO_ACTIVE_ROUTE');
  });

  it('bloqueja el tram de tornada fins arribar al gir', () => {
    const back = objects().find((o) => o.leg === 'tornada')!;
    expectError(() => captureAt(back.id, back), 'LEG_LOCKED');
    const progress = backend.appendTrack(userRouteId, { points: track(ORIGIN, 90, 1000) });
    expect(progress.reachedTurnaround).toBe(true);
    expect(captureAt(back.id, back).points).toBe(back.points);
  });

  it('rebutja velocitats impossibles entre captures', () => {
    const [first, second] = objects().filter((o) => o.leg === 'anada');
    captureAt(first.id, first);
    advance(10);
    expectError(() => captureAt(second.id, second), 'TOO_FAST');
    advance(600);
    expect(captureAt(second.id, second).totalPoints).toBe(first.points + second.points);
  });
});

describe('seguiment i finalització', () => {
  beforeEach(() => backend.guest());

  it('completa la ruta amb bonus quan s’ha cobert prou', () => {
    const route = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    const { userRoute } = backend.startRoute(route.id);
    expect(backend.appendTrack(userRoute.id, { points: track(ORIGIN, 90, 500) }).coverage).toBeCloseTo(0.52, 1);
    const progress = backend.appendTrack(userRoute.id, { points: track(destination(ORIGIN, 90, 500), 90, 500) });
    expect(progress.coverage).toBe(1);
    const finished = backend.finishRoute(userRoute.id);
    expect(finished.completed).toBe(true);
    expect(finished.bonusPoints).toBe(20);
    expect(finished.totalPoints).toBe(20);
    expect(backend.activeRoute()).toBeNull();
    expect(backend.routeDetail(route.id).status).toBe('completed');
  });

  it('abandona la ruta si no s’ha cobert prou', () => {
    const route = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    const { userRoute } = backend.startRoute(route.id);
    backend.appendTrack(userRoute.id, { points: track(ORIGIN, 90, 300) });
    const finished = backend.finishRoute(userRoute.id);
    expect(finished.completed).toBe(false);
    expect(finished.bonusPoints).toBe(0);
    expect(backend.routeDetail(route.id).status).toBeNull();
  });

  it('descarta els punts de mala precisió', () => {
    const route = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    const { userRoute } = backend.startRoute(route.id);
    const noisy = track(ORIGIN, 90, 1000).map((p) => ({ ...p, accuracy: 500 }));
    expect(backend.appendTrack(userRoute.id, { points: noisy }).coverage).toBe(0);
  });

  it('en anada i tornada cal haver arribat al gir', () => {
    const route = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: true, geometry: { type: 'LineString', coordinates: LINE } });
    const { userRoute } = backend.startRoute(route.id);
    const progress = backend.appendTrack(userRoute.id, { points: track(ORIGIN, 90, 960) });
    expect(progress.coverage).toBeGreaterThan(0.9);
    expect(progress.reachedTurnaround).toBe(false);
    expect(backend.finishRoute(userRoute.id).completed).toBe(false);
  });
});

describe('col·leccions', () => {
  const zoneAround = (center: LngLat, halfM: number) => {
    const sw = destination(destination(center, 180, halfM), 270, halfM);
    const ne = destination(destination(center, 0, halfM), 90, halfM);
    return {
      type: 'Polygon' as const,
      coordinates: [
        [
          [sw.lon, sw.lat],
          [ne.lon, sw.lat],
          [ne.lon, ne.lat],
          [sw.lon, ne.lat],
          [sw.lon, sw.lat],
        ] as Position[],
      ],
    };
  };

  it('els jugadors no poden crear col·leccions', () => {
    backend.guest();
    expectError(() => backend.createCollection({ name: 'Z', description: '', zone: zoneAround(ORIGIN, 100), bonusPoints: 5 }), 'FORBIDDEN');
  });

  it('assigna només objectes de dins la zona i dona el bonus en completar-la', () => {
    setup({ role: 'editor' });
    backend.guest();
    const route = backend.createRoute({ name: 'A', description: '', isPublic: true, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    const [first, second, third] = route.objects;
    const collection = backend.createCollection({ name: 'Barri vell', description: '', zone: zoneAround(destination(ORIGIN, 90, 250), 200), bonusPoints: 50 });
    expectError(() => backend.assignObjects(collection.id, { objectIds: [first.id, third.id] }), 'VALIDATION');
    const assigned = backend.assignObjects(collection.id, { objectIds: [first.id, second.id] });
    expect(assigned.objectCount).toBe(2);
    expect(assigned.items.every((it) => !it.captured && it.card === null && it.imageUrl === null)).toBe(true);
    expect(backend.nearbyCollections(ORIGIN.lat, ORIGIN.lon)).toHaveLength(1);
    expect(backend.routeDetail(route.id).isOfficial).toBe(true);

    backend.startRoute(route.id);
    const one = backend.capture({ objectId: first.id, lon: first.lon, lat: first.lat, accuracy: 5, timestamp: clock });
    expect(one.collectionCompleted).toBeNull();
    advance(600);
    const two = backend.capture({ objectId: second.id, lon: second.lon, lat: second.lat, accuracy: 5, timestamp: clock });
    expect(two.collectionCompleted).toEqual({ collectionId: collection.id, name: 'Barri vell', bonusPoints: 50 });
    expect(two.totalPoints).toBe(first.points + second.points + 50);

    const detail = backend.collectionDetail(collection.id);
    expect(detail.completed).toBe(true);
    expect(detail.items.every((it) => it.captured && it.card !== null)).toBe(true);
    expect(backend.album().collections[0].completed).toBe(true);

    backend.removeCollection(collection.id);
    expect(backend.routeDetail(route.id).objects.every((o) => o.collectionId === null)).toBe(true);
  });

  it('rebutja zones no vàlides', () => {
    setup({ role: 'admin' });
    backend.guest();
    const zone = zoneAround(ORIGIN, 100);
    const [a, b, c, d, e] = zone.coordinates[0];
    expectError(() => backend.createCollection({ name: 'Z', description: '', zone: { type: 'Polygon', coordinates: [[a, c, b, d, e]] }, bonusPoints: 0 }), 'VALIDATION');
  });
});

describe('persistència i encaminament', () => {
  it('les dades i les claus foranes sobreviuen a exportar i reobrir', () => {
    backend.guest();
    const route = backend.createRoute({ name: 'A', description: '', isPublic: false, roundTrip: false, geometry: { type: 'LineString', coordinates: LINE } });
    const bytes = db.export();
    // Després d'exportar, les claus foranes han de continuar actives.
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1);

    const reopened = LocalDb.open(sql, bytes);
    const restored = new LocalBackend({ db: reopened, config: localConfig, directions: async () => ({ coordinates: [], distanceM: 0 }) });
    expect(restored.routeDetail(route.id).objects).toHaveLength(4);
    restored.deleteAccount();
    expect(reopened.all('SELECT id FROM route_objects')).toHaveLength(0);
  });

  it('resol les mateixes rutes HTTP que l’API', async () => {
    const session = (await dispatch(backend, 'POST', '/auth/guest')) as { user: { id: string } };
    expect(session.user.id).toBeTruthy();
    const created = (await dispatch(backend, 'POST', '/routes', {
      name: 'A',
      description: '',
      isPublic: false,
      roundTrip: false,
      geometry: { type: 'LineString', coordinates: LINE },
    })) as { id: string };
    const list = (await dispatch(backend, 'GET', `/routes?lat=${ORIGIN.lat}&lon=${ORIGIN.lon}`)) as unknown[];
    expect(list).toHaveLength(1);
    expect(await dispatch(backend, 'GET', '/user-routes/active')).toBeNull();
    const active = (await dispatch(backend, 'POST', `/routes/${created.id}/start`)) as { userRoute: { id: string } };
    expect(((await dispatch(backend, 'GET', `/user-routes/${active.userRoute.id}/objects`)) as { objects: unknown[] }).objects).toHaveLength(4);
    await expect(dispatch(backend, 'POST', '/auth/magic-link', { email: 'a@b.cat' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(dispatch(backend, 'GET', '/no-existeix')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
