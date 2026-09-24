import {
  objectImageUrl,
  type Leg,
  type LineStringGeometry,
  type ObjectCardDto,
  type ObjectType,
  type RouteDetailDto,
  type RouteObjectContentDto,
  type RouteObjectDto,
  type RouteSummaryDto,
  type UserRouteDto,
  type UserRouteStatus,
} from '@petjada/shared';

/** Fila de `routes` enriquida amb l'estat de l'usuari (vegeu `ROUTE_SUMMARY_SELECT`). */
export interface RouteSummaryRow {
  id: string;
  name: string;
  description: string;
  length_m: number;
  round_trip: boolean;
  is_public: boolean;
  is_official: boolean;
  created_by: string;
  created_at: Date;
  user_route_id: string | null;
  status: UserRouteStatus | null;
  object_count: number;
  pending_object_count: number;
  distance_to_start_m: number | null;
}

export interface RouteDetailRow extends RouteSummaryRow {
  geometry: LineStringGeometry;
}

export interface RouteObjectRow {
  id: string;
  route_id: string;
  lon: number;
  lat: number;
  type: ObjectType;
  image_url: string;
  points: number;
  leg: Leg;
  distance_from_start_m: number;
  has_content: boolean;
  collection_id: string | null;
  captured?: boolean;
}

export interface RouteObjectContentRow extends RouteObjectRow {
  title: string | null;
  story_text: string | null;
  story_image_url: string | null;
}

/** Fila per construir la fitxa d'un objecte (vegeu `OBJECT_CARD_SELECT`). */
export interface ObjectCardRow {
  id: string;
  route_id: string;
  route_name: string;
  type: ObjectType;
  image_url: string;
  points: number;
  distance_from_start_m: number;
  title: string | null;
  story_text: string | null;
  story_image_url: string | null;
  collection_id: string | null;
  collection_name: string | null;
}

export interface UserRouteRow {
  id: string;
  route_id: string;
  user_id: string;
  status: UserRouteStatus;
  started_at: Date;
  completed_at: Date | null;
  reached_turnaround: boolean;
  coverage: number;
}

/**
 * Columnes comunes del resum d'una ruta per a un usuari. Paràmetres:
 *  $1 = user id, $2 = lat (o NULL), $3 = lon (o NULL).
 * Cal `FROM routes r JOIN users cu ON cu.id = r.created_by` i el LEFT JOIN
 * LATERAL `ur` (vegeu `ROUTE_USER_JOIN`).
 */
export const ROUTE_SUMMARY_SELECT = `
  r.id, r.name, r.description, r.length_m, r.round_trip, r.is_public, r.created_by, r.created_at,
  (cu.role IN ('editor', 'admin')) AS is_official,
  ur.id AS user_route_id, ur.status,
  (SELECT count(*) FROM route_objects o WHERE o.route_id = r.id)::int AS object_count,
  (SELECT count(*) FROM route_objects o
     WHERE o.route_id = r.id
       AND NOT EXISTS (SELECT 1 FROM user_captures c WHERE c.object_id = o.id AND c.user_id = $1))::int
    AS pending_object_count,
  CASE WHEN $2::float8 IS NULL OR $3::float8 IS NULL THEN NULL
       ELSE ST_Distance(ST_StartPoint(r.geom)::geography, ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography)
  END AS distance_to_start_m
`;

/** Últim `user_routes` de l'usuari per a la ruta, prioritzant la que està en curs. */
export const ROUTE_USER_JOIN = `
  JOIN users cu ON cu.id = r.created_by
  LEFT JOIN LATERAL (
    SELECT id, status FROM user_routes
     WHERE user_id = $1 AND route_id = r.id
     ORDER BY (status = 'in_progress') DESC, started_at DESC
     LIMIT 1
  ) ur ON true
`;

/** Columnes públiques d'un objecte: mai el contingut de la fitxa. */
export const ROUTE_OBJECT_SELECT = `
  o.id, o.route_id, ST_X(o.geom) AS lon, ST_Y(o.geom) AS lat, o.type, o.image_url, o.points, o.leg,
  o.distance_from_start_m,
  (o.title IS NOT NULL OR o.story_text IS NOT NULL OR o.story_image_url IS NOT NULL) AS has_content,
  o.collection_id
`;

/** Columnes de la fitxa. Cal `FROM route_objects o JOIN routes r ON r.id = o.route_id LEFT JOIN collections col ON col.id = o.collection_id`. */
export const OBJECT_CARD_SELECT = `
  o.id, o.route_id, r.name AS route_name, o.type, o.image_url, o.points, o.distance_from_start_m,
  o.title, o.story_text, o.story_image_url, o.collection_id, col.name AS collection_name
`;

export function toRouteSummary(row: RouteSummaryRow, userId: string): RouteSummaryDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lengthM: row.length_m,
    roundTrip: row.round_trip,
    isPublic: row.is_public,
    isOfficial: row.is_official,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    isMine: row.created_by === userId,
    status: row.status,
    userRouteId: row.user_route_id,
    objectCount: row.object_count,
    pendingObjectCount: row.pending_object_count,
    distanceToStartM: row.distance_to_start_m,
  };
}

export function toRouteObject(row: RouteObjectRow): RouteObjectDto {
  const dto: RouteObjectDto = {
    id: row.id,
    routeId: row.route_id,
    lon: row.lon,
    lat: row.lat,
    type: row.type,
    imageUrl: row.image_url || objectImageUrl(row.type),
    points: row.points,
    leg: row.leg,
    distanceFromStartM: row.distance_from_start_m,
    hasContent: row.has_content,
    collectionId: row.collection_id,
  };
  if (row.captured !== undefined) dto.captured = row.captured;
  return dto;
}

export function toRouteObjectContent(row: RouteObjectContentRow): RouteObjectContentDto {
  return {
    ...toRouteObject(row),
    title: row.title,
    storyText: row.story_text,
    storyImageUrl: row.story_image_url,
  };
}

export function toObjectCard(row: ObjectCardRow): ObjectCardDto {
  const hasContent = row.title !== null || row.story_text !== null || row.story_image_url !== null;
  return {
    objectId: row.id,
    routeId: row.route_id,
    routeName: row.route_name,
    type: row.type,
    imageUrl: row.image_url || objectImageUrl(row.type),
    points: row.points,
    hasContent,
    title: row.title,
    storyText: row.story_text,
    storyImageUrl: row.story_image_url,
    distanceFromStartM: row.distance_from_start_m,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
  };
}

export function toRouteDetail(row: RouteDetailRow, objects: RouteObjectRow[], userId: string): RouteDetailDto {
  return {
    ...toRouteSummary(row, userId),
    geometry: { type: 'LineString', coordinates: row.geometry.coordinates },
    objects: objects.map(toRouteObject),
  };
}

export function toUserRoute(row: UserRouteRow): UserRouteDto {
  return {
    id: row.id,
    routeId: row.route_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    reachedTurnaround: row.reached_turnaround,
    coverage: row.coverage,
  };
}
