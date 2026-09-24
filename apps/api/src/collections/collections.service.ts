import { Inject, Injectable } from '@nestjs/common';
import type {
  AlbumEntryDto,
  AlbumResponse,
  CollectionDetailDto,
  CollectionItemDto,
  CollectionSummaryDto,
  PolygonGeometry,
  UpsertCollectionRequest,
} from '@petjada/shared';
import { objectImageUrl } from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/auth.guard';
import { OBJECT_CARD_SELECT, toObjectCard, type ObjectCardRow } from '../routes/route-mapper';

interface CollectionSummaryRow {
  id: string;
  name: string;
  description: string;
  cover_image_url: string | null;
  bonus_points: number;
  created_by: string;
  object_count: number;
  captured_count: number;
  completed_at: Date | null;
}

interface CollectionDetailRow extends CollectionSummaryRow {
  zone: PolygonGeometry;
}

interface CollectionItemRow extends ObjectCardRow {
  captured: boolean;
}

interface AlbumRow extends ObjectCardRow {
  capture_id: string;
  captured_at: Date;
}

/**
 * Columnes del resum d'una col·lecció per a un usuari. Paràmetre $1 = user id.
 * Cal `FROM collections c LEFT JOIN user_collections ucl ON ucl.user_id = $1 AND ucl.collection_id = c.id`.
 */
const COLLECTION_SUMMARY_SELECT = `
  c.id, c.name, c.description, c.cover_image_url, c.bonus_points, c.created_by,
  (SELECT count(*) FROM route_objects o WHERE o.collection_id = c.id)::int AS object_count,
  (SELECT count(*) FROM route_objects o
     JOIN user_captures uc ON uc.object_id = o.id AND uc.user_id = $1
    WHERE o.collection_id = c.id)::int AS captured_count,
  ucl.completed_at
`;
const COLLECTION_USER_JOIN = `LEFT JOIN user_collections ucl ON ucl.user_id = $1 AND ucl.collection_id = c.id`;

function toSummary(row: CollectionSummaryRow): CollectionSummaryDto {
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
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura (jugadors)
  // -------------------------------------------------------------------------

  /** Col·leccions amb zona que conté el punt o a menys de `nearbyRadiusM`. */
  async nearby(userId: string, lat: number, lon: number): Promise<CollectionSummaryDto[]> {
    const rows = await this.db.query<CollectionSummaryRow>(
      `SELECT ${COLLECTION_SUMMARY_SELECT}
         FROM collections c ${COLLECTION_USER_JOIN}
        WHERE ST_Intersects(c.zone, ST_SetSRID(ST_MakePoint($3, $2), 4326))
           OR ST_DWithin(c.zone::geography, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)
        ORDER BY c.name`,
      [userId, lat, lon, this.config.nearbyRadiusM],
    );
    return rows.map(toSummary);
  }

  /** Col·leccions per a l'àlbum: amb alguna captura de l'usuari (i, si hi ha punt, també les properes). */
  async forAlbum(userId: string, lat: number | null, lon: number | null): Promise<CollectionSummaryDto[]> {
    const rows = await this.db.query<CollectionSummaryRow>(
      `SELECT ${COLLECTION_SUMMARY_SELECT}
         FROM collections c ${COLLECTION_USER_JOIN}
        WHERE EXISTS (SELECT 1 FROM route_objects o JOIN user_captures uc ON uc.object_id = o.id AND uc.user_id = $1
                       WHERE o.collection_id = c.id)
           OR ($2::float8 IS NOT NULL AND $3::float8 IS NOT NULL AND
               ST_DWithin(c.zone::geography, ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography, $4))
        ORDER BY (ucl.completed_at IS NOT NULL) DESC, c.name`,
      [userId, lat, lon, this.config.nearbyRadiusM],
    );
    return rows.map(toSummary);
  }

  /** Detall: les peces no capturades surten com a silueta (sense fitxa ni imatge). */
  async detail(userId: string, collectionId: string): Promise<CollectionDetailDto> {
    const row = await this.db.one<CollectionDetailRow>(
      `SELECT ${COLLECTION_SUMMARY_SELECT}, ST_AsGeoJSON(c.zone)::json AS zone
         FROM collections c ${COLLECTION_USER_JOIN}
        WHERE c.id = $2`,
      [userId, collectionId],
    );
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'La col·lecció no existeix');
    const items = await this.db.query<CollectionItemRow>(
      `SELECT ${OBJECT_CARD_SELECT},
              EXISTS (SELECT 1 FROM user_captures uc WHERE uc.object_id = o.id AND uc.user_id = $1) AS captured
         FROM route_objects o
         JOIN routes r ON r.id = o.route_id
         LEFT JOIN collections col ON col.id = o.collection_id
        WHERE o.collection_id = $2
        ORDER BY r.name, o.sort_order`,
      [userId, collectionId],
    );
    return {
      ...toSummary(row),
      zone: { type: 'Polygon', coordinates: row.zone.coordinates },
      items: items.map(
        (it): CollectionItemDto => ({
          objectId: it.id,
          captured: it.captured,
          card: it.captured ? toObjectCard(it) : null,
          imageUrl: it.captured ? it.image_url || objectImageUrl(it.type) : null,
        }),
      ),
    };
  }

  /** Àlbum: totes les troballes de l'usuari (més recent primer) i el progrés de col·leccions. */
  async album(userId: string, lat: number | null, lon: number | null): Promise<AlbumResponse> {
    const rows = await this.db.query<AlbumRow>(
      `SELECT ${OBJECT_CARD_SELECT}, uc.id AS capture_id, uc.captured_at
         FROM user_captures uc
         JOIN route_objects o ON o.id = uc.object_id
         JOIN routes r ON r.id = o.route_id
         LEFT JOIN collections col ON col.id = o.collection_id
        WHERE uc.user_id = $1
        ORDER BY uc.captured_at DESC`,
      [userId],
    );
    const entries: AlbumEntryDto[] = rows.map((r) => ({
      captureId: r.capture_id,
      capturedAt: r.captured_at.toISOString(),
      card: toObjectCard(r),
    }));
    return { entries, collections: await this.forAlbum(userId, lat, lon) };
  }

  // -------------------------------------------------------------------------
  // Edició (editors i admins)
  // -------------------------------------------------------------------------

  private async requireOwnership(user: AuthUser, collectionId: string): Promise<void> {
    const row = await this.db.one<{ created_by: string }>('SELECT created_by FROM collections WHERE id = $1', [collectionId]);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'La col·lecció no existeix');
    if (user.role !== 'admin' && row.created_by !== user.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Només el propietari de la col·lecció o un admin pot modificar-la');
    }
  }

  async create(user: AuthUser, req: UpsertCollectionRequest): Promise<CollectionDetailDto> {
    await this.assertValidZone(req.zone);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO collections (name, description, zone, cover_image_url, bonus_points, created_by)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, $6)
       RETURNING id`,
      [req.name.trim(), req.description.trim(), JSON.stringify(req.zone), req.coverImageUrl ?? null, req.bonusPoints, user.id],
    );
    return this.detail(user.id, row!.id);
  }

  async update(user: AuthUser, collectionId: string, req: UpsertCollectionRequest): Promise<CollectionDetailDto> {
    await this.requireOwnership(user, collectionId);
    await this.assertValidZone(req.zone);
    await this.db.query(
      `UPDATE collections
          SET name = $2, description = $3, zone = ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
              cover_image_url = $5, bonus_points = $6
        WHERE id = $1`,
      [collectionId, req.name.trim(), req.description.trim(), JSON.stringify(req.zone), req.coverImageUrl ?? null, req.bonusPoints],
    );
    return this.detail(user.id, collectionId);
  }

  async remove(user: AuthUser, collectionId: string): Promise<void> {
    await this.requireOwnership(user, collectionId);
    await this.db.query('DELETE FROM collections WHERE id = $1', [collectionId]);
  }

  /** Substitueix el conjunt d'objectes de la col·lecció. Tots han de ser dins de la zona. */
  async assignObjects(user: AuthUser, collectionId: string, objectIds: string[]): Promise<CollectionDetailDto> {
    await this.requireOwnership(user, collectionId);
    const unique = [...new Set(objectIds)];
    await this.db.transaction(async (client) => {
      if (unique.length > 0) {
        const { rows } = await client.query<{ id: string; inside: boolean }>(
          `SELECT o.id, ST_Within(o.geom, c.zone) AS inside
             FROM route_objects o, collections c
            WHERE c.id = $1 AND o.id = ANY($2::uuid[])`,
          [collectionId, unique],
        );
        const found = new Set(rows.map((r) => r.id));
        const missing = unique.filter((id) => !found.has(id));
        if (missing.length > 0) {
          throw new ApiError(422, 'VALIDATION', `Objectes inexistents: ${missing.join(', ')}`);
        }
        const outside = rows.filter((r) => !r.inside).map((r) => r.id);
        if (outside.length > 0) {
          throw new ApiError(422, 'VALIDATION', `Aquests objectes són fora de la zona de la col·lecció: ${outside.join(', ')}`);
        }
      }
      await client.query('UPDATE route_objects SET collection_id = NULL WHERE collection_id = $1', [collectionId]);
      if (unique.length > 0) {
        await client.query('UPDATE route_objects SET collection_id = $1 WHERE id = ANY($2::uuid[])', [collectionId, unique]);
      }
    });
    return this.detail(user.id, collectionId);
  }

  private async assertValidZone(zone: PolygonGeometry): Promise<void> {
    const row = await this.db.one<{ valid: boolean; reason: string }>(
      `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g) z`,
      [JSON.stringify(zone)],
    );
    if (!row?.valid) {
      throw new ApiError(422, 'VALIDATION', `La zona no és un polígon vàlid (${row?.reason ?? 'desconegut'})`);
    }
  }
}
