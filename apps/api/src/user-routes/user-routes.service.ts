import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  ActiveRouteResponse,
  AppendTrackResponse,
  FinishRouteResponse,
  PendingObjectsResponse,
  TrackPointDto,
} from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService, type Queryable } from '../db/database.service';
import { ApiError } from '../common/api-error';
import { RoutesService } from '../routes/routes.service';
import { ROUTE_OBJECT_SELECT, toRouteObject, toUserRoute, type RouteObjectRow, type UserRouteRow } from '../routes/route-mapper';
import { completionBonus, isRouteCompleted, prepareTrackPoints } from './track';

const USER_ROUTE_COLUMNS = 'id, route_id, user_id, status, started_at, completed_at, reached_turnaround, coverage';

@Injectable()
export class UserRoutesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly routes: RoutesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Ruta en curs de l'usuari, o `null`. */
  async active(userId: string): Promise<ActiveRouteResponse | null> {
    const row = await this.db.one<UserRouteRow>(
      `SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE user_id = $1 AND status = 'in_progress'`,
      [userId],
    );
    if (!row) return null;
    const route = await this.routes.detail(userId, row.route_id, null);
    return { userRoute: toUserRoute(row), route };
  }

  private async requireInProgress(q: Queryable, userId: string, userRouteId: string, lock = false): Promise<UserRouteRow> {
    const { rows } = await q.query<UserRouteRow>(
      `SELECT ${USER_ROUTE_COLUMNS} FROM user_routes WHERE id = $1 AND user_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
      [userRouteId, userId],
    );
    const row = rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Aquesta ruta no és teva o no existeix');
    if (row.status !== 'in_progress') throw new ApiError(409, 'CONFLICT', 'Aquesta ruta ja està tancada');
    return row;
  }

  /** Afegeix punts al track i recalcula cobertura i gir. */
  async appendTrack(userId: string, userRouteId: string, points: TrackPointDto[]): Promise<AppendTrackResponse> {
    const kept = prepareTrackPoints(points, this.config.maxCaptureAccuracyM * 2);
    return this.db.transaction(async (client) => {
      const current = await this.requireInProgress(client, userId, userRouteId, true);
      if (kept.length === 0) {
        return { reachedTurnaround: current.reached_turnaround, coverage: current.coverage };
      }
      await client.query(
        `UPDATE user_routes ur
            SET track = CASE WHEN ur.track IS NULL THEN n.line ELSE ST_MakeLine(ur.track, n.line) END,
                last_track_at = now()
           FROM (
             SELECT ST_MakeLine(ARRAY(
               SELECT ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)
                 FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS p(lon, lat, ord)
                ORDER BY p.ord
             )) AS line
           ) n
          WHERE ur.id = $1`,
        [userRouteId, kept.map((p) => p.lon), kept.map((p) => p.lat)],
      );
      return this.recomputeProgress(client, userRouteId);
    });
  }

  /** Recalcula `reached_turnaround` i `coverage` a partir del track desat. */
  private async recomputeProgress(client: PoolClient, userRouteId: string): Promise<AppendTrackResponse> {
    const { rows } = await client.query<{ reached_turnaround: boolean; coverage: number }>(
      `UPDATE user_routes ur
          SET reached_turnaround = ur.reached_turnaround
              OR (r.round_trip AND ur.track IS NOT NULL
                  AND ST_DWithin(ST_EndPoint(r.geom)::geography, ur.track::geography, $2)),
              coverage = CASE WHEN ur.track IS NULL THEN 0 ELSE LEAST(1, GREATEST(0,
                ST_Length(ST_Intersection(r.geom, ST_Buffer(ur.track::geography, $3)::geometry)::geography)
                / NULLIF(ST_Length(r.geom::geography), 0)
              )) END
         FROM routes r
        WHERE r.id = ur.route_id AND ur.id = $1
        RETURNING ur.reached_turnaround, ur.coverage`,
      [userRouteId, this.config.turnaroundRadiusM, this.config.coverageBufferM],
    );
    const row = rows[0];
    return { reachedTurnaround: row.reached_turnaround, coverage: row.coverage ?? 0 };
  }

  /** Objectes de la ruta que aquest usuari encara no ha capturat (tots dos trams). */
  async pendingObjects(userId: string, userRouteId: string): Promise<PendingObjectsResponse> {
    const current = await this.requireInProgress(this.db.q, userId, userRouteId);
    const rows = await this.db.query<RouteObjectRow>(
      `SELECT ${ROUTE_OBJECT_SELECT}
         FROM route_objects o
        WHERE o.route_id = $1
          AND NOT EXISTS (SELECT 1 FROM user_captures c WHERE c.object_id = o.id AND c.user_id = $2)
        ORDER BY o.sort_order`,
      [current.route_id, userId],
    );
    return { reachedTurnaround: current.reached_turnaround, objects: rows.map(toRouteObject) };
  }

  /**
   * Tanca la ruta. Si s'ha cobert prou (i, en anada i tornada, s'ha arribat al
   * gir), queda `completed` amb bonus. Si no, la fila `in_progress` s'elimina
   * (abandonar): les captures fetes es conserven i sumen igualment.
   */
  async finish(userId: string, userRouteId: string): Promise<FinishRouteResponse> {
    return this.db.transaction(async (client) => {
      const current = await this.requireInProgress(client, userId, userRouteId, true);
      const progress = await this.recomputeProgress(client, userRouteId);
      const { rows: routeRows } = await client.query<{ round_trip: boolean; length_m: number }>(
        'SELECT round_trip, length_m FROM routes WHERE id = $1',
        [current.route_id],
      );
      const route = routeRows[0];
      const completed = isRouteCompleted(
        progress.coverage,
        progress.reachedTurnaround,
        route.round_trip,
        this.config.completionCoverage,
      );

      if (!completed) {
        await client.query('DELETE FROM user_routes WHERE id = $1', [userRouteId]);
        const { rows: u } = await client.query<{ total_points: number }>('SELECT total_points FROM users WHERE id = $1', [userId]);
        return {
          userRoute: toUserRoute({ ...current, coverage: progress.coverage, reached_turnaround: progress.reachedTurnaround }),
          completed: false,
          coverage: progress.coverage,
          bonusPoints: 0,
          totalPoints: u[0]?.total_points ?? 0,
        };
      }

      const bonus = completionBonus(route.length_m, this.config.bonusPointsPerKm);
      const { rows: updated } = await client.query<UserRouteRow>(
        `UPDATE user_routes SET status = 'completed', completed_at = now(), bonus_points = $2 WHERE id = $1
         RETURNING ${USER_ROUTE_COLUMNS}`,
        [userRouteId, bonus],
      );
      const { rows: u } = await client.query<{ total_points: number }>(
        'UPDATE users SET total_points = total_points + $2 WHERE id = $1 RETURNING total_points',
        [userId, bonus],
      );
      return {
        userRoute: toUserRoute(updated[0]),
        completed: true,
        coverage: progress.coverage,
        bonusPoints: bonus,
        totalPoints: u[0].total_points,
      };
    });
  }
}
