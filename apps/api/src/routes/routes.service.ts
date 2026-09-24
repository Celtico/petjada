import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  objectImageUrl,
  type ActiveRouteResponse,
  type CreateRouteObjectInput,
  type CreateRouteRequest,
  type Leg,
  type LineStringGeometry,
  type LngLat,
  type ObjectType,
  type PlacedObjectDto,
  type PreviewRouteResponse,
  type RouteDetailDto,
  type RouteSummaryDto,
} from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService, type Queryable } from '../db/database.service';
import { ApiError } from '../common/api-error';
import { DirectionsProvider } from './directions.service';
import { buildCandidate, candidateBearings, pickClosest, straightLineTargetM, suggestedNames } from './auto-route';
import { pickType, placementSlots, pointsFor, sortByWalk, walkedDistanceM } from './placement';
import {
  ROUTE_OBJECT_SELECT,
  ROUTE_SUMMARY_SELECT,
  ROUTE_USER_JOIN,
  toRouteDetail,
  toRouteSummary,
  toUserRoute,
  type RouteDetailRow,
  type RouteObjectRow,
  type RouteSummaryRow,
  type UserRouteRow,
} from './route-mapper';
import type { PreviewRouteDto } from './routes.dto';

interface PlacedObject extends PlacedObjectDto {
  sortOrder: number;
  title: string | null;
  storyText: string | null;
  storyImageUrl: string | null;
}

const NO_CONTENT = { title: null, storyText: null, storyImageUrl: null } as const;

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly directions: DirectionsProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Previsualització
  // -------------------------------------------------------------------------

  async preview(req: PreviewRouteDto): Promise<PreviewRouteResponse> {
    let coordinates: LineStringGeometry['coordinates'];
    let distanceM: number;

    if (req.mode === 'auto') {
      if (!req.origin || !req.targetLengthM) {
        throw new ApiError(400, 'VALIDATION', 'La creació automàtica necessita `origin` i `targetLengthM`');
      }
      const result = await this.generateAuto(req.origin, req.targetLengthM, req.roundTrip);
      coordinates = result.coordinates;
      distanceM = result.distanceM;
    } else {
      if (!req.waypoints || req.waypoints.length < 2) {
        throw new ApiError(400, 'VALIDATION', 'La creació manual necessita almenys dos `waypoints`');
      }
      if (req.waypoints.length > this.config.maxWaypoints) {
        throw new ApiError(400, 'VALIDATION', `Màxim ${this.config.maxWaypoints} punts`);
      }
      const result = await this.directions.route(req.waypoints);
      coordinates = result.coordinates;
      distanceM = result.distanceM;
    }

    const geometry: LineStringGeometry = { type: 'LineString', coordinates };
    const objects = await this.autoPlace(this.db.q, geometry, req.roundTrip);
    const lengthM = req.roundTrip ? distanceM * 2 : distanceM;
    const names = suggestedNames(lengthM, req.roundTrip, new Date());
    return {
      geometry,
      lengthM,
      roundTrip: req.roundTrip,
      objects: objects.map(stripSortOrder),
      suggestedName: names.name,
      suggestedDescription: names.description,
    };
  }

  private async generateAuto(
    origin: LngLat,
    targetLengthM: number,
    roundTrip: boolean,
  ): Promise<{ coordinates: LineStringGeometry['coordinates']; distanceM: number }> {
    const straightM = straightLineTargetM(targetLengthM, roundTrip, this.config.walkingDetourFactor);
    const candidates = candidateBearings(this.config.autoRouteCandidates).map((bearing) =>
      buildCandidate(origin, bearing, straightM, roundTrip),
    );
    const settled = await Promise.allSettled(candidates.map((c) => this.directions.route(c.waypoints)));
    const ok = settled
      .filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<DirectionsProvider['route']>>> => s.status === 'fulfilled')
      .map((s) => ({ ...s.value, lengthM: roundTrip ? s.value.distanceM * 2 : s.value.distanceM }));
    const best = pickClosest(ok, targetLengthM);
    if (!best) {
      const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      if (first?.reason instanceof ApiError) throw first.reason;
      throw new ApiError(502, 'DIRECTIONS_FAILED', "No s'ha pogut generar cap ruta des d'aquesta ubicació.");
    }
    return { coordinates: best.coordinates, distanceM: best.distanceM };
  }

  // -------------------------------------------------------------------------
  // Col·locació d'objectes
  // -------------------------------------------------------------------------

  private async lineLengthM(q: Queryable, geometry: LineStringGeometry): Promise<number> {
    const { rows } = await q.query<{ length_m: number }>(
      'SELECT ST_Length(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) AS length_m',
      [JSON.stringify(geometry)],
    );
    return rows[0]?.length_m ?? 0;
  }

  /** Col·locació automàtica: un objecte cada `objectSpacingM` amb `ST_LineInterpolatePoint`. */
  private async autoPlace(q: Queryable, geometry: LineStringGeometry, roundTrip: boolean): Promise<PlacedObject[]> {
    const lineLengthM = await this.lineLengthM(q, geometry);
    const slots = placementSlots(lineLengthM, this.config.objectSpacingM, roundTrip);
    if (slots.length === 0) return [];
    const { rows } = await q.query<{ ord: number; lon: number; lat: number }>(
      `SELECT f.ord::int AS ord, ST_X(p.geom) AS lon, ST_Y(p.geom) AS lat
         FROM unnest($2::float8[]) WITH ORDINALITY AS f(fraction, ord),
              LATERAL (SELECT ST_LineInterpolatePoint(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), f.fraction) AS geom) p
        ORDER BY f.ord`,
      [JSON.stringify(geometry), slots.map((s) => s.fraction)],
    );
    const placed: PlacedObject[] = slots.map((slot, i) => {
      const row = rows[i];
      const type = pickType(slot.index, lineLengthM);
      return {
        lon: row.lon,
        lat: row.lat,
        type,
        leg: slot.leg,
        points: pointsFor(slot.distanceFromStartM, this.config),
        distanceFromStartM: slot.distanceFromStartM,
        sortOrder: 0,
        ...NO_CONTENT,
      };
    });
    return withSortOrder(placed);
  }

  /** Col·locació manual: projecta cada punt sobre la línia i recalcula distància i punts. */
  private async manualPlace(
    q: Queryable,
    geometry: LineStringGeometry,
    roundTrip: boolean,
    inputs: CreateRouteObjectInput[],
  ): Promise<PlacedObject[]> {
    const lineLengthM = await this.lineLengthM(q, geometry);
    if (inputs.length === 0 || lineLengthM <= 0) return [];
    const { rows } = await q.query<{ ord: number; fraction: number; lon: number; lat: number }>(
      `SELECT f.ord::int AS ord, s.fraction, ST_X(s.geom) AS lon, ST_Y(s.geom) AS lat
         FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS f(lon, lat, ord),
              LATERAL (
                SELECT fr AS fraction, ST_LineInterpolatePoint(line, fr) AS geom
                  FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS line) l,
                       LATERAL (SELECT ST_LineLocatePoint(l.line, ST_SetSRID(ST_MakePoint(f.lon, f.lat), 4326)) AS fr) x
              ) s
        ORDER BY f.ord`,
      [JSON.stringify(geometry), inputs.map((o) => o.lon), inputs.map((o) => o.lat)],
    );
    const placed: PlacedObject[] = inputs.map((input, i) => {
      const row = rows[i];
      const leg: Leg = roundTrip && input.leg === 'tornada' ? 'tornada' : 'anada';
      const distanceFromStartM = walkedDistanceM(row.fraction, lineLengthM, leg);
      const type: ObjectType = input.type ?? pickType(i, lineLengthM);
      return {
        lon: row.lon,
        lat: row.lat,
        type,
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
  // Creació
  // -------------------------------------------------------------------------

  async create(userId: string, req: CreateRouteRequest): Promise<RouteDetailDto> {
    const geometry: LineStringGeometry = { type: 'LineString', coordinates: req.geometry.coordinates };
    const routeId = await this.db.transaction(async (client) => {
      const lineLengthM = await this.lineLengthM(client, geometry);
      if (lineLengthM <= 0) {
        throw new ApiError(400, 'VALIDATION', 'La geometria de la ruta no té longitud');
      }
      const lengthM = req.roundTrip ? lineLengthM * 2 : lineLengthM;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO routes (name, description, geom, length_m, round_trip, is_public, created_by)
         VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, $6, $7)
         RETURNING id`,
        [req.name.trim() || 'Ruta sense nom', req.description.trim(), JSON.stringify(geometry), lengthM, req.roundTrip, req.isPublic, userId],
      );
      const id = rows[0].id;
      const placed = req.objects
        ? await this.manualPlace(client, geometry, req.roundTrip, req.objects)
        : await this.autoPlace(client, geometry, req.roundTrip);
      await this.insertObjects(client, id, placed);
      return id;
    });
    return this.detail(userId, routeId, null);
  }

  private async insertObjects(client: PoolClient, routeId: string, objects: PlacedObject[]): Promise<void> {
    if (objects.length === 0) return;
    await client.query(
      `INSERT INTO route_objects (route_id, geom, type, image_url, points, leg, distance_from_start_m, sort_order,
                                  title, story_text, story_image_url)
       SELECT $1, ST_SetSRID(ST_MakePoint(o.lon, o.lat), 4326), o.type, o.image_url, o.points, o.leg, o.dist, o.sort_order,
              o.title, o.story_text, o.story_image_url
         FROM unnest($2::float8[], $3::float8[], $4::text[], $5::text[], $6::int[], $7::text[], $8::float8[], $9::int[],
                     $10::text[], $11::text[], $12::text[])
              AS o(lon, lat, type, image_url, points, leg, dist, sort_order, title, story_text, story_image_url)`,
      [
        routeId,
        objects.map((o) => o.lon),
        objects.map((o) => o.lat),
        objects.map((o) => o.type),
        objects.map((o) => objectImageUrl(o.type)),
        objects.map((o) => o.points),
        objects.map((o) => o.leg),
        objects.map((o) => o.distanceFromStartM),
        objects.map((o) => o.sortOrder),
        objects.map((o) => o.title),
        objects.map((o) => o.storyText),
        objects.map((o) => o.storyImageUrl),
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Consultes
  // -------------------------------------------------------------------------

  async nearby(userId: string, lat: number, lon: number): Promise<RouteSummaryDto[]> {
    const rows = await this.db.query<RouteSummaryRow>(
      `SELECT ${ROUTE_SUMMARY_SELECT}
         FROM routes r
         ${ROUTE_USER_JOIN}
        WHERE r.created_by = $1
           OR (r.is_public AND ST_DWithin(ST_StartPoint(r.geom)::geography,
                                          ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography, $4))
        ORDER BY distance_to_start_m ASC NULLS LAST, r.created_at DESC`,
      [userId, lat, lon, this.config.nearbyRadiusM],
    );
    return rows.map((r) => toRouteSummary(r, userId));
  }

  async detail(userId: string, routeId: string, from: LngLat | null): Promise<RouteDetailDto> {
    const row = await this.db.one<RouteDetailRow>(
      `SELECT ${ROUTE_SUMMARY_SELECT}, ST_AsGeoJSON(r.geom)::json AS geometry
         FROM routes r
         ${ROUTE_USER_JOIN}
        WHERE r.id = $4
          AND (r.is_public OR r.created_by = $1 OR ur.id IS NOT NULL)`,
      [userId, from?.lat ?? null, from?.lon ?? null, routeId],
    );
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'La ruta no existeix o no hi tens accés');
    const objects = await this.db.query<RouteObjectRow>(
      `SELECT ${ROUTE_OBJECT_SELECT},
              EXISTS (SELECT 1 FROM user_captures c WHERE c.object_id = o.id AND c.user_id = $2) AS captured
         FROM route_objects o
        WHERE o.route_id = $1
        ORDER BY o.sort_order`,
      [routeId, userId],
    );
    return toRouteDetail(row, objects, userId);
  }

  /** Permís d'edició d'una ruta: creador, editor o admin. */
  async canEdit(user: { id: string; role: string }, routeId: string): Promise<boolean> {
    if (user.role === 'editor' || user.role === 'admin') {
      const exists = await this.db.one('SELECT 1 FROM routes WHERE id = $1', [routeId]);
      return exists !== null;
    }
    const mine = await this.db.one('SELECT 1 FROM routes WHERE id = $1 AND created_by = $2', [routeId, user.id]);
    return mine !== null;
  }

  // -------------------------------------------------------------------------
  // Inici
  // -------------------------------------------------------------------------

  /**
   * Comença la ruta. Si l'usuari ja té una altra ruta en curs → 409. Si la que
   * té en curs és aquesta mateixa, la retorna. Una ruta completada es pot
   * tornar a fer (nova fila), però els objectes ja capturats no tornen a sortir.
   */
  async start(userId: string, routeId: string): Promise<ActiveRouteResponse> {
    const route = await this.detail(userId, routeId, null);
    const userRoute = await this.db.transaction(async (client) => {
      const { rows: active } = await client.query<UserRouteRow>(
        `SELECT id, route_id, user_id, status, started_at, completed_at, reached_turnaround, coverage
           FROM user_routes WHERE user_id = $1 AND status = 'in_progress' FOR UPDATE`,
        [userId],
      );
      if (active[0]) {
        if (active[0].route_id === routeId) return active[0];
        throw new ApiError(409, 'CONFLICT', 'Ja tens una ruta en curs. Acaba-la abans de començar-ne una altra.');
      }
      const { rows } = await client.query<UserRouteRow>(
        `INSERT INTO user_routes (user_id, route_id, status) VALUES ($1, $2, 'in_progress')
         RETURNING id, route_id, user_id, status, started_at, completed_at, reached_turnaround, coverage`,
        [userId, routeId],
      );
      return rows[0];
    });
    const refreshed = userRoute.route_id === route.id && route.userRouteId === userRoute.id ? route : await this.detail(userId, routeId, null);
    return { userRoute: toUserRoute(userRoute), route: refreshed };
  }
}

function stripSortOrder(o: PlacedObject): PlacedObjectDto {
  const { lon, lat, type, leg, points, distanceFromStartM } = o;
  return { lon, lat, type, leg, points, distanceFromStartM };
}

function withSortOrder(objects: PlacedObject[]): PlacedObject[] {
  return sortByWalk(objects).map((o, i) => ({ ...o, sortOrder: i }));
}
