import {
  AUTO_ROUTE_LENGTHS_M,
  OBJECT_TYPES,
  STORY_TEXT_MAX_LENGTH,
  objectImageUrl,
  type ActiveRouteResponse,
  type AlbumResponse,
  type AppendTrackRequest,
  type AppendTrackResponse,
  type AssignCollectionObjectsRequest,
  type AuthResponse,
  type CaptureRequest,
  type CaptureResponse,
  type CollectionDetailDto,
  type CollectionItemDto,
  type CollectionSummaryDto,
  type CreateRouteObjectInput,
  type CreateRouteRequest,
  type FinishRouteResponse,
  type Leg,
  type LineStringGeometry,
  type LngLat,
  type ObjectCardDto,
  type ObjectContentInput,
  type ObjectType,
  type PendingObjectsResponse,
  type PlacedObjectDto,
  type Position,
  type PreviewRouteRequest,
  type PreviewRouteResponse,
  type RouteDetailDto,
  type RouteObjectContentDto,
  type RouteObjectDto,
  type RouteSummaryDto,
  type UpdateProfileRequest,
  type UpsertCollectionRequest,
  type UserDto,
  type UserRole,
  type UserRouteDto,
  type UserRouteStatus,
} from '@petjada/shared';
import type { LocalConfig } from '../config';
import { haversineM, lineLengthM, toLngLat } from '../map/geo';
import { buildCandidate, candidateBearings, pickClosest, straightLineTargetM, suggestedNames } from './auto-route';
import { bool, type LocalDb } from './db';
import type { DirectionsResult } from './directions';
import { LocalApiError } from './errors';
import {
  coverageFraction,
  distanceToLineM,
  distanceToPolygonM,
  interpolateOnLine,
  locateOnLine,
  markCovered,
  pointInPolygon,
  polygonInvalidReason,
  sampleLine,
} from './geo';
import { pickType, placementSlots, pointsFor, sortByWalk, walkedDistanceM } from './placement';
import { checkSpeed } from './speed';
import { completionBonus, isRouteCompleted, prepareTrackPoints } from './track';

/**
 * Backend local: la mateixa lògica que `apps/api` (rutes, objectes, captures,
 * seguiment, àlbum i col·leccions) sobre SQLite dins del navegador, amb la
 * geometria calculada en TypeScript en lloc de PostGIS.
 *
 * AVÍS: aquí la validació de captures, punts i finalització s'executa al
 * dispositiu de l'usuari, que no és fiable. Serveix per jugar sol i per a
 * demostracions sense servidor; per a classificacions o contingut compartit
 * cal l'API.
 */

export interface LocalBackendDeps {
  db: LocalDb;
  config: LocalConfig;
  directions: (waypoints: LngLat[]) => Promise<DirectionsResult>;
  /** Resol una ruta de `public/` segons la base del desplegament. */
  assetUrl?: (path: string) => string;
  now?: () => Date;
  newId?: () => string;
}

/** Vida de l'"access token" local: només marca cada quant la PWA torna a llegir l'usuari. */
const LOCAL_SESSION_TTL_S = 3600;
const GUEST_NAME_PREFIX = 'Caminant-';

interface UserRow {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  is_guest: number;
  role: UserRole;
  total_points: number;
}

interface RouteSummaryRow {
  id: string;
  name: string;
  description: string;
  length_m: number;
  round_trip: number;
  is_public: number;
  is_official: number;
  created_by: string;
  created_at: string;
  start_lon: number;
  start_lat: number;
  geom: string;
  user_route_id: string | null;
  status: UserRouteStatus | null;
  object_count: number;
  pending_object_count: number;
}

interface RouteObjectRow {
  id: string;
  route_id: string;
  lon: number;
  lat: number;
  type: ObjectType;
  image_url: string;
  points: number;
  leg: Leg;
  distance_from_start_m: number;
  title: string | null;
  story_text: string | null;
  story_image_url: string | null;
  collection_id: string | null;
  captured?: number;
}

interface ObjectCardRow extends RouteObjectRow {
  route_name: string;
  collection_name: string | null;
}

interface UserRouteRow {
  id: string;
  route_id: string;
  user_id: string;
  status: UserRouteStatus;
  started_at: string;
  completed_at: string | null;
  track: string | null;
  covered: string | null;
  reached_turnaround: number;
  coverage: number;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string;
  zone: string;
  cover_image_url: string | null;
  bonus_points: number;
  created_by: string;
  object_count: number;
  captured_count: number;
  completed_at: string | null;
}

interface PlacedObject extends PlacedObjectDto {
  sortOrder: number;
  title: string | null;
  storyText: string | null;
  storyImageUrl: string | null;
}

const USER_COLUMNS = 'id, email, display_name, avatar_url, is_guest, role, total_points';
const USER_ROUTE_COLUMNS =
  'id, route_id, user_id, status, started_at, completed_at, track, covered, reached_turnaround, coverage';

/** Últim `user_routes` de l'usuari (?1) per a la ruta, prioritzant la que està en curs. */
const LATEST_USER_ROUTE = `FROM user_routes ur WHERE ur.user_id = ?1 AND ur.route_id = r.id
  ORDER BY (ur.status = 'in_progress') DESC, ur.started_at DESC LIMIT 1`;

/** Resum d'una ruta per a l'usuari ?1. */
const ROUTE_SUMMARY_SELECT = `
  SELECT r.id, r.name, r.description, r.length_m, r.round_trip, r.is_public, r.created_by, r.created_at,
         r.start_lon, r.start_lat, r.geom,
         (cu.role IN ('editor', 'admin')) AS is_official,
         (SELECT ur.id ${LATEST_USER_ROUTE}) AS user_route_id,
         (SELECT ur.status ${LATEST_USER_ROUTE}) AS status,
         (SELECT count(*) FROM route_objects o WHERE o.route_id = r.id) AS object_count,
         (SELECT count(*) FROM route_objects o
           WHERE o.route_id = r.id
             AND NOT EXISTS (SELECT 1 FROM user_captures c WHERE c.object_id = o.id AND c.user_id = ?1))
           AS pending_object_count
    FROM routes r
    JOIN users cu ON cu.id = r.created_by`;

const OBJECT_COLUMNS = `o.id, o.route_id, o.lon, o.lat, o.type, o.image_url, o.points, o.leg, o.distance_from_start_m,
  o.title, o.story_text, o.story_image_url, o.collection_id`;

const OBJECT_CARD_SELECT = `
  SELECT ${OBJECT_COLUMNS}, r.name AS route_name, col.name AS collection_name
    FROM route_objects o
    JOIN routes r ON r.id = o.route_id
    LEFT JOIN collections col ON col.id = o.collection_id`;

/** Resum d'una col·lecció per a l'usuari ?1. */
const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.description, c.zone, c.cover_image_url, c.bonus_points, c.created_by,
         (SELECT count(*) FROM route_objects o WHERE o.collection_id = c.id) AS object_count,
         (SELECT count(*) FROM route_objects o
            JOIN user_captures uc ON uc.object_id = o.id AND uc.user_id = ?1
           WHERE o.collection_id = c.id) AS captured_count,
         ucl.completed_at
    FROM collections c
    LEFT JOIN user_collections ucl ON ucl.user_id = ?1 AND ucl.collection_id = c.id`;

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function invalid(message: string): never {
  throw new LocalApiError(400, 'VALIDATION', message);
}

function isNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isLngLat(value: unknown): value is LngLat {
  const p = value as LngLat | null;
  return !!p && isNumberIn(p.lon, -180, 180) && isNumberIn(p.lat, -90, 90);
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && isNumberIn(value[0], -180, 180) && isNumberIn(value[1], -90, 90);
}

function checkContent(input: ObjectContentInput): void {
  if (input.title != null && (typeof input.title !== 'string' || input.title.length > 120)) {
    invalid('El títol de la fitxa no pot superar 120 caràcters');
  }
  if (input.storyText != null && (typeof input.storyText !== 'string' || input.storyText.length > STORY_TEXT_MAX_LENGTH)) {
    invalid(`El text de la fitxa no pot superar ${STORY_TEXT_MAX_LENGTH} caràcters`);
  }
  if (input.storyImageUrl != null && (typeof input.storyImageUrl !== 'string' || input.storyImageUrl.length > 2048)) {
    invalid('La imatge de la fitxa ha de ser una URL');
  }
}

export class LocalBackend {
  private readonly db: LocalDb;
  private readonly config: LocalConfig;
  private readonly directions: LocalBackendDeps['directions'];
  private readonly assetUrl: (path: string) => string;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: LocalBackendDeps) {
    this.db = deps.db;
    this.config = deps.config;
    this.directions = deps.directions;
    this.assetUrl = deps.assetUrl ?? ((path) => path);
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  // -------------------------------------------------------------------------
  // Usuari del dispositiu
  // -------------------------------------------------------------------------

  private findUser(): UserRow | null {
    return this.db.get<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at LIMIT 1`);
  }

  /** L'usuari local. Si encara no n'hi ha cap, 401 (la PWA en crearà un amb `guest`). */
  private requireUser(): UserRow {
    const user = this.findUser();
    if (!user) throw new LocalApiError(401, 'UNAUTHORIZED', 'Encara no hi ha cap usuari en aquest dispositiu');
    return user;
  }

  private toUser(row: UserRow): UserDto {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      isGuest: bool(row.is_guest),
      role: row.role,
      totalPoints: row.total_points,
    };
  }

  private session(row: UserRow): AuthResponse {
    return { accessToken: `local.${row.id}`, expiresIn: LOCAL_SESSION_TTL_S, user: this.toUser(row) };
  }

  /** Crea l'usuari del dispositiu, o retorna el que ja hi ha. */
  guest(): AuthResponse {
    const existing = this.findUser();
    if (existing) return this.refresh();
    const id = this.newId();
    const name = `${GUEST_NAME_PREFIX}${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
    this.db.run(
      'INSERT INTO users (id, email, display_name, is_guest, role, created_at) VALUES (?, NULL, ?, 1, ?, ?)',
      [id, name, this.config.role, this.nowIso()],
    );
    return this.session(this.requireUser());
  }

  /** Recupera la sessió de l'usuari del dispositiu i hi aplica el rol configurat. */
  refresh(): AuthResponse {
    const user = this.requireUser();
    if (user.role !== this.config.role) {
      this.db.run('UPDATE users SET role = ? WHERE id = ?', [this.config.role, user.id]);
    }
    return this.session(this.requireUser());
  }

  me(): UserDto {
    return this.toUser(this.requireUser());
  }

  updateProfile(patch: UpdateProfileRequest): UserDto {
    const user = this.requireUser();
    const name = patch.displayName?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 40)) invalid('El nom ha de tenir entre 2 i 40 caràcters');
    if (patch.avatarUrl != null && !/^https?:\/\/\S+$/i.test(patch.avatarUrl)) invalid("L'avatar ha de ser una URL");
    this.db.run('UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?', [
      name ?? user.display_name,
      patch.avatarUrl !== undefined ? patch.avatarUrl : user.avatar_url,
      user.id,
    ]);
    return this.me();
  }

  /** Esborra l'usuari i totes les seves dades (cascade). */
  deleteAccount(): void {
    this.db.run('DELETE FROM users WHERE id = ?', [this.requireUser().id]);
  }

  // -------------------------------------------------------------------------
  // Mapatge
  // -------------------------------------------------------------------------

  private toRouteSummary(row: RouteSummaryRow, userId: string, from: LngLat | null): RouteSummaryDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      lengthM: row.length_m,
      roundTrip: bool(row.round_trip),
      isPublic: bool(row.is_public),
      isOfficial: bool(row.is_official),
      createdBy: row.created_by,
      createdAt: row.created_at,
      isMine: row.created_by === userId,
      status: row.status,
      userRouteId: row.user_route_id,
      objectCount: row.object_count,
      pendingObjectCount: row.pending_object_count,
      distanceToStartM: from ? haversineM(from, { lon: row.start_lon, lat: row.start_lat }) : null,
    };
  }

  private imageUrl(row: { image_url: string; type: ObjectType }): string {
    return this.assetUrl(row.image_url || objectImageUrl(row.type));
  }

  /** Dades públiques d'un objecte: mai el contingut de la fitxa. */
  private toRouteObject(row: RouteObjectRow): RouteObjectDto {
    const dto: RouteObjectDto = {
      id: row.id,
      routeId: row.route_id,
      lon: row.lon,
      lat: row.lat,
      type: row.type,
      imageUrl: this.imageUrl(row),
      points: row.points,
      leg: row.leg,
      distanceFromStartM: row.distance_from_start_m,
      hasContent: row.title !== null || row.story_text !== null || row.story_image_url !== null,
      collectionId: row.collection_id,
    };
    if (row.captured !== undefined) dto.captured = bool(row.captured);
    return dto;
  }

  private toRouteObjectContent(row: RouteObjectRow): RouteObjectContentDto {
    return {
      ...this.toRouteObject(row),
      title: row.title,
      storyText: row.story_text,
      storyImageUrl: row.story_image_url,
    };
  }

  private toObjectCard(row: ObjectCardRow): ObjectCardDto {
    return {
      objectId: row.id,
      routeId: row.route_id,
      routeName: row.route_name,
      type: row.type,
      imageUrl: this.imageUrl(row),
      points: row.points,
      hasContent: row.title !== null || row.story_text !== null || row.story_image_url !== null,
      title: row.title,
      storyText: row.story_text,
      storyImageUrl: row.story_image_url,
      distanceFromStartM: row.distance_from_start_m,
      collectionId: row.collection_id,
      collectionName: row.collection_name,
    };
  }

  private toUserRoute(row: UserRouteRow): UserRouteDto {
    return {
      id: row.id,
      routeId: row.route_id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      reachedTurnaround: bool(row.reached_turnaround),
      coverage: row.coverage,
    };
  }

  private toCollectionSummary(row: CollectionRow): CollectionSummaryDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      coverImageUrl: row.cover_image_url,
      bonusPoints: row.bonus_points,
      createdBy: row.created_by,
      objectCount: row.object_count,
      capturedCount: row.captured_count,
      completed: row.completed_at !== null,
      completedAt: row.completed_at,
    };
  }

  // -------------------------------------------------------------------------
  // Rutes: previsualització i col·locació d'objectes
  // -------------------------------------------------------------------------

  async preview(req: PreviewRouteRequest): Promise<PreviewRouteResponse> {
    this.requireUser();
    if (typeof req.roundTrip !== 'boolean') invalid('`roundTrip` ha de ser un booleà');
    let result: DirectionsResult;
    if (req.mode === 'auto') {
      if (!isLngLat(req.origin) || !AUTO_ROUTE_LENGTHS_M.includes(req.targetLengthM)) {
        invalid('La creació automàtica necessita `origin` i `targetLengthM`');
      }
      result = await this.generateAuto(req.origin, req.targetLengthM, req.roundTrip);
    } else if (req.mode === 'manual') {
      if (!Array.isArray(req.waypoints) || req.waypoints.length < 2 || !req.waypoints.every(isLngLat)) {
        invalid('La creació manual necessita almenys dos `waypoints`');
      }
      if (req.waypoints.length > this.config.maxWaypoints) invalid(`Màxim ${this.config.maxWaypoints} punts`);
      result = await this.directions(req.waypoints);
    } else {
      invalid('`mode` ha de ser `auto` o `manual`');
    }

    const geometry: LineStringGeometry = { type: 'LineString', coordinates: result.coordinates };
    const lengthM = req.roundTrip ? result.distanceM * 2 : result.distanceM;
    const names = suggestedNames(lengthM, req.roundTrip, this.now());
    return {
      geometry,
      lengthM,
      roundTrip: req.roundTrip,
      objects: this.autoPlace(geometry.coordinates, req.roundTrip).map(({ lon, lat, type, leg, points, distanceFromStartM }) => ({
        lon,
        lat,
        type,
        leg,
        points,
        distanceFromStartM,
      })),
      suggestedName: names.name,
      suggestedDescription: names.description,
    };
  }

  /** Prova diversos rumbs des de l'origen i tria la ruta amb la longitud més propera a l'objectiu. */
  private async generateAuto(origin: LngLat, targetLengthM: number, roundTrip: boolean): Promise<DirectionsResult> {
    const straightM = straightLineTargetM(targetLengthM, roundTrip, this.config.walkingDetourFactor);
    const candidates = candidateBearings(this.config.autoRouteCandidates).map((bearing) =>
      buildCandidate(origin, bearing, straightM, roundTrip),
    );
    const settled = await Promise.allSettled(candidates.map((c) => this.directions(c.waypoints)));
    const ok = settled
      .filter((s): s is PromiseFulfilledResult<DirectionsResult> => s.status === 'fulfilled')
      .map((s) => ({ ...s.value, lengthM: roundTrip ? s.value.distanceM * 2 : s.value.distanceM }));
    const best = pickClosest(ok, targetLengthM);
    if (!best) {
      const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      if (first?.reason instanceof LocalApiError) throw first.reason;
      throw new LocalApiError(502, 'DIRECTIONS_FAILED', "No s'ha pogut generar cap ruta des d'aquesta ubicació.");
    }
    return { coordinates: best.coordinates, distanceM: best.distanceM };
  }

  /** Col·locació automàtica: un objecte cada `objectSpacingM` metres sobre la línia. */
  private autoPlace(coords: Position[], roundTrip: boolean): PlacedObject[] {
    const lengthM = lineLengthM(coords);
    const placed = placementSlots(lengthM, this.config.objectSpacingM, roundTrip).map((slot): PlacedObject => {
      const point = interpolateOnLine(coords, slot.fraction, lengthM);
      return {
        lon: point.lon,
        lat: point.lat,
        type: pickType(slot.index, lengthM),
        leg: slot.leg,
        points: pointsFor(slot.distanceFromStartM, this.config),
        distanceFromStartM: slot.distanceFromStartM,
        sortOrder: 0,
        title: null,
        storyText: null,
        storyImageUrl: null,
      };
    });
    return withSortOrder(placed);
  }

  /** Col·locació manual: projecta cada punt sobre la línia i recalcula distància i punts. */
  private manualPlace(coords: Position[], roundTrip: boolean, inputs: CreateRouteObjectInput[]): PlacedObject[] {
    const lengthM = lineLengthM(coords);
    if (inputs.length === 0 || lengthM <= 0) return [];
    const placed = inputs.map((input, i): PlacedObject => {
      const located = locateOnLine(coords, input);
      const leg: Leg = roundTrip && input.leg === 'tornada' ? 'tornada' : 'anada';
      const distanceFromStartM = walkedDistanceM(located.fraction, lengthM, leg);
      return {
        lon: located.point.lon,
        lat: located.point.lat,
        type: input.type ?? pickType(i, lengthM),
        leg,
        points: pointsFor(distanceFromStartM, this.config),
        distanceFromStartM,
        sortOrder: 0,
        title: cleanText(input.title),
        storyText: cleanText(input.storyText),
        storyImageUrl: cleanText(input.storyImageUrl),
      };
    });
    return withSortOrder(placed);
  }

  // -------------------------------------------------------------------------
  // Rutes: creació i consultes
  // -------------------------------------------------------------------------

  createRoute(req: CreateRouteRequest): RouteDetailDto {
    const user = this.requireUser();
    if (typeof req.name !== 'string' || req.name.length > 80) invalid('El nom de la ruta no pot superar 80 caràcters');
    if (typeof req.description !== 'string' || req.description.length > 500) {
      invalid('La descripció no pot superar 500 caràcters');
    }
    const coords = req.geometry?.coordinates;
    if (req.geometry?.type !== 'LineString' || !Array.isArray(coords) || coords.length < 2 || !coords.every(isPosition)) {
      invalid("geometry ha de ser una LineString d'almenys 2 coordenades [lon, lat]");
    }
    if (req.objects !== undefined) {
      if (!Array.isArray(req.objects) || req.objects.length > 200) invalid('Màxim 200 objectes per ruta');
      for (const o of req.objects) {
        if (!isLngLat(o)) invalid("Cada objecte necessita `lon` i `lat` vàlids");
        if (o.type !== undefined && !OBJECT_TYPES.includes(o.type)) invalid("Tipus d'objecte desconegut");
        if (o.leg !== undefined && o.leg !== 'anada' && o.leg !== 'tornada') invalid('`leg` ha de ser `anada` o `tornada`');
        checkContent(o);
      }
    }
    const line = coords.map((p): Position => [p[0], p[1]]);
    const lineM = lineLengthM(line);
    if (lineM <= 0) invalid('La geometria de la ruta no té longitud');

    const roundTrip = req.roundTrip === true;
    const placed = req.objects ? this.manualPlace(line, roundTrip, req.objects) : this.autoPlace(line, roundTrip);
    const routeId = this.newId();
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO routes (id, name, description, geom, start_lon, start_lat, length_m, round_trip, is_public, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          routeId,
          req.name.trim() || 'Ruta sense nom',
          req.description.trim(),
          JSON.stringify(line),
          line[0][0],
          line[0][1],
          roundTrip ? lineM * 2 : lineM,
          roundTrip ? 1 : 0,
          req.isPublic === true ? 1 : 0,
          user.id,
          this.nowIso(),
        ],
      );
      for (const o of placed) {
        this.db.run(
          `INSERT INTO route_objects (id, route_id, lon, lat, type, image_url, points, leg, distance_from_start_m, sort_order,
                                      title, story_text, story_image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.newId(),
            routeId,
            o.lon,
            o.lat,
            o.type,
            objectImageUrl(o.type),
            o.points,
            o.leg,
            o.distanceFromStartM,
            o.sortOrder,
            o.title,
            o.storyText,
            o.storyImageUrl,
          ],
        );
      }
    });
    return this.routeDetail(routeId);
  }

  /** Rutes pròpies i públiques properes al punt indicat, amb l'estat de l'usuari. */
  nearbyRoutes(lat: number, lon: number): RouteSummaryDto[] {
    const user = this.requireUser();
    const from = requirePoint(lat, lon);
    return this.db
      .all<RouteSummaryRow>(ROUTE_SUMMARY_SELECT, [user.id])
      .map((row) => this.toRouteSummary(row, user.id, from))
      .filter((r) => r.isMine || (r.isPublic && (r.distanceToStartM ?? 0) <= this.config.nearbyRadiusM))
      .sort((a, b) => (a.distanceToStartM ?? 0) - (b.distanceToStartM ?? 0) || b.createdAt.localeCompare(a.createdAt));
  }

  routeDetail(routeId: string): RouteDetailDto {
    const user = this.requireUser();
    const row = this.db.get<RouteSummaryRow>(`${ROUTE_SUMMARY_SELECT} WHERE r.id = ?2`, [user.id, routeId]);
    if (!row || !(bool(row.is_public) || row.created_by === user.id || row.user_route_id !== null)) {
      throw new LocalApiError(404, 'NOT_FOUND', 'La ruta no existeix o no hi tens accés');
    }
    const objects = this.db.all<RouteObjectRow>(
      `SELECT ${OBJECT_COLUMNS},
              EXISTS (SELECT 1 FROM user_captures c WHERE c.object_id = o.id AND c.user_id = ?2) AS captured
         FROM route_objects o
        WHERE o.route_id = ?1
        ORDER BY o.sort_order`,
      [routeId, user.id],
    );
    return {
      ...this.toRouteSummary(row, user.id, null),
      geometry: { type: 'LineString', coordinates: JSON.parse(row.geom) as Position[] },
      objects: objects.map((o) => this.toRouteObject(o)),
    };
  }

  /** Permís d'edició d'una ruta: creador, editor o admin. */
  private canEdit(user: UserRow, routeId: string): boolean {
    const route = this.db.get<{ created_by: string }>('SELECT created_by FROM routes WHERE id = ?', [routeId]);
    if (!route) return false;
    return user.role === 'editor' || user.role === 'admin' || route.created_by === user.id;
  }

  /**
   * Comença la ruta. Si l'usuari ja en té una altra en curs → 409; si és
   * aquesta mateixa, la retorna. Una ruta completada es pot tornar a fer, però
   * els objectes ja capturats no tornen a sortir.
   */
  startRoute(routeId: string): ActiveRouteResponse {
    const user = this.requireUser();
    this.routeDetail(routeId); // comprova que existeix i que hi té accés
    const userRoute = this.db.transaction(() => {
      const active = this.db.get<UserRouteRow>(
        `SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE user_id = ? AND status = 'in_progress'`,
        [user.id],
      );
      if (active) {
        if (active.route_id === routeId) return active;
        throw new LocalApiError(409, 'CONFLICT', 'Ja tens una ruta en curs. Acaba-la abans de començar-ne una altra.');
      }
      const id = this.newId();
      this.db.run(`INSERT INTO user_routes (id, user_id, route_id, status, started_at) VALUES (?, ?, ?, 'in_progress', ?)`, [
        id,
        user.id,
        routeId,
        this.nowIso(),
      ]);
      return this.db.get<UserRouteRow>(`SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE id = ?`, [id])!;
    });
    return { userRoute: this.toUserRoute(userRoute), route: this.routeDetail(routeId) };
  }

  // -------------------------------------------------------------------------
  // Fitxes
  // -------------------------------------------------------------------------

  private card(objectId: string): ObjectCardDto {
    const row = this.db.get<ObjectCardRow>(`${OBJECT_CARD_SELECT} WHERE o.id = ?`, [objectId]);
    if (!row) throw new LocalApiError(404, 'NOT_FOUND', "L'objecte no existeix");
    return this.toObjectCard(row);
  }

  /** Tots els objectes d'una ruta amb el contingut, per editar-los. */
  routeContent(routeId: string): RouteObjectContentDto[] {
    const user = this.requireUser();
    if (!this.canEdit(user, routeId)) {
      throw new LocalApiError(403, 'FORBIDDEN', 'Només el creador de la ruta, un editor o un admin pot veure el contingut');
    }
    return this.db
      .all<RouteObjectRow>(`SELECT ${OBJECT_COLUMNS} FROM route_objects o WHERE o.route_id = ? ORDER BY o.sort_order`, [routeId])
      .map((o) => this.toRouteObjectContent(o));
  }

  /** Actualitza la fitxa d'un objecte. Els camps omesos no canvien; `null` els esborra. */
  updateContent(objectId: string, patch: ObjectContentInput): RouteObjectContentDto {
    const user = this.requireUser();
    checkContent(patch);
    const current = this.db.get<RouteObjectRow>(`SELECT ${OBJECT_COLUMNS} FROM route_objects o WHERE o.id = ?`, [objectId]);
    if (!current) throw new LocalApiError(404, 'NOT_FOUND', "L'objecte no existeix");
    if (!this.canEdit(user, current.route_id)) {
      throw new LocalApiError(403, 'FORBIDDEN', 'Només el creador de la ruta, un editor o un admin pot editar el contingut');
    }
    this.db.run('UPDATE route_objects SET title = ?, story_text = ?, story_image_url = ? WHERE id = ?', [
      patch.title !== undefined ? cleanText(patch.title) : current.title,
      patch.storyText !== undefined ? cleanText(patch.storyText) : current.story_text,
      patch.storyImageUrl !== undefined ? cleanText(patch.storyImageUrl) : current.story_image_url,
      objectId,
    ]);
    const updated = this.db.get<RouteObjectRow>(`SELECT ${OBJECT_COLUMNS} FROM route_objects o WHERE o.id = ?`, [objectId])!;
    return this.toRouteObjectContent(updated);
  }

  // -------------------------------------------------------------------------
  // Seguiment d'una ruta
  // -------------------------------------------------------------------------

  /** Ruta en curs de l'usuari, o `null`. */
  activeRoute(): ActiveRouteResponse | null {
    const user = this.requireUser();
    const row = this.db.get<UserRouteRow>(
      `SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE user_id = ? AND status = 'in_progress'`,
      [user.id],
    );
    if (!row) return null;
    return { userRoute: this.toUserRoute(row), route: this.routeDetail(row.route_id) };
  }

  private requireInProgress(userId: string, userRouteId: string): UserRouteRow {
    const row = this.db.get<UserRouteRow>(`SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE id = ? AND user_id = ?`, [
      userRouteId,
      userId,
    ]);
    if (!row) throw new LocalApiError(404, 'NOT_FOUND', 'Aquesta ruta no és teva o no existeix');
    if (row.status !== 'in_progress') throw new LocalApiError(409, 'CONFLICT', 'Aquesta ruta ja està tancada');
    return row;
  }

  /** Afegeix punts al track i recalcula cobertura i gir. */
  appendTrack(userRouteId: string, req: AppendTrackRequest): AppendTrackResponse {
    const user = this.requireUser();
    if (!Array.isArray(req?.points) || req.points.length < 1 || req.points.length > 2000) {
      invalid('`points` ha de tenir entre 1 i 2000 punts');
    }
    for (const p of req.points) {
      if (!isLngLat(p) || !isNumberIn(p.accuracy, 0, Infinity) || !isNumberIn(p.timestamp, 0, Infinity)) {
        invalid('Punt de track no vàlid');
      }
    }
    const kept = prepareTrackPoints(req.points, this.config.maxCaptureAccuracyM * 2);
    return this.db.transaction(() => {
      const current = this.requireInProgress(user.id, userRouteId);
      if (kept.length === 0) return { reachedTurnaround: bool(current.reached_turnaround), coverage: current.coverage };

      const route = this.db.get<{ geom: string; round_trip: number }>('SELECT geom, round_trip FROM routes WHERE id = ?', [
        current.route_id,
      ])!;
      const line = JSON.parse(route.geom) as Position[];
      const previous = current.track ? (JSON.parse(current.track) as Position[]) : [];
      const added = kept.map((p): Position => [p.lon, p.lat]);
      // Només cal comprovar el tram nou (enllaçat amb l'últim punt anterior): la cobertura mai disminueix.
      const fresh = previous.length > 0 ? [previous[previous.length - 1], ...added] : added;

      const samples = sampleLine(line, this.config.coverageSampleM);
      const covered = samples.map((_, i) => current.covered?.[i] === '1');
      markCovered(samples, covered, fresh, this.config.coverageBufferM);
      const coverage = Math.min(1, Math.max(0, coverageFraction(covered)));
      const reachedTurnaround =
        bool(current.reached_turnaround) ||
        (bool(route.round_trip) && distanceToLineM(toLngLat(line[line.length - 1]), fresh) <= this.config.turnaroundRadiusM);

      this.db.run(
        `UPDATE user_routes SET track = ?, covered = ?, coverage = ?, reached_turnaround = ?, last_track_at = ? WHERE id = ?`,
        [
          JSON.stringify([...previous, ...added]),
          covered.map((c) => (c ? '1' : '0')).join(''),
          coverage,
          reachedTurnaround ? 1 : 0,
          this.nowIso(),
          userRouteId,
        ],
      );
      return { reachedTurnaround, coverage };
    });
  }

  /** Objectes de la ruta que aquest usuari encara no ha capturat (tots dos trams). */
  pendingObjects(userRouteId: string): PendingObjectsResponse {
    const user = this.requireUser();
    const current = this.requireInProgress(user.id, userRouteId);
    const rows = this.db.all<RouteObjectRow>(
      `SELECT ${OBJECT_COLUMNS}
         FROM route_objects o
        WHERE o.route_id = ?1
          AND NOT EXISTS (SELECT 1 FROM user_captures c WHERE c.object_id = o.id AND c.user_id = ?2)
        ORDER BY o.sort_order`,
      [current.route_id, user.id],
    );
    return { reachedTurnaround: bool(current.reached_turnaround), objects: rows.map((o) => this.toRouteObject(o)) };
  }

  /**
   * Tanca la ruta. Si s'ha cobert prou (i, en anada i tornada, s'ha arribat al
   * gir), queda `completed` amb bonus. Si no, la fila `in_progress` s'elimina
   * (abandonar): les captures fetes es conserven i sumen igualment.
   */
  finishRoute(userRouteId: string): FinishRouteResponse {
    const user = this.requireUser();
    return this.db.transaction(() => {
      const current = this.requireInProgress(user.id, userRouteId);
      const route = this.db.get<{ round_trip: number; length_m: number }>('SELECT round_trip, length_m FROM routes WHERE id = ?', [
        current.route_id,
      ])!;
      const reachedTurnaround = bool(current.reached_turnaround);
      const completed = isRouteCompleted(current.coverage, reachedTurnaround, bool(route.round_trip), this.config.completionCoverage);

      if (!completed) {
        this.db.run('DELETE FROM user_routes WHERE id = ?', [userRouteId]);
        return {
          userRoute: this.toUserRoute(current),
          completed: false,
          coverage: current.coverage,
          bonusPoints: 0,
          totalPoints: user.total_points,
        };
      }

      const bonus = completionBonus(route.length_m, this.config.bonusPointsPerKm);
      this.db.run(`UPDATE user_routes SET status = 'completed', completed_at = ?, bonus_points = ? WHERE id = ?`, [
        this.nowIso(),
        bonus,
        userRouteId,
      ]);
      this.db.run('UPDATE users SET total_points = total_points + ? WHERE id = ?', [bonus, user.id]);
      const updated = this.db.get<UserRouteRow>(`SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE id = ?`, [userRouteId])!;
      return {
        userRoute: this.toUserRoute(updated),
        completed: true,
        coverage: current.coverage,
        bonusPoints: bonus,
        totalPoints: user.total_points + bonus,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Captures
  // -------------------------------------------------------------------------

  /**
   * Captura d'un objecte, amb les mateixes comprovacions que l'API: ruta
   * activa, no capturat, precisió, distància, tram desbloquejat i velocitat
   * coherent des de l'última captura.
   */
  capture(req: CaptureRequest): CaptureResponse {
    const user = this.requireUser();
    const cfg = this.config;
    if (typeof req?.objectId !== 'string' || !isLngLat(req) || !isNumberIn(req.accuracy, 0, Infinity)) {
      invalid('Petició de captura no vàlida');
    }
    return this.db.transaction(() => {
      const object = this.db.get<RouteObjectRow>(`SELECT ${OBJECT_COLUMNS} FROM route_objects o WHERE o.id = ?`, [req.objectId]);
      if (!object) throw new LocalApiError(404, 'NOT_FOUND', "L'objecte no existeix");

      const userRoute = this.db.get<{ id: string; reached_turnaround: number }>(
        `SELECT id, reached_turnaround FROM user_routes WHERE user_id = ? AND route_id = ? AND status = 'in_progress'`,
        [user.id, object.route_id],
      );
      if (!userRoute) throw new LocalApiError(403, 'NO_ACTIVE_ROUTE', 'No tens aquesta ruta en curs');

      const already = this.db.get('SELECT 1 AS found FROM user_captures WHERE user_id = ? AND object_id = ?', [user.id, object.id]);
      if (already) throw new LocalApiError(409, 'ALREADY_CAPTURED', 'Ja has capturat aquest objecte');

      if (req.accuracy > cfg.maxCaptureAccuracyM) {
        throw new LocalApiError(
          422,
          'BAD_ACCURACY',
          `La precisió del GPS (${Math.round(req.accuracy)} m) no és prou bona. Cal ${cfg.maxCaptureAccuracyM} m o menys.`,
        );
      }

      const distanceM = haversineM(req, object);
      if (distanceM > cfg.captureRadiusM) {
        throw new LocalApiError(
          422,
          'TOO_FAR',
          `Ets a ${Math.round(distanceM)} m de l'objecte; cal ser a menys de ${cfg.captureRadiusM} m.`,
        );
      }

      if (object.leg === 'tornada' && !bool(userRoute.reached_turnaround)) {
        throw new LocalApiError(422, 'LEG_LOCKED', "Aquest objecte és del tram de tornada: primer arriba al final de l'anada.");
      }

      const now = this.now();
      const last = this.db.get<{ captured_at: string; accuracy: number; lon: number; lat: number }>(
        'SELECT captured_at, accuracy, lon, lat FROM user_captures WHERE user_id = ? ORDER BY captured_at DESC LIMIT 1',
        [user.id],
      );
      if (last) {
        const elapsedS = (now.getTime() - new Date(last.captured_at).getTime()) / 1000;
        const speed = checkSpeed(haversineM(req, last), elapsedS, cfg.maxWalkingSpeedMps, last.accuracy + req.accuracy);
        if (!speed.ok) {
          throw new LocalApiError(
            422,
            'TOO_FAST',
            `Has anat massa de pressa des de l'última captura (${speed.speedMps.toFixed(1)} m/s). Torna-ho a provar d'aquí a una estona.`,
          );
        }
      }

      const captureId = this.newId();
      const capturedAt = now.toISOString();
      this.db.run('INSERT INTO user_captures (id, user_id, object_id, captured_at, lat, lon, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        captureId,
        user.id,
        object.id,
        capturedAt,
        req.lat,
        req.lon,
        req.accuracy,
      ]);

      const collectionCompleted = object.collection_id ? this.completeCollectionIfDone(user.id, object.collection_id) : null;
      const earned = object.points + (collectionCompleted?.bonusPoints ?? 0);
      this.db.run('UPDATE users SET total_points = total_points + ? WHERE id = ?', [earned, user.id]);

      return {
        captureId,
        capturedAt,
        points: object.points,
        totalPoints: user.total_points + earned,
        card: this.card(object.id),
        collectionCompleted,
      };
    });
  }

  /** Si amb aquesta captura l'usuari té tots els objectes de la col·lecció, la marca completada. */
  private completeCollectionIfDone(userId: string, collectionId: string): CaptureResponse['collectionCompleted'] {
    const c = this.db.get<CollectionRow>(`${COLLECTION_SELECT} WHERE c.id = ?2`, [userId, collectionId]);
    if (!c || c.completed_at !== null || c.object_count === 0 || c.captured_count < c.object_count) return null;
    this.db.run('INSERT INTO user_collections (user_id, collection_id, completed_at, bonus_points) VALUES (?, ?, ?, ?)', [
      userId,
      c.id,
      this.nowIso(),
      c.bonus_points,
    ]);
    return { collectionId: c.id, name: c.name, bonusPoints: c.bonus_points };
  }

  // -------------------------------------------------------------------------
  // Àlbum i col·leccions
  // -------------------------------------------------------------------------

  /** Col·leccions amb zona que conté el punt o a menys de `nearbyRadiusM`. */
  nearbyCollections(lat: number, lon: number): CollectionSummaryDto[] {
    const user = this.requireUser();
    const from = requirePoint(lat, lon);
    return this.db
      .all<CollectionRow>(`${COLLECTION_SELECT} ORDER BY c.name`, [user.id])
      .filter((c) => distanceToPolygonM(from, JSON.parse(c.zone) as Position[][]) <= this.config.nearbyRadiusM)
      .map((c) => this.toCollectionSummary(c));
  }

  /** Detall: les peces no capturades surten com a silueta (sense fitxa ni imatge). */
  collectionDetail(collectionId: string): CollectionDetailDto {
    const user = this.requireUser();
    const row = this.db.get<CollectionRow>(`${COLLECTION_SELECT} WHERE c.id = ?2`, [user.id, collectionId]);
    if (!row) throw new LocalApiError(404, 'NOT_FOUND', 'La col·lecció no existeix');
    const items = this.db.all<ObjectCardRow>(
      `${OBJECT_CARD_SELECT.replace(
        'r.name AS route_name',
        'r.name AS route_name, EXISTS (SELECT 1 FROM user_captures uc WHERE uc.object_id = o.id AND uc.user_id = ?1) AS captured',
      )}
        WHERE o.collection_id = ?2
        ORDER BY r.name, o.sort_order`,
      [user.id, collectionId],
    );
    return {
      ...this.toCollectionSummary(row),
      zone: { type: 'Polygon', coordinates: JSON.parse(row.zone) as Position[][] },
      items: items.map((it): CollectionItemDto => {
        const captured = bool(it.captured);
        return {
          objectId: it.id,
          captured,
          card: captured ? this.toObjectCard(it) : null,
          imageUrl: captured ? this.imageUrl(it) : null,
        };
      }),
    };
  }

  /** Àlbum: totes les troballes de l'usuari (més recent primer) i les col·leccions on té alguna captura. */
  album(): AlbumResponse {
    const user = this.requireUser();
    const rows = this.db.all<ObjectCardRow & { capture_id: string; captured_at: string }>(
      `${OBJECT_CARD_SELECT.replace('r.name AS route_name', 'r.name AS route_name, uc.id AS capture_id, uc.captured_at')}
         JOIN user_captures uc ON uc.object_id = o.id
        WHERE uc.user_id = ?
        ORDER BY uc.captured_at DESC`,
      [user.id],
    );
    const collections = this.db
      .all<CollectionRow>(
        `${COLLECTION_SELECT}
          WHERE EXISTS (SELECT 1 FROM route_objects o JOIN user_captures uc ON uc.object_id = o.id AND uc.user_id = ?1
                         WHERE o.collection_id = c.id)
          ORDER BY (ucl.completed_at IS NOT NULL) DESC, c.name`,
        [user.id],
      )
      .map((c) => this.toCollectionSummary(c));
    return {
      entries: rows.map((r) => ({ captureId: r.capture_id, capturedAt: r.captured_at, card: this.toObjectCard(r) })),
      collections,
    };
  }

  private requireEditor(): UserRow {
    const user = this.requireUser();
    if (user.role !== 'editor' && user.role !== 'admin') {
      throw new LocalApiError(403, 'FORBIDDEN', 'Només els editors i els admins poden gestionar col·leccions');
    }
    return user;
  }

  private requireOwnership(user: UserRow, collectionId: string): void {
    const row = this.db.get<{ created_by: string }>('SELECT created_by FROM collections WHERE id = ?', [collectionId]);
    if (!row) throw new LocalApiError(404, 'NOT_FOUND', 'La col·lecció no existeix');
    if (user.role !== 'admin' && row.created_by !== user.id) {
      throw new LocalApiError(403, 'FORBIDDEN', 'Només el propietari de la col·lecció o un admin pot modificar-la');
    }
  }

  private checkCollection(req: UpsertCollectionRequest): Position[][] {
    if (typeof req.name !== 'string' || req.name.length < 1 || req.name.length > 80) {
      invalid('El nom de la col·lecció ha de tenir entre 1 i 80 caràcters');
    }
    if (typeof req.description !== 'string' || req.description.length > 500) {
      invalid('La descripció no pot superar 500 caràcters');
    }
    if (!Number.isInteger(req.bonusPoints) || req.bonusPoints < 0 || req.bonusPoints > 100000) {
      invalid('El bonus ha de ser un enter entre 0 i 100000');
    }
    const rings = req.zone?.coordinates;
    const wellFormed =
      req.zone?.type === 'Polygon' &&
      Array.isArray(rings) &&
      rings.length >= 1 &&
      rings.length <= 10 &&
      rings.every((ring) => Array.isArray(ring) && ring.length <= 5000 && ring.every(isPosition));
    if (!wellFormed) invalid('La zona ha de ser un polígon GeoJSON vàlid (anell tancat de 4 punts o més)');
    const reason = polygonInvalidReason(rings);
    if (reason) throw new LocalApiError(422, 'VALIDATION', `La zona no és un polígon vàlid (${reason})`);
    return rings.map((ring) => ring.map((p): Position => [p[0], p[1]]));
  }

  createCollection(req: UpsertCollectionRequest): CollectionDetailDto {
    const user = this.requireEditor();
    const rings = this.checkCollection(req);
    const id = this.newId();
    this.db.run(
      `INSERT INTO collections (id, name, description, zone, cover_image_url, bonus_points, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.name.trim(), req.description.trim(), JSON.stringify(rings), req.coverImageUrl ?? null, req.bonusPoints, user.id, this.nowIso()],
    );
    return this.collectionDetail(id);
  }

  updateCollection(collectionId: string, req: UpsertCollectionRequest): CollectionDetailDto {
    const user = this.requireEditor();
    this.requireOwnership(user, collectionId);
    const rings = this.checkCollection(req);
    this.db.run('UPDATE collections SET name = ?, description = ?, zone = ?, cover_image_url = ?, bonus_points = ? WHERE id = ?', [
      req.name.trim(),
      req.description.trim(),
      JSON.stringify(rings),
      req.coverImageUrl ?? null,
      req.bonusPoints,
      collectionId,
    ]);
    return this.collectionDetail(collectionId);
  }

  removeCollection(collectionId: string): void {
    const user = this.requireEditor();
    this.requireOwnership(user, collectionId);
    this.db.run('DELETE FROM collections WHERE id = ?', [collectionId]);
  }

  /** Substitueix el conjunt d'objectes de la col·lecció. Tots han de ser dins de la zona. */
  assignObjects(collectionId: string, req: AssignCollectionObjectsRequest): CollectionDetailDto {
    const user = this.requireEditor();
    this.requireOwnership(user, collectionId);
    if (!Array.isArray(req?.objectIds) || req.objectIds.length > 500 || !req.objectIds.every((id) => typeof id === 'string')) {
      invalid("`objectIds` ha de ser una llista de fins a 500 identificadors");
    }
    const unique = [...new Set(req.objectIds)];
    this.db.transaction(() => {
      const zone = JSON.parse(
        this.db.get<{ zone: string }>('SELECT zone FROM collections WHERE id = ?', [collectionId])!.zone,
      ) as Position[][];
      const missing: string[] = [];
      const outside: string[] = [];
      for (const id of unique) {
        const object = this.db.get<LngLat>('SELECT lon, lat FROM route_objects WHERE id = ?', [id]);
        if (!object) missing.push(id);
        else if (!pointInPolygon(object, zone)) outside.push(id);
      }
      if (missing.length > 0) throw new LocalApiError(422, 'VALIDATION', `Objectes inexistents: ${missing.join(', ')}`);
      if (outside.length > 0) {
        throw new LocalApiError(422, 'VALIDATION', `Aquests objectes són fora de la zona de la col·lecció: ${outside.join(', ')}`);
      }
      this.db.run('UPDATE route_objects SET collection_id = NULL WHERE collection_id = ?', [collectionId]);
      for (const id of unique) this.db.run('UPDATE route_objects SET collection_id = ? WHERE id = ?', [collectionId, id]);
    });
    return this.collectionDetail(collectionId);
  }
}

function requirePoint(lat: number, lon: number): LngLat {
  if (!isNumberIn(lat, -90, 90) || !isNumberIn(lon, -180, 180)) invalid('`lat` i `lon` han de ser coordenades vàlides');
  return { lat, lon };
}

function withSortOrder(objects: PlacedObject[]): PlacedObject[] {
  return sortByWalk(objects).map((o, i) => ({ ...o, sortOrder: i }));
}
