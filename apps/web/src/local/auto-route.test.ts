import { describe, expect, it } from 'vitest';
import { buildCandidate, candidateBearings, pickClosest, straightLineTargetM, suggestedNames } from './auto-route';
import { destination as destinationPoint, haversineM } from '../map/geo';

const BCN = { lon: 2.17, lat: 41.39 };

describe('geo', () => {
  it('destinationPoint és coherent amb haversine', () => {
    const p = destinationPoint(BCN, 45, 1000);
    expect(haversineM(BCN, p)).toBeCloseTo(1000, 0);
  });
});

describe('auto-route', () => {
  it('calcula la distància recta a demanar', () => {
    expect(straightLineTargetM(3000, true, 1.3)).toBeCloseTo(3000 / 2 / 1.3);
    expect(straightLineTargetM(3000, false, 1.3)).toBeCloseTo(3000 / 1.3);
  });

  it('genera rumbs equiespaiats', () => {
    const b = candidateBearings(6, () => 0.5);
    expect(b).toHaveLength(6);
    expect(b[0]).toBe(180);
    expect(b[1]).toBe(240);
    expect(b[5]).toBe(120);
  });

  it('els candidats d’anada i tornada només tenen origen i destí', () => {
    const c = buildCandidate(BCN, 90, 1000, true);
    expect(c.waypoints).toHaveLength(2);
    expect(haversineM(BCN, c.waypoints[1])).toBeCloseTo(1000, 0);
  });

  it('els candidats d’anada tenen un punt intermedi desplaçat', () => {
    const c = buildCandidate(BCN, 90, 1000, false);
    expect(c.waypoints).toHaveLength(3);
    expect(haversineM(BCN, c.waypoints[2])).toBeCloseTo(1000, 0);
    const midStraight = destinationPoint(BCN, 90, 500);
    expect(haversineM(midStraight, c.waypoints[1])).toBeCloseTo(250, 0);
  });

  it('tria el candidat més proper a l’objectiu', () => {
    const best = pickClosest([{ lengthM: 2500 }, { lengthM: 3100 }, { lengthM: 4000 }], 3000);
    expect(best?.lengthM).toBe(3100);
    expect(pickClosest([], 3000)).toBeNull();
  });

  it('proposa noms llegibles', () => {
    const d = new Date('2026-09-24T10:00:00Z');
    expect(suggestedNames(3000, true, d).name).toBe('Anada i tornada de 3 km');
    expect(suggestedNames(1240, false, d).name).toBe('Ruta de 1.2 km');
    expect(suggestedNames(800, false, d).name).toBe('Ruta de 800 m');
  });
});
