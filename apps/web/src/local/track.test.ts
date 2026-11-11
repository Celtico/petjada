import { describe, expect, it } from 'vitest';
import { completionBonus, isRouteCompleted, prepareTrackPoints } from './track';

describe('prepareTrackPoints', () => {
  it('descarta punts imprecisos i ordena per temps', () => {
    const r = prepareTrackPoints(
      [
        { lon: 2, lat: 41, accuracy: 10, timestamp: 200 },
        { lon: 2.1, lat: 41, accuracy: 500, timestamp: 150 },
        { lon: 2.2, lat: 41, accuracy: 5, timestamp: 100 },
      ],
      60,
    );
    expect(r.map((p) => p.timestamp)).toEqual([100, 200]);
  });

  it('duplica el punt si només en queda un', () => {
    const r = prepareTrackPoints([{ lon: 2, lat: 41, accuracy: 10, timestamp: 1 }], 60);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual(r[1]);
  });

  it('retorna buit si cap punt és acceptable', () => {
    expect(prepareTrackPoints([{ lon: 2, lat: 41, accuracy: 999, timestamp: 1 }], 60)).toEqual([]);
  });
});

describe('completionBonus', () => {
  it('és proporcional a la longitud', () => {
    expect(completionBonus(3000, 20)).toBe(60);
    expect(completionBonus(1250, 20)).toBe(25);
  });
});

describe('isRouteCompleted', () => {
  it('exigeix cobertura i, si cal, el gir', () => {
    expect(isRouteCompleted(0.95, false, false, 0.9)).toBe(true);
    expect(isRouteCompleted(0.85, true, false, 0.9)).toBe(false);
    expect(isRouteCompleted(0.95, false, true, 0.9)).toBe(false);
    expect(isRouteCompleted(0.95, true, true, 0.9)).toBe(true);
  });
});
