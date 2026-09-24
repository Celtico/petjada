-- Esquema inicial de Petjada.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Usuaris i sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL per als convidats. Mai es mostra a altres usuaris.
  email         citext UNIQUE,
  display_name  text NOT NULL,
  avatar_url    text,
  is_guest      boolean NOT NULL DEFAULT true,
  role          text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'editor', 'admin')),
  total_points  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Refresh tokens rotatius. Només se'n guarda el hash.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Enllaços màgics i codis d'entrada. Només se'n guarden els hashos.
CREATE TABLE IF NOT EXISTS login_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL,
  link_hash     text NOT NULL UNIQUE,
  code_hash     text NOT NULL,
  -- Convidat que es fusionarà amb el compte en verificar.
  guest_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_tokens_email_idx ON login_tokens (email, created_at DESC);

-- ---------------------------------------------------------------------------
-- Col·leccions per zona
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  zone            geometry(Polygon, 4326) NOT NULL,
  cover_image_url text,
  bonus_points    integer NOT NULL DEFAULT 0,
  created_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collections_zone_gist ON collections USING GIST (zone);

-- ---------------------------------------------------------------------------
-- Rutes i objectes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Geometria del tram d'anada. Si round_trip, la tornada és la mateixa línia invertida.
  geom        geometry(LineString, 4326) NOT NULL,
  -- Longitud TOTAL a caminar (amb tornada si escau), en metres.
  length_m    double precision NOT NULL,
  round_trip  boolean NOT NULL DEFAULT false,
  is_public   boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routes_geom_gist ON routes USING GIST (geom);
CREATE INDEX IF NOT EXISTS routes_start_gist ON routes USING GIST ((ST_StartPoint(geom)));
CREATE INDEX IF NOT EXISTS routes_created_by_idx ON routes (created_by);

CREATE TABLE IF NOT EXISTS route_objects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id              uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  geom                  geometry(Point, 4326) NOT NULL,
  type                  text NOT NULL,
  image_url             text NOT NULL,
  points                integer NOT NULL,
  leg                   text NOT NULL CHECK (leg IN ('anada', 'tornada')),
  distance_from_start_m double precision NOT NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  -- Fitxa de contingut (opcional). Mai es revela abans de capturar l'objecte.
  title                 text,
  story_text            text CHECK (story_text IS NULL OR char_length(story_text) <= 500),
  story_image_url       text,
  collection_id         uuid REFERENCES collections(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS route_objects_geom_gist ON route_objects USING GIST (geom);
CREATE INDEX IF NOT EXISTS route_objects_route_idx ON route_objects (route_id, sort_order);
CREATE INDEX IF NOT EXISTS route_objects_collection_idx ON route_objects (collection_id);

-- ---------------------------------------------------------------------------
-- Progrés de l'usuari
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_routes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id           uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  status             text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  track              geometry(LineString, 4326),
  reached_turnaround boolean NOT NULL DEFAULT false,
  coverage           double precision NOT NULL DEFAULT 0,
  -- Bonus concedit en completar (per poder recalcular total_points).
  bonus_points       integer NOT NULL DEFAULT 0,
  last_track_at      timestamptz
);
CREATE INDEX IF NOT EXISTS user_routes_track_gist ON user_routes USING GIST (track);
CREATE INDEX IF NOT EXISTS user_routes_user_idx ON user_routes (user_id, started_at DESC);
-- Només una ruta en curs per usuari.
CREATE UNIQUE INDEX IF NOT EXISTS user_routes_one_in_progress
  ON user_routes (user_id) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS user_captures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_id   uuid NOT NULL REFERENCES route_objects(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  lat         double precision NOT NULL,
  lon         double precision NOT NULL,
  accuracy    double precision NOT NULL,
  UNIQUE (user_id, object_id)
);
CREATE INDEX IF NOT EXISTS user_captures_user_time_idx ON user_captures (user_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS user_collections (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  bonus_points  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, collection_id)
);
