import { describe, expect, it } from 'vitest';
import { angleDiffDeg, bearingDeg, destination, haversineM, lineLengthM, pointAlongLine } from './geo';

const BCN = { lon: 2.1734, lat: 41.3851 };
const GIR = { lon: 2.8214, lat: 41.9794 };

describe('geo', () => {
  it('haversine: Barcelona–Girona ≈ 85 km', () => {
    const d = haversineM(BCN, GIR);
    expect(d).toBeGreaterThan(84000);
    expect(d).toBeLessThan(86000);
  });

  it('haversine: mateix punt = 0', () => {
    expect(haversineM(BCN, BCN)).toBe(0);
  });

  it('bearing: nord = 0, est = 90', () => {
    expect(bearingDeg(BCN, { lon: BCN.lon, lat: BCN.lat + 0.01 })).toBeCloseTo(0, 0);
    expect(bearingDeg(BCN, { lon: BCN.lon + 0.01, lat: BCN.lat })).toBeCloseTo(90, 0);
    expect(bearingDeg(BCN, { lon: BCN.lon, lat: BCN.lat - 0.01 })).toBeCloseTo(180, 0);
    expect(bearingDeg(BCN, { lon: BCN.lon - 0.01, lat: BCN.lat })).toBeCloseTo(270, 0);
  });

  it('destination és consistent amb haversine i bearing', () => {
    const p = destination(BCN, 45, 500);
    expect(haversineM(BCN, p)).toBeCloseTo(500, 0);
    expect(bearingDeg(BCN, p)).toBeCloseTo(45, 0);
  });

  it('angleDiffDeg gestiona el salt 359 a 1', () => {
    expect(angleDiffDeg(359, 1)).toBe(2);
    expect(angleDiffDeg(1, 359)).toBe(-2);
    expect(angleDiffDeg(90, 270)).toBe(180);
    expect(angleDiffDeg(10, 10)).toBe(0);
  });

  it('lineLength i pointAlongLine', () => {
    const b = destination(BCN, 90, 100);
    const c = destination(b, 90, 100);
    const coords: [number, number][] = [
      [BCN.lon, BCN.lat],
      [b.lon, b.lat],
      [c.lon, c.lat],
    ];
    expect(lineLengthM(coords)).toBeCloseTo(200, 0);
    const mid = pointAlongLine(coords, 150);
    expect(haversineM(BCN, mid.point)).toBeCloseTo(150, 0);
    expect(mid.bearing).toBeCloseTo(90, 0);
    const end = pointAlongLine(coords, 999);
    expect(end.point.lon).toBeCloseTo(c.lon, 6);
  });
});
