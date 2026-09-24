/**
 * Contracte compartit entre la PWA (`apps/web`) i l'API (`apps/api`).
 *
 * Tot el que viatja per HTTP està definit aquí. Els identificadors són UUID en
 * format string; les dates són ISO 8601; les coordenades sempre són `lon`, `lat`
 * (SRID 4326) en aquest ordre quan són tuples.
 */

// ---------------------------------------------------------------------------
// Domini
// ---------------------------------------------------------------------------

export type Leg = 'anada' | 'tornada';

export type UserRouteStatus = 'in_progress' | 'completed';

export type UserRole = 'player' | 'editor' | 'admin';

/** Tipus d'objecte. Cada tipus té una imatge WebP a `/objects/<type>.webp`. */
export const OBJECT_TYPES = [
  'gla',
  'fulla',
  'bolet',
  'ploma',
  'pedra',
  'estel',
  'petxina',
  'cristall',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export function objectImageUrl(type: ObjectType): string {
  return `/objects/${type}.webp`;
}

/** Longituds objectiu que ofereix la creació automàtica (metres). */
export const AUTO_ROUTE_LENGTHS_M = [1000, 3000, 5000] as const;
export type AutoRouteLengthM = (typeof AUTO_ROUTE_LENGTHS_M)[number];

/** Longitud màxima del text d'una fitxa. */
export const STORY_TEXT_MAX_LENGTH = 500;
/** Llargada del codi d'entrada per email. */
export const LOGIN_CODE_LENGTH = 6;

export interface LngLat {
  lon: number;
  lat: number;
}

/** Tupla GeoJSON `[lon, lat]`. */
export type Position = [number, number];

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: Position[];
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

// ---------------------------------------------------------------------------
// Usuaris i autenticació
// ---------------------------------------------------------------------------
//
// Model: es juga com a convidat des del primer segon. L'access token és un JWT
// curt que el client guarda NOMÉS en memòria; el refresh token rotatiu viatja en
// una cookie `httpOnly; Secure; SameSite=Lax` amb path `/api/auth`. En obrir
// l'app: `POST /auth/refresh` (cookie) → si 401, `POST /auth/guest`.

export interface UserDto {
  id: string;
  /** `null` per als convidats. Mai es mostra a altres usuaris. */
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  role: UserRole;
  totalPoints: number;
}

export interface AuthResponse {
  /** JWT d'accés (curt). Guardar només en memòria. */
  accessToken: string;
  /** Segons fins que caduca l'access token. */
  expiresIn: number;
  user: UserDto;
}

export interface MagicLinkRequest {
  email: string;
}

export interface MagicLinkResponse {
  /** Sempre `true`; no revela si l'email existia. */
  sent: boolean;
  /** Segons de validesa de l'enllaç i del codi. */
  expiresIn: number;
}

export interface VerifyCodeRequest {
  email: string;
  /** Codi de 6 xifres rebut per email. */
  code: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Contingut lligat al lloc (fitxes) i col·leccions
// ---------------------------------------------------------------------------

/**
 * Fitxa d'un objecte. NOMÉS es retorna després de capturar-lo (resposta de
 * captura i àlbum) o al creador/editor de la ruta. Mai a les llistes d'objectes
 * pendents.
 */
export interface ObjectCardDto {
  objectId: string;
  routeId: string;
  routeName: string;
  type: ObjectType;
  imageUrl: string;
  points: number;
  /** `true` si l'objecte té contingut propi; si no, el client mostra la fitxa genèrica. */
  hasContent: boolean;
  title: string | null;
  storyText: string | null;
  storyImageUrl: string | null;
  /** Distància recorreguda des de l'inici de la ruta fins a l'objecte (fitxa genèrica). */
  distanceFromStartM: number;
  collectionId: string | null;
  collectionName: string | null;
}

export interface ObjectContentInput {
  title?: string | null;
  /** Màxim STORY_TEXT_MAX_LENGTH caràcters. */
  storyText?: string | null;
  storyImageUrl?: string | null;
}

export interface AlbumEntryDto {
  captureId: string;
  capturedAt: string;
  card: ObjectCardDto;
}

export interface CollectionSummaryDto {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  bonusPoints: number;
  createdBy: string;
  objectCount: number;
  capturedCount: number;
  /** `true` si l'usuari ha completat la col·lecció (insígnia). */
  completed: boolean;
  completedAt: string | null;
}

/** Peça d'una col·lecció. Si no s'ha capturat, es mostra com a silueta i no en surt cap contingut. */
export interface CollectionItemDto {
  objectId: string;
  captured: boolean;
  /** Només si `captured`. */
  card: ObjectCardDto | null;
  /** Només si `captured`; si no, el client dibuixa la silueta genèrica. */
  imageUrl: string | null;
}

export interface CollectionDetailDto extends CollectionSummaryDto {
  zone: PolygonGeometry;
  items: CollectionItemDto[];
}

export interface AlbumResponse {
  entries: AlbumEntryDto[];
  collections: CollectionSummaryDto[];
}

/** Editors i admins. */
export interface UpsertCollectionRequest {
  name: string;
  description: string;
  zone: PolygonGeometry;
  coverImageUrl?: string | null;
  bonusPoints: number;
}

export interface AssignCollectionObjectsRequest {
  /** Substitueix el conjunt d'objectes de la col·lecció. Han d'estar dins de la zona. */
  objectIds: string[];
}

// ---------------------------------------------------------------------------
// Rutes i objectes
// ---------------------------------------------------------------------------

export interface RouteObjectDto {
  id: string;
  routeId: string;
  lon: number;
  lat: number;
  type: ObjectType;
  imageUrl: string;
  points: number;
  leg: Leg;
  /** Distància al llarg de la ruta des de l'inici, en metres. */
  distanceFromStartM: number;
  /** `true` si l'objecte té fitxa pròpia (el contingut no es revela fins a capturar-lo). */
  hasContent: boolean;
  collectionId: string | null;
  /** Només present quan la resposta és per a un usuari concret. */
  captured?: boolean;
}

export interface RouteSummaryDto {
  id: string;
  name: string;
  description: string;
  /** Longitud total a caminar (si és anada i tornada, inclou la tornada). */
  lengthM: number;
  roundTrip: boolean;
  isPublic: boolean;
  /** Creada per un `editor` o `admin`. */
  isOfficial: boolean;
  createdBy: string;
  createdAt: string;
  /** `true` si l'usuari que consulta n'és el creador. */
  isMine: boolean;
  /** Estat de l'usuari en aquesta ruta, `null` si no l'ha començat mai. */
  status: UserRouteStatus | null;
  /** Identificador de `user_routes` si hi ha ruta activa o completada. */
  userRouteId: string | null;
  objectCount: number;
  pendingObjectCount: number;
  /** Distància en metres des del punt consultat fins a l'inici de la ruta. */
  distanceToStartM: number | null;
}

export interface RouteDetailDto extends RouteSummaryDto {
  /** Geometria del tram d'anada. Si és anada i tornada, la tornada és el mateix camí invertit. */
  geometry: LineStringGeometry;
  objects: RouteObjectDto[];
}

/** Objecte proposat (encara sense id) en una previsualització. */
export interface PlacedObjectDto {
  lon: number;
  lat: number;
  type: ObjectType;
  leg: Leg;
  points: number;
  distanceFromStartM: number;
}

export interface PreviewAutoRouteRequest {
  mode: 'auto';
  origin: LngLat;
  targetLengthM: AutoRouteLengthM;
  roundTrip: boolean;
}

export interface PreviewManualRouteRequest {
  mode: 'manual';
  /** Mínim 2 punts. La ruta s'ajusta als camins amb Directions (walking). */
  waypoints: LngLat[];
  roundTrip: boolean;
}

export type PreviewRouteRequest = PreviewAutoRouteRequest | PreviewManualRouteRequest;

export interface PreviewRouteResponse {
  geometry: LineStringGeometry;
  /** Longitud total a caminar (amb tornada si escau). */
  lengthM: number;
  roundTrip: boolean;
  objects: PlacedObjectDto[];
  suggestedName: string;
  suggestedDescription: string;
}

/** Objecte que l'usuari ha col·locat (o mogut) manualment. El servidor el projecta sobre la línia. */
export interface CreateRouteObjectInput extends ObjectContentInput {
  lon: number;
  lat: number;
  type?: ObjectType;
  leg?: Leg;
}

export interface CreateRouteRequest {
  name: string;
  description: string;
  isPublic: boolean;
  roundTrip: boolean;
  /** Geometria del tram d'anada, tal com l'ha retornat la previsualització. */
  geometry: LineStringGeometry;
  /**
   * Si s'omet, el servidor col·loca els objectes automàticament. Si es passa,
   * es fan servir aquests (projectats sobre la línia i amb els punts recalculats).
   */
  objects?: CreateRouteObjectInput[];
}

export interface NearbyRoutesQuery {
  lat: number;
  lon: number;
}

/** Contingut d'un objecte tal com el veu el seu creador/editor (per editar-lo). */
export interface RouteObjectContentDto extends RouteObjectDto {
  title: string | null;
  storyText: string | null;
  storyImageUrl: string | null;
}

// ---------------------------------------------------------------------------
// Seguiment d'una ruta (user_routes)
// ---------------------------------------------------------------------------

export interface UserRouteDto {
  id: string;
  routeId: string;
  status: UserRouteStatus;
  startedAt: string;
  completedAt: string | null;
  /** Només té sentit en rutes d'anada i tornada. */
  reachedTurnaround: boolean;
  /** Fracció (0..1) de la ruta coberta pel track dins del buffer configurat. */
  coverage: number;
}

export interface TrackPointDto {
  lon: number;
  lat: number;
  /** Precisió horitzontal en metres. */
  accuracy: number;
  /** Mil·lisegons des de l'època (Date.now()). */
  timestamp: number;
}

export interface AppendTrackRequest {
  points: TrackPointDto[];
}

export interface AppendTrackResponse {
  reachedTurnaround: boolean;
  coverage: number;
}

export interface PendingObjectsResponse {
  reachedTurnaround: boolean;
  /** Objectes de la ruta que aquest usuari encara no ha capturat (tots dos trams). Sense contingut. */
  objects: RouteObjectDto[];
}

export interface FinishRouteResponse {
  userRoute: UserRouteDto;
  /** `true` si s'ha assolit la cobertura mínima i la ruta queda completada. */
  completed: boolean;
  coverage: number;
  bonusPoints: number;
  totalPoints: number;
}

/** Estat complet d'una ruta activa: el que la PWA necessita per reprendre-la. */
export interface ActiveRouteResponse {
  userRoute: UserRouteDto;
  route: RouteDetailDto;
}

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

export interface CaptureRequest {
  objectId: string;
  lon: number;
  lat: number;
  accuracy: number;
  timestamp: number;
}

export interface CaptureResponse {
  captureId: string;
  capturedAt: string;
  points: number;
  totalPoints: number;
  /** Fitxa que s'obre en capturar (pròpia o genèrica). */
  card: ObjectCardDto;
  /** Si aquesta captura ha completat una col·lecció. */
  collectionCompleted: { collectionId: string; name: string; bonusPoints: number } | null;
}

/** Codis d'error de captura que el client sap traduir a un missatge. */
export type CaptureErrorCode =
  | 'NO_ACTIVE_ROUTE'
  | 'ALREADY_CAPTURED'
  | 'TOO_FAR'
  | 'BAD_ACCURACY'
  | 'TOO_FAST'
  | 'LEG_LOCKED'
  | 'NOT_FOUND';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | CaptureErrorCode
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DIRECTIONS_FAILED'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorBody {
  statusCode: number;
  /** Codi estable per al client. */
  code: ApiErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Rutes HTTP (documentació del contracte)
// ---------------------------------------------------------------------------
//
// Totes les rutes van prefixades amb `/api`. Excepte les de `/auth/*` marcades
// amb (públic), totes requereixen `Authorization: Bearer <accessToken>`.
//
//  POST /auth/guest         (públic)                 -> AuthResponse  (crea usuari convidat; set-cookie refresh)
//  POST /auth/refresh       (públic, cookie)         -> AuthResponse  (rota el refresh token)
//  POST /auth/logout        (cookie)                 -> 204           (revoca el refresh token, esborra la cookie)
//  POST /auth/magic-link    MagicLinkRequest         -> MagicLinkResponse
//         Envia email amb enllaç d'un sol ús (15 min) i codi de 6 xifres. Amb Bearer d'un
//         convidat, el convidat es fusionarà amb el compte en verificar.
//  GET  /auth/magic?token=  (públic)                 -> redirecció a la PWA amb sessió (cookie) — obre al navegador
//  POST /auth/verify-code   VerifyCodeRequest        -> AuthResponse  (amb Bearer de convidat: fusiona el progrés)
//         Errors: INVALID_CODE, CODE_EXPIRED, TOO_MANY_ATTEMPTS, RATE_LIMITED.
//
//  GET    /users/me                                  -> UserDto
//  PATCH  /users/me         UpdateProfileRequest     -> UserDto
//  DELETE /users/me                                  -> 204 (esborra el compte i totes les dades)
//
//  GET  /routes?lat&lon           NearbyRoutesQuery  -> RouteSummaryDto[]
//  POST /routes/preview           PreviewRouteRequest-> PreviewRouteResponse
//  POST /routes                   CreateRouteRequest -> RouteDetailDto
//  GET  /routes/:id                                  -> RouteDetailDto
//  POST /routes/:id/start                            -> ActiveRouteResponse
//  GET  /routes/:id/objects/content                  -> RouteObjectContentDto[]  (creador, editor o admin)
//  PATCH /objects/:id/content     ObjectContentInput -> RouteObjectContentDto    (creador de la ruta, editor o admin)
//
//  GET  /user-routes/active                          -> ActiveRouteResponse | 204
//  PUT  /user-routes/:id/track    AppendTrackRequest -> AppendTrackResponse
//  GET  /user-routes/:id/objects                     -> PendingObjectsResponse
//  POST /user-routes/:id/finish                      -> FinishRouteResponse
//
//  POST /captures                 CaptureRequest     -> CaptureResponse
//                                 (error 4xx amb ApiErrorBody i `code` de CaptureErrorCode)
//
//  GET  /album                                       -> AlbumResponse (les meves troballes + progrés de col·leccions)
//  GET  /collections?lat&lon                         -> CollectionSummaryDto[] (zona que conté el punt o a prop)
//  GET  /collections/:id                             -> CollectionDetailDto (peces no trobades com a silueta)
//  POST   /collections            UpsertCollectionRequest        -> CollectionDetailDto (editor/admin)
//  PATCH  /collections/:id        UpsertCollectionRequest        -> CollectionDetailDto (propietari editor, o admin)
//  DELETE /collections/:id                                       -> 204
//  PUT    /collections/:id/objects AssignCollectionObjectsRequest -> CollectionDetailDto
