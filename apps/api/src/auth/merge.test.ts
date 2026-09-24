import { describe, expect, it } from 'vitest';
import { needsMerge, recomputeTotalPoints, shouldDropGuestInProgress } from './merge';

describe('merge', () => {
  it('recalcula el total a partir dels components', () => {
    expect(recomputeTotalPoints({ capturePoints: 120, routeBonus: 60, collectionBonus: 50 })).toBe(230);
    expect(recomputeTotalPoints({ capturePoints: 0, routeBonus: 0, collectionBonus: 0 })).toBe(0);
  });

  it('només descarta la ruta en curs del convidat si el compte ja en té una', () => {
    expect(shouldDropGuestInProgress({ accountHasInProgress: true, guestHasInProgress: true })).toBe(true);
    expect(shouldDropGuestInProgress({ accountHasInProgress: false, guestHasInProgress: true })).toBe(false);
    expect(shouldDropGuestInProgress({ accountHasInProgress: true, guestHasInProgress: false })).toBe(false);
  });

  it('no fusiona amb un mateix ni sense convidat', () => {
    expect(needsMerge(null, 'a')).toBe(false);
    expect(needsMerge('a', 'a')).toBe(false);
    expect(needsMerge('g', 'a')).toBe(true);
  });
});
