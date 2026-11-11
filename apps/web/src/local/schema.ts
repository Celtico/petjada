/**
 * Esquema SQLite del backend local. És el de `apps/api/migrations/001_init.sql`
 * adaptat: sense PostGIS, les geometries es desen com a JSON (coordenades
 * GeoJSON) i els punts com a columnes `lon`/`lat`; els identificadors són UUID
 * en text, les dates ISO 8601 en text i els booleans enters 0/1. No hi ha
 * taules de sessió: en local hi ha un sol usuari, el del dispositiu.
 *
 * Cada entrada és una migració; `PRAGMA user_version` en porta el compte.
 * No modifiquis una migració ja publicada: afegeix-ne una de nova al final.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    is_guest      INTEGER NOT NULL DEFAULT 1,
    role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'editor', 'admin')),
    total_points  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE collections (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    -- Anells del polígon GeoJSON: [[[lon, lat], ...], ...]
    zone            TEXT NOT NULL,
    cover_image_url TEXT,
    bonus_points    INTEGER NOT NULL DEFAULT 0,
    created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE routes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    -- Coordenades del tram d'anada: [[lon, lat], ...]. Si round_trip, la tornada és la mateixa línia invertida.
    geom        TEXT NOT NULL,
    start_lon   REAL NOT NULL,
    start_lat   REAL NOT NULL,
    -- Longitud TOTAL a caminar (amb tornada si escau), en metres.
    length_m    REAL NOT NULL,
    round_trip  INTEGER NOT NULL DEFAULT 0,
    is_public   INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX routes_created_by_idx ON routes (created_by);

  CREATE TABLE route_objects (
    id                    TEXT PRIMARY KEY,
    route_id              TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    lon                   REAL NOT NULL,
    lat                   REAL NOT NULL,
    type                  TEXT NOT NULL,
    image_url             TEXT NOT NULL,
    points                INTEGER NOT NULL,
    leg                   TEXT NOT NULL CHECK (leg IN ('anada', 'tornada')),
    distance_from_start_m REAL NOT NULL,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    -- Fitxa de contingut (opcional). Mai es revela abans de capturar l'objecte.
    title                 TEXT,
    story_text            TEXT CHECK (story_text IS NULL OR length(story_text) <= 500),
    story_image_url       TEXT,
    collection_id         TEXT REFERENCES collections(id) ON DELETE SET NULL
  );
  CREATE INDEX route_objects_route_idx ON route_objects (route_id, sort_order);
  CREATE INDEX route_objects_collection_idx ON route_objects (collection_id);

  CREATE TABLE user_routes (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id           TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    status             TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    started_at         TEXT NOT NULL,
    completed_at       TEXT,
    -- Track caminat: [[lon, lat], ...]
    track              TEXT,
    -- Mostres de la ruta ja cobertes pel track, una xifra (0/1) per mostra.
    covered            TEXT,
    reached_turnaround INTEGER NOT NULL DEFAULT 0,
    coverage           REAL NOT NULL DEFAULT 0,
    -- Bonus concedit en completar.
    bonus_points       INTEGER NOT NULL DEFAULT 0,
    last_track_at      TEXT
  );
  CREATE INDEX user_routes_user_idx ON user_routes (user_id, started_at DESC);
  -- Només una ruta en curs per usuari.
  CREATE UNIQUE INDEX user_routes_one_in_progress ON user_routes (user_id) WHERE status = 'in_progress';

  CREATE TABLE user_captures (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_id   TEXT NOT NULL REFERENCES route_objects(id) ON DELETE CASCADE,
    captured_at TEXT NOT NULL,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    accuracy    REAL NOT NULL,
    UNIQUE (user_id, object_id)
  );
  CREATE INDEX user_captures_user_time_idx ON user_captures (user_id, captured_at DESC);

  CREATE TABLE user_collections (
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    completed_at  TEXT NOT NULL,
    bonus_points  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, collection_id)
  );
  `,
];
