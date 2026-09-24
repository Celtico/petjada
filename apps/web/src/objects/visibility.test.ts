import { describe, expect, it } from 'vitest';
import { destination } from '../map/geo';
import { computeObjectViews, nearestPending, nearestVisible, scaleForDistance } from './visibility';

const USER = { lon: 2.1734, lat: 41.3851 };
const OPTIONS = { visibilityRangeM: 180, captureRadiusM: 18, maxAccuracyM: 25 };

function obj(id: string, distanceM: number, leg: 'anada' | 'tornada' = 'anada') {
  const p = destination(USER, 90, distanceM);
  return { id, lon: p.lon, lat: p.lat, leg };
}

describe('visibility', () => {
  it('sense posició res és visible', () => {
    const views = computeObjectViews([obj('a', 10)], null, 5, false, OPTIONS);
    expect(views[0].visible).toBe(false);
    expect(views[0].capturable).toBe(false);
  });

  it('visible dins del rang, invisible més enllà', () => {
    const views = computeObjectViews([obj('near', 100), obj('far', 300)], USER, 5, false, OPTIONS);
    expect(views[0].visible).toBe(true);
    expect(views[1].visible).toBe(false);
  });

  it('capturable només dins del radi i amb bona precisió', () => {
    const [close] = computeObjectViews([obj('c', 10)], USER, 5, false, OPTIONS);
    expect(close.capturable).toBe(true);
    const [badAcc] = computeObjectViews([obj('c', 10)], USER, 40, false, OPTIONS);
    expect(badAcc.capturable).toBe(false);
    const [tooFar] = computeObjectViews([obj('c', 30)], USER, 5, false, OPTIONS);
    expect(tooFar.capturable).toBe(false);
  });

  it('els de tornada només es veuen després del gir', () => {
    const [before] = computeObjectViews([obj('t', 10, 'tornada')], USER, 5, false, OPTIONS);
    expect(before.visible).toBe(false);
    const [after] = computeObjectViews([obj('t', 10, 'tornada')], USER, 5, true, OPTIONS);
    expect(after.visible).toBe(true);
    expect(after.capturable).toBe(true);
  });

  it('bearing cap a l’objecte', () => {
    const [v] = computeObjectViews([obj('e', 50)], USER, 5, false, OPTIONS);
    expect(v.bearing).toBeCloseTo(90, 0);
  });

  it('escala decreix amb la distància', () => {
    expect(scaleForDistance(5, 180)).toBe(1);
    expect(scaleForDistance(180, 180)).toBeCloseTo(0.35, 5);
    expect(scaleForDistance(100, 180)).toBeLessThan(1);
  });

  it('nearestVisible i nearestPending', () => {
    const views = computeObjectViews([obj('a', 150), obj('b', 60), obj('c', 400), obj('t', 5, 'tornada')], USER, 5, false, OPTIONS);
    expect(nearestVisible(views)?.object.id).toBe('b');
    expect(nearestPending(views, false)?.object.id).toBe('b');
    expect(nearestPending(views, true)?.object.id).toBe('t');
  });
});
