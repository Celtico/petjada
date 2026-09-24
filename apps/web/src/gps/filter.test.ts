import { describe, expect, it } from 'vitest';
import { destination } from '../map/geo';
import { PositionFilter } from './filter';

const ORIGIN = { lon: 2.1734, lat: 41.3851 };

function reading(lon: number, lat: number, accuracy: number, timestamp: number) {
  return { lon, lat, accuracy, timestamp };
}

describe('PositionFilter', () => {
  it('descarta lectures amb precisió dolenta', () => {
    const f = new PositionFilter({ maxAccuracyM: 25, maxSpeedMps: 3, windowSize: 5 });
    const r = f.push(reading(ORIGIN.lon, ORIGIN.lat, 60, 0));
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe('accuracy');
    expect(f.current).toBeNull();
  });

  it('accepta la primera lectura bona', () => {
    const f = new PositionFilter({ maxAccuracyM: 25, maxSpeedMps: 3, windowSize: 5 });
    const r = f.push(reading(ORIGIN.lon, ORIGIN.lat, 10, 0));
    expect(r.accepted).toBe(true);
    if (r.accepted) {
      expect(r.position.lon).toBeCloseTo(ORIGIN.lon, 8);
      expect(r.position.samples).toBe(1);
    }
  });

  it('descarta salts impossibles', () => {
    const f = new PositionFilter({ maxAccuracyM: 25, maxSpeedMps: 3, windowSize: 5 });
    f.push(reading(ORIGIN.lon, ORIGIN.lat, 5, 0));
    const far = destination(ORIGIN, 0, 500);
    const r = f.push(reading(far.lon, far.lat, 5, 1000));
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe('jump');
  });

  it('accepta moviment a velocitat de caminar', () => {
    const f = new PositionFilter({ maxAccuracyM: 25, maxSpeedMps: 3, windowSize: 5 });
    f.push(reading(ORIGIN.lon, ORIGIN.lat, 5, 0));
    const next = destination(ORIGIN, 0, 10);
    const r = f.push(reading(next.lon, next.lat, 5, 5000));
    expect(r.accepted).toBe(true);
  });

  it('fa una mitjana ponderada 1/accuracy²', () => {
    const f = new PositionFilter({ maxAccuracyM: 50, maxSpeedMps: 1000, windowSize: 5 });
    f.push(reading(0, 0, 1, 0));
    const r = f.push(reading(0.001, 0, 10, 1000));
    expect(r.accepted).toBe(true);
    if (r.accepted) {
      // pes 1 vs 0.01 → la posició s'acosta molt més a la primera lectura
      const expected = (0 * 1 + 0.001 * 0.01) / 1.01;
      expect(r.position.lon).toBeCloseTo(expected, 9);
      expect(r.position.samples).toBe(2);
    }
  });

  it('limita la finestra', () => {
    const f = new PositionFilter({ maxAccuracyM: 50, maxSpeedMps: 100, windowSize: 2 });
    f.push(reading(0, 0, 5, 0));
    f.push(reading(0, 0, 5, 1000));
    const r = f.push(reading(0, 0, 5, 2000));
    if (r.accepted) expect(r.position.samples).toBe(2);
  });

  it('es reinicia després de molts salts consecutius', () => {
    const f = new PositionFilter({ maxAccuracyM: 25, maxSpeedMps: 3, windowSize: 5, maxConsecutiveJumps: 3 });
    f.push(reading(ORIGIN.lon, ORIGIN.lat, 5, 0));
    const far = destination(ORIGIN, 0, 1000);
    expect(f.push(reading(far.lon, far.lat, 5, 1000)).accepted).toBe(false);
    expect(f.push(reading(far.lon, far.lat, 5, 2000)).accepted).toBe(false);
    const r = f.push(reading(far.lon, far.lat, 5, 3000));
    expect(r.accepted).toBe(true);
    if (r.accepted) expect(r.position.lat).toBeCloseTo(far.lat, 6);
  });
});
