import { describe, expect, it } from 'vitest';
import { checkSpeed } from './speed';

describe('checkSpeed', () => {
  it('accepta velocitats de vianant', () => {
    expect(checkSpeed(300, 200, 4).ok).toBe(true);
  });

  it('rebutja teletransports', () => {
    const r = checkSpeed(2000, 60, 4);
    expect(r.ok).toBe(false);
    expect(r.speedMps).toBeCloseTo(33.3, 1);
  });

  it('descompta la incertesa del GPS', () => {
    expect(checkSpeed(50, 1, 4, 60).ok).toBe(true);
  });

  it('no divideix per zero', () => {
    expect(checkSpeed(3, 0, 4).speedMps).toBe(3);
  });
});
