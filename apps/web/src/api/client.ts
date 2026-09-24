import type {
  ActiveRouteResponse,
  AlbumResponse,
  ApiErrorBody,
  AppendTrackRequest,
  AppendTrackResponse,
  AssignCollectionObjectsRequest,
  AuthResponse,
  CaptureRequest,
  CaptureResponse,
  CollectionDetailDto,
  CollectionSummaryDto,
  CreateRouteRequest,
  FinishRouteResponse,
  MagicLinkRequest,
  MagicLinkResponse,
  NearbyRoutesQuery,
  ObjectContentInput,
  PendingObjectsResponse,
  PreviewRouteRequest,
  PreviewRouteResponse,
  RouteDetailDto,
  RouteObjectContentDto,
  RouteSummaryDto,
  UpdateProfileRequest,
  UpsertCollectionRequest,
  UserDto,
  VerifyCodeRequest,
} from '@petjada/shared';
import { config } from '../config';
import { t } from '../i18n/ca';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorBody['code'];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
  }
}

/**
 * L'access token viu NOMÉS en memòria (mai a localStorage). El refresh token
 * viatja en una cookie httpOnly que gestiona el servidor.
 */
let accessToken: string | null = null;

/** Callback que intenta renovar la sessió quan una petició rep 401. */
let onUnauthorized: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

export function setUnauthorizedHandler(handler: (() => Promise<boolean>) | null): void {
  onUnauthorized = handler;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  /** No intentar renovar la sessió si respon 401. */
  noRetry?: boolean;
  /** No enviar l'Authorization (endpoints públics). */
  anonymous?: boolean;
}

async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken && !options.anonymous) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({ statusCode: 0, code: 'INTERNAL', message: t.app.networkError });
  }

  if (response.status === 401 && !options.noRetry && !options.anonymous && onUnauthorized) {
    const recovered = await onUnauthorized();
    if (recovered) return request<T>(method, path, body, { ...options, noRetry: true });
  }

  if (response.status === 204) return null as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) throw new ApiError(normalizeError(response.status, parsed));
  return parsed as T;
}

function normalizeError(status: number, parsed: unknown): ApiErrorBody {
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Partial<ApiErrorBody> & { message?: string | string[] };
    const message = Array.isArray(obj.message) ? obj.message.join('. ') : obj.message;
    return {
      statusCode: obj.statusCode ?? status,
      code: obj.code ?? defaultCode(status),
      message: message ?? t.app.genericError,
    };
  }
  return { statusCode: status, code: defaultCode(status), message: t.app.genericError };
}

function defaultCode(status: number): ApiErrorBody['code'] {
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL';
  }
}

function query(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return `?${search.toString()}`;
}

const enc = encodeURIComponent;

export const api = {
  auth: {
    guest: () => request<AuthResponse>('POST', '/auth/guest', undefined, { anonymous: true, noRetry: true }),
    refresh: () => request<AuthResponse>('POST', '/auth/refresh', undefined, { anonymous: true, noRetry: true }),
    logout: () => request<null>('POST', '/auth/logout', undefined, { noRetry: true }),
    magicLink: (body: MagicLinkRequest) => request<MagicLinkResponse>('POST', '/auth/magic-link', body),
    verifyCode: (body: VerifyCodeRequest) => request<AuthResponse>('POST', '/auth/verify-code', body, { noRetry: true }),
  },
  users: {
    me: () => request<UserDto>('GET', '/users/me'),
    update: (body: UpdateProfileRequest) => request<UserDto>('PATCH', '/users/me', body),
    remove: () => request<null>('DELETE', '/users/me'),
  },
  routes: {
    nearby: (q: NearbyRoutesQuery) => request<RouteSummaryDto[]>('GET', `/routes${query({ lat: q.lat, lon: q.lon })}`),
    preview: (body: PreviewRouteRequest) => request<PreviewRouteResponse>('POST', '/routes/preview', body),
    create: (body: CreateRouteRequest) => request<RouteDetailDto>('POST', '/routes', body),
    get: (id: string) => request<RouteDetailDto>('GET', `/routes/${enc(id)}`),
    start: (id: string) => request<ActiveRouteResponse>('POST', `/routes/${enc(id)}/start`),
    objectsContent: (id: string) => request<RouteObjectContentDto[]>('GET', `/routes/${enc(id)}/objects/content`),
  },
  objects: {
    updateContent: (id: string, body: ObjectContentInput) =>
      request<RouteObjectContentDto>('PATCH', `/objects/${enc(id)}/content`, body),
  },
  userRoutes: {
    active: () => request<ActiveRouteResponse | null>('GET', '/user-routes/active'),
    appendTrack: (id: string, body: AppendTrackRequest) =>
      request<AppendTrackResponse>('PUT', `/user-routes/${enc(id)}/track`, body),
    pendingObjects: (id: string) => request<PendingObjectsResponse>('GET', `/user-routes/${enc(id)}/objects`),
    finish: (id: string) => request<FinishRouteResponse>('POST', `/user-routes/${enc(id)}/finish`),
  },
  captures: {
    capture: (body: CaptureRequest) => request<CaptureResponse>('POST', '/captures', body),
  },
  album: {
    get: () => request<AlbumResponse>('GET', '/album'),
  },
  collections: {
    nearby: (q: NearbyRoutesQuery) =>
      request<CollectionSummaryDto[]>('GET', `/collections${query({ lat: q.lat, lon: q.lon })}`),
    get: (id: string) => request<CollectionDetailDto>('GET', `/collections/${enc(id)}`),
    create: (body: UpsertCollectionRequest) => request<CollectionDetailDto>('POST', '/collections', body),
    update: (id: string, body: UpsertCollectionRequest) =>
      request<CollectionDetailDto>('PATCH', `/collections/${enc(id)}`, body),
    remove: (id: string) => request<null>('DELETE', `/collections/${enc(id)}`),
    assignObjects: (id: string, body: AssignCollectionObjectsRequest) =>
      request<CollectionDetailDto>('PUT', `/collections/${enc(id)}/objects`, body),
  },
};

export type Api = typeof api;
