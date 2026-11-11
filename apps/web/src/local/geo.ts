import type { LngLat, Position } from '@petjada/shared';
import { EARTH_RADIUS_M, haversineM, lineLengthM, pointAlongLine, toLngLat, toRad } from '../map/geo';

/**
 * Geometria del backend local: substitueix les funcions de PostGIS
 * (`ST_Distance`, `ST_DWithin`, `ST_LineInterpolatePoint`, `ST_LineLocatePoint`,
 * `ST_Within`, `ST_Buffer` + `ST_Intersection`, `ST_IsValid`) per càlcul en
 * TypeScript. Les distàncies punt-punt són haversine; les distàncies a
 * segments es calculen en un pla local en metres centrat al punt, que a
 * l'escala d'una ruta a peu té un error negligible.
 */

interface XY {
  x: number;
  y: number;
}

/** Projecta `p` a metres en un pla local centrat a `origin`. */
function toLocal(origin: LngLat, p: LngLat): XY {
  return {
    x: toRad(p.lon - origin.lon) * Math.cos(toRad(origin.lat)) * EARTH_RADIUS_M,
    y: toRad(p.lat - origin.lat) * EARTH_RADIUS_M,
  };
}

/** Paràmetre `t` (0..1) del punt del segment `ab` més proper a l'origen del pla local, i la seva distància. */
function closestOnSegment(a: XY, b: XY): { t: number; distanceM: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / len2));
  return { t, distanceM: Math.hypot(a.x + t * dx, a.y + t * dy) };
}

/** Distància en metres d'un punt a un segment. */
export function distanceToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  return closestOnSegment(toLocal(p, a), toLocal(p, b)).distanceM;
}

/** Distància en metres d'un punt a una línia (`Infinity` si la línia és buida). */
export function distanceToLineM(p: LngLat, coords: Position[]): number {
  if (coords.length === 0) return Number.POSITIVE_INFINITY;
  if (coords.length === 1) return haversineM(p, toLngLat(coords[0]));
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < coords.length; i++) {
    const d = distanceToSegmentM(p, toLngLat(coords[i - 1]), toLngLat(coords[i]));
    if (d < best) best = d;
  }
  return best;
}

/** Punt sobre la línia a la fracció (0..1) de la seva longitud. Equival a `ST_LineInterpolatePoint`. */
export function interpolateOnLine(coords: Position[], fraction: number, lengthM = lineLengthM(coords)): LngLat {
  return pointAlongLine(coords, Math.min(1, Math.max(0, fraction)) * lengthM).point;
}

export interface LineLocation {
  /** Fracció (0..1) al llarg de la línia del punt més proper. Equival a `ST_LineLocatePoint`. */
  fraction: number;
  /** Punt de la línia més proper. */
  point: LngLat;
  distanceM: number;
}

/** Projecta un punt sobre la línia. */
export function locateOnLine(coords: Position[], p: LngLat): LineLocation {
  if (coords.length < 2) {
    const only = coords[0] ? toLngLat(coords[0]) : p;
    return { fraction: 0, point: only, distanceM: haversineM(p, only) };
  }
  let best = { distanceM: Number.POSITIVE_INFINITY, alongM: 0, point: toLngLat(coords[0]) };
  let walkedM = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = toLngLat(coords[i - 1]);
    const b = toLngLat(coords[i]);
    const segM = haversineM(a, b);
    const { t, distanceM } = closestOnSegment(toLocal(p, a), toLocal(p, b));
    if (distanceM < best.distanceM) {
      best = {
        distanceM,
        alongM: walkedM + t * segM,
        point: { lon: a.lon + t * (b.lon - a.lon), lat: a.lat + t * (b.lat - a.lat) },
      };
    }
    walkedM += segM;
  }
  return { fraction: walkedM > 0 ? best.alongM / walkedM : 0, point: best.point, distanceM: best.distanceM };
}

/** Punts de mostra de la línia: un al mig de cada tram de `stepM` metres (com a mínim un). */
export function sampleLine(coords: Position[], stepM: number): LngLat[] {
  const total = lineLengthM(coords);
  if (!(total > 0) || !(stepM > 0)) return [];
  const count = Math.max(1, Math.round(total / stepM));
  const samples: LngLat[] = [];
  let segIndex = 1;
  let segStartM = 0;
  let segM = haversineM(toLngLat(coords[0]), toLngLat(coords[1]));
  for (let k = 0; k < count; k++) {
    const targetM = ((k + 0.5) / count) * total;
    while (segIndex < coords.length - 1 && segStartM + segM < targetM) {
      segStartM += segM;
      segIndex++;
      segM = haversineM(toLngLat(coords[segIndex - 1]), toLngLat(coords[segIndex]));
    }
    const a = coords[segIndex - 1];
    const b = coords[segIndex];
    const t = segM > 0 ? Math.min(1, Math.max(0, (targetM - segStartM) / segM)) : 0;
    samples.push({ lon: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]) });
  }
  return samples;
}

/**
 * Marca quines mostres de la ruta queden a `bufferM` metres o menys d'algun
 * segment del track. Equival a `ST_Intersection(ruta, ST_Buffer(track, bufferM))`
 * discretitzat. `covered` s'actualitza al mateix lloc i també es retorna.
 */
export function markCovered(samples: LngLat[], covered: boolean[], track: Position[], bufferM: number): boolean[] {
  if (track.length === 0) return covered;
  const segments = track.length === 1 ? [[track[0], track[0]]] : track.slice(1).map((b, i) => [track[i], b]);
  // Marge en graus per descartar de pressa els segments llunyans.
  const latMargin = (bufferM / EARTH_RADIUS_M) * (180 / Math.PI);
  for (let i = 0; i < samples.length; i++) {
    if (covered[i]) continue;
    const s = samples[i];
    const lonMargin = latMargin / Math.max(0.01, Math.cos(toRad(s.lat)));
    for (const [a, b] of segments) {
      if (Math.min(a[1], b[1]) - latMargin > s.lat || Math.max(a[1], b[1]) + latMargin < s.lat) continue;
      if (Math.min(a[0], b[0]) - lonMargin > s.lon || Math.max(a[0], b[0]) + lonMargin < s.lon) continue;
      if (distanceToSegmentM(s, toLngLat(a), toLngLat(b)) <= bufferM) {
        covered[i] = true;
        break;
      }
    }
  }
  return covered;
}

/** Fracció (0..1) de mostres cobertes. */
export function coverageFraction(covered: boolean[]): number {
  if (covered.length === 0) return 0;
  return covered.filter(Boolean).length / covered.length;
}

function inRing(p: LngLat, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** `true` si el punt és dins del polígon (anell exterior menys forats). Equival a `ST_Within`. */
export function pointInPolygon(p: LngLat, rings: Position[][]): boolean {
  if (rings.length === 0 || !inRing(p, rings[0])) return false;
  return !rings.slice(1).some((hole) => inRing(p, hole));
}

/** Distància en metres d'un punt a un polígon: 0 si és a dins. */
export function distanceToPolygonM(p: LngLat, rings: Position[][]): number {
  if (pointInPolygon(p, rings)) return 0;
  return Math.min(...rings.map((ring) => distanceToLineM(p, ring)));
}

function orientation(a: Position, b: Position, c: Position): number {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

/** `true` si els segments `ab` i `cd` es creuen pròpiament (no només es toquen en un extrem). */
function segmentsCross(a: Position, b: Position, c: Position, d: Position): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return sum / 2;
}

/**
 * Validesa d'un polígon (substitut de `ST_IsValid`): anells tancats de 4 punts
 * o més, amb àrea i sense autointerseccions. Retorna el motiu si no és vàlid.
 */
export function polygonInvalidReason(rings: Position[][]): string | null {
  if (rings.length === 0) return 'sense anells';
  for (const ring of rings) {
    if (ring.length < 4) return 'anell amb menys de 4 punts';
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) return 'anell no tancat';
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // segments adjacents pel tancament
        if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return 'autointersecció';
      }
    }
    if (ringArea(ring) === 0) return 'anell sense àrea';
  }
  return null;
}
