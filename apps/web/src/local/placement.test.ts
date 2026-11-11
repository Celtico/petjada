import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES } from '@petjada/shared';
import { pickType, placementSlots, pointsFor, sortByWalk, walkedDistanceM } from './placement';

const cfg = { objectBasePoints: 10, objectPointsPerStep: 2, objectPointsStepM: 100 };

describe('placementSlots', () => {
  it('col·loca un objecte cada N metres, mai al final', () => {
    const slots = placementSlots(1000, 250, false);
    expect(slots.map((s) => Math.round(s.fraction * 1000))).toEqual([125, 375, 625, 875]);
    expect(slots.every((s) => s.leg === 'anada')).toBe(true);
    expect(slots.every((s) => s.fraction < 1)).toBe(true);
  });

  it('alterna trams en rutes d’anada i tornada', () => {
    const slots = placementSlots(1000, 250, true);
    expect(slots.map((s) => s.leg)).toEqual(['anada', 'tornada', 'anada', 'tornada']);
    // La tornada compta la distància caminada real.
    expect(slots[1].distanceFromStartM).toBeCloseTo(1000 + (1000 - 375));
  });

  it('retorna buit amb longituds no vàlides', () => {
    expect(placementSlots(0, 250, false)).toEqual([]);
    expect(placementSlots(100, 0, false)).toEqual([]);
  });

  it('una ruta molt curta pot no tenir objectes', () => {
    expect(placementSlots(100, 250, false)).toEqual([]);
  });
});

describe('pointsFor', () => {
  it('més lluny, més punts', () => {
    expect(pointsFor(0, cfg)).toBe(10);
    expect(pointsFor(99, cfg)).toBe(10);
    expect(pointsFor(100, cfg)).toBe(12);
    expect(pointsFor(1250, cfg)).toBe(34);
  });
});

describe('walkedDistanceM', () => {
  it('calcula la distància d’anada i de tornada', () => {
    expect(walkedDistanceM(0.25, 1000, 'anada')).toBe(250);
    expect(walkedDistanceM(0.25, 1000, 'tornada')).toBe(1750);
  });
});

describe('pickType', () => {
  it('és determinista i retorna tipus vàlids', () => {
    expect(pickType(3, 1234)).toBe(pickType(3, 1234));
    const types = new Set(Array.from({ length: 12 }, (_, i) => pickType(i, 3000)));
    expect(types.size).toBeGreaterThan(2);
    for (const t of types) expect(OBJECT_TYPES).toContain(t);
  });
});

describe('sortByWalk', () => {
  it('ordena per distància caminada', () => {
    const r = sortByWalk([{ distanceFromStartM: 900 }, { distanceFromStartM: 100 }]);
    expect(r.map((x) => x.distanceFromStartM)).toEqual([100, 900]);
  });
});
