import type { LngLat, Position } from '@petjada/shared';

export const EARTH_RADIUS_M = 6371008.8;

const DEG = Math.PI / 180;

export function toRad(deg: number): number {
  return deg * DEG;
}

export function toDeg(rad: number): number {
  return rad / DEG;
}

/** Distància haversine en metres. */
export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumb inicial de `a` cap a `b`, en graus [0, 360). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Punt destí a `distanceM` metres de `origin` seguint `bearing` graus. */
export function destination(origin: LngLat, bearing: number, distanceM: number): LngLat {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearing);
  const φ1 = toRad(origin.lat);
  const λ1 = toRad(origin.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function normalizeLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

/** Diferència angular signada `target - current` en (-180, 180]. */
export function angleDiffDeg(current: number, target: number): number {
  let d = (target - current) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function toLngLat(position: Position): LngLat {
  return { lon: position[0], lat: position[1] };
}

export function toPosition(p: LngLat): Position {
  return [p.lon, p.lat];
}

/** Longitud d'una línia en metres. */
export function lineLengthM(coords: Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(toLngLat(coords[i - 1]), toLngLat(coords[i]));
  }
  return total;
}

/**
 * Punt sobre la línia a `distanceM` metres de l'inici (i el rumb del segment).
 * Si la distància supera la longitud, retorna l'últim punt.
 */
export function pointAlongLine(coords: Position[], distanceM: number): { point: LngLat; bearing: number } {
  if (coords.length === 0) return { point: { lon: 0, lat: 0 }, bearing: 0 };
  if (coords.length === 1) return { point: toLngLat(coords[0]), bearing: 0 };
  let remaining = Math.max(0, distanceM);
  for (let i = 1; i < coords.length; i++) {
    const a = toLngLat(coords[i - 1]);
    const b = toLngLat(coords[i]);
    const seg = haversineM(a, b);
    const bearing = bearingDeg(a, b);
    if (remaining <= seg) {
      if (seg === 0) return { point: a, bearing };
      return { point: destination(a, bearing, remaining), bearing };
    }
    remaining -= seg;
  }
  const last = toLngLat(coords[coords.length - 1]);
  const prev = toLngLat(coords[coords.length - 2]);
  return { point: last, bearing: bearingDeg(prev, last) };
}
