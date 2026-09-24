import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CaptureRequest, CaptureResponse, Leg } from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { ApiError } from '../common/api-error';
import { ObjectsService } from '../objects/objects.service';
import { checkSpeed } from './speed';

interface ObjectRow {
  id: string;
  route_id: string;
  points: number;
  leg: Leg;
  collection_id: string | null;
  distance_m: number;
}

interface LastCaptureRow {
  captured_at: Date;
  accuracy: number;
  distance_m: number;
}

interface CollectionProgressRow {
  id: string;
  name: string;
  bonus_points: number;
  total: number;
  captured: number;
  already_completed: boolean;
}

/**
 * Captura d'un objecte. Tota la validació és aquí (el client no és fiable):
 * ruta activa, no capturat, precisió, distància (`ST_DWithin`), tram
 * desbloquejat i velocitat coherent des de l'última captura. Retorna la fitxa
 * i, si escau, la col·lecció completada amb aquesta captura.
 */
@Injectable()
export class CapturesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly objects: ObjectsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async capture(userId: string, req: CaptureRequest): Promise<CaptureResponse> {
    const cfg = this.config;
    return this.db.transaction(async (client) => {
      const { rows: objects } = await client.query<ObjectRow>(
        `SELECT o.id, o.route_id, o.points, o.leg, o.collection_id,
                ST_Distance(o.geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS distance_m
           FROM route_objects o WHERE o.id = $1`,
        [req.objectId, req.lon, req.lat],
      );
      const object = objects[0];
      if (!object) throw new ApiError(404, 'NOT_FOUND', "L'objecte no existeix");

      const { rows: active } = await client.query<{ id: string; reached_turnaround: boolean }>(
        `SELECT id, reached_turnaround FROM user_routes
          WHERE user_id = $1 AND route_id = $2 AND status = 'in_progress' FOR UPDATE`,
        [userId, object.route_id],
      );
      const userRoute = active[0];
      if (!userRoute) throw new ApiError(403, 'NO_ACTIVE_ROUTE', 'No tens aquesta ruta en curs');

      const { rowCount: already } = await client.query(
        'SELECT 1 FROM user_captures WHERE user_id = $1 AND object_id = $2',
        [userId, object.id],
      );
      if (already) throw new ApiError(409, 'ALREADY_CAPTURED', 'Ja has capturat aquest objecte');

      if (req.accuracy > cfg.maxCaptureAccuracyM) {
        throw new ApiError(
          422,
          'BAD_ACCURACY',
          `La precisió del GPS (${Math.round(req.accuracy)} m) no és prou bona. Cal ${cfg.maxCaptureAccuracyM} m o menys.`,
        );
      }

      const { rowCount: within } = await client.query(
        `SELECT 1 FROM route_objects o
          WHERE o.id = $1
            AND ST_DWithin(o.geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)`,
        [object.id, req.lon, req.lat, cfg.captureRadiusM],
      );
      if (!within) {
        throw new ApiError(
          422,
          'TOO_FAR',
          `Ets a ${Math.round(object.distance_m)} m de l'objecte; cal ser a menys de ${cfg.captureRadiusM} m.`,
        );
      }

      if (object.leg === 'tornada' && !userRoute.reached_turnaround) {
        throw new ApiError(422, 'LEG_LOCKED', "Aquest objecte és del tram de tornada: primer arriba al final de l'anada.");
      }

      const { rows: last } = await client.query<LastCaptureRow>(
        `SELECT captured_at, accuracy,
                ST_Distance(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
                            ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS distance_m
           FROM user_captures WHERE user_id = $1
          ORDER BY captured_at DESC LIMIT 1`,
        [userId, req.lon, req.lat],
      );
      if (last[0]) {
        const elapsedS = (Date.now() - last[0].captured_at.getTime()) / 1000;
        const speed = checkSpeed(last[0].distance_m, elapsedS, cfg.maxWalkingSpeedMps, last[0].accuracy + req.accuracy);
        if (!speed.ok) {
          throw new ApiError(
            422,
            'TOO_FAST',
            `Has anat massa de pressa des de l'última captura (${speed.speedMps.toFixed(1)} m/s). Torna-ho a provar d'aquí a una estona.`,
          );
        }
      }

      const { rows: inserted } = await client.query<{ id: string; captured_at: Date }>(
        `INSERT INTO user_captures (user_id, object_id, lat, lon, accuracy)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, object_id) DO NOTHING
         RETURNING id, captured_at`,
        [userId, object.id, req.lat, req.lon, req.accuracy],
      );
      if (!inserted[0]) throw new ApiError(409, 'ALREADY_CAPTURED', 'Ja has capturat aquest objecte');

      let earned = object.points;
      const collectionCompleted = object.collection_id
        ? await this.completeCollectionIfDone(client, userId, object.collection_id)
        : null;
      if (collectionCompleted) earned += collectionCompleted.bonusPoints;

      const { rows: users } = await client.query<{ total_points: number }>(
        'UPDATE users SET total_points = total_points + $2 WHERE id = $1 RETURNING total_points',
        [userId, earned],
      );

      const card = await this.objects.card(object.id, client);

      return {
        captureId: inserted[0].id,
        capturedAt: inserted[0].captured_at.toISOString(),
        points: object.points,
        totalPoints: users[0].total_points,
        card,
        collectionCompleted,
      };
    });
  }

  /** Si amb aquesta captura l'usuari té tots els objectes de la col·lecció, la marca completada. */
  private async completeCollectionIfDone(
    client: PoolClient,
    userId: string,
    collectionId: string,
  ): Promise<CaptureResponse['collectionCompleted']> {
    const { rows } = await client.query<CollectionProgressRow>(
      `SELECT c.id, c.name, c.bonus_points,
              (SELECT count(*) FROM route_objects o WHERE o.collection_id = c.id)::int AS total,
              (SELECT count(*) FROM route_objects o
                 JOIN user_captures uc ON uc.object_id = o.id AND uc.user_id = $2
                WHERE o.collection_id = c.id)::int AS captured,
              EXISTS (SELECT 1 FROM user_collections uc WHERE uc.user_id = $2 AND uc.collection_id = c.id) AS already_completed
         FROM collections c WHERE c.id = $1 FOR UPDATE`,
      [collectionId, userId],
    );
    const c = rows[0];
    if (!c || c.already_completed || c.total === 0 || c.captured < c.total) return null;
    await client.query(
      `INSERT INTO user_collections (user_id, collection_id, bonus_points) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, collection_id) DO NOTHING`,
      [userId, c.id, c.bonus_points],
    );
    return { collectionId: c.id, name: c.name, bonusPoints: c.bonus_points };
  }
}
