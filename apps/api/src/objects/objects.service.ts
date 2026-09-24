import { Injectable } from '@nestjs/common';
import type { ObjectCardDto, ObjectContentInput, RouteObjectContentDto } from '@petjada/shared';
import { DatabaseService, type Queryable } from '../db/database.service';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/auth.guard';
import { RoutesService } from '../routes/routes.service';
import {
  OBJECT_CARD_SELECT,
  ROUTE_OBJECT_SELECT,
  toObjectCard,
  toRouteObjectContent,
  type ObjectCardRow,
  type RouteObjectContentRow,
} from '../routes/route-mapper';

const CONTENT_SELECT = `${ROUTE_OBJECT_SELECT}, o.title, o.story_text, o.story_image_url`;

/** Fitxes de contingut: lectura per al creador/editor i construcció de la fitxa en capturar. */
@Injectable()
export class ObjectsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly routes: RoutesService,
  ) {}

  /** Fitxa d'un objecte (només s'ha de servir un cop capturat o a qui pot editar-lo). */
  async card(objectId: string, q: Queryable = this.db.q): Promise<ObjectCardDto> {
    const { rows } = await q.query<ObjectCardRow>(
      `SELECT ${OBJECT_CARD_SELECT}
         FROM route_objects o
         JOIN routes r ON r.id = o.route_id
         LEFT JOIN collections col ON col.id = o.collection_id
        WHERE o.id = $1`,
      [objectId],
    );
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', "L'objecte no existeix");
    return toObjectCard(rows[0]);
  }

  /** Tots els objectes d'una ruta amb el contingut, per editar-los. */
  async routeContent(user: AuthUser, routeId: string): Promise<RouteObjectContentDto[]> {
    if (!(await this.routes.canEdit(user, routeId))) {
      throw new ApiError(403, 'FORBIDDEN', 'Només el creador de la ruta, un editor o un admin pot veure el contingut');
    }
    const rows = await this.db.query<RouteObjectContentRow>(
      `SELECT ${CONTENT_SELECT} FROM route_objects o WHERE o.route_id = $1 ORDER BY o.sort_order`,
      [routeId],
    );
    return rows.map(toRouteObjectContent);
  }

  /** Actualitza la fitxa d'un objecte. Els camps omesos no canvien; `null` els esborra. */
  async updateContent(user: AuthUser, objectId: string, patch: ObjectContentInput): Promise<RouteObjectContentDto> {
    const owner = await this.db.one<{ route_id: string }>('SELECT route_id FROM route_objects WHERE id = $1', [objectId]);
    if (!owner) throw new ApiError(404, 'NOT_FOUND', "L'objecte no existeix");
    if (!(await this.routes.canEdit(user, owner.route_id))) {
      throw new ApiError(403, 'FORBIDDEN', 'Només el creador de la ruta, un editor o un admin pot editar el contingut');
    }
    const row = await this.db.one<RouteObjectContentRow>(
      `UPDATE route_objects o
          SET title = CASE WHEN $2::boolean THEN NULLIF(btrim($3), '') ELSE title END,
              story_text = CASE WHEN $4::boolean THEN NULLIF(btrim($5), '') ELSE story_text END,
              story_image_url = CASE WHEN $6::boolean THEN NULLIF(btrim($7), '') ELSE story_image_url END
        WHERE o.id = $1
        RETURNING ${CONTENT_SELECT}`,
      [
        objectId,
        patch.title !== undefined,
        patch.title ?? '',
        patch.storyText !== undefined,
        patch.storyText ?? '',
        patch.storyImageUrl !== undefined,
        patch.storyImageUrl ?? '',
      ],
    );
    if (!row) throw new ApiError(404, 'NOT_FOUND', "L'objecte no existeix");
    return toRouteObjectContent(row);
  }
}
