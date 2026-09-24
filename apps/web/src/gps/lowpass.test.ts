import { describe, expect, it } from 'vitest';
import { CircularLowPassFilter, LowPassFilter } from './lowpass';

describe('LowPassFilter', () => {
  it('convergeix cap al valor', () => {
    const f = new LowPassFilter(0.5);
    expect(f.push(0)).toBe(0);
    expect(f.push(10)).toBe(5);
    expect(f.push(10)).toBe(7.5);
  });
});

describe('CircularLowPassFilter', () => {
  it('passa pel camí curt entre 359 i 1', () => {
    const f = new CircularLowPassFilter(0.5);
    f.push(359);
    const v = f.push(1);
    // 359 + 0.5 * 2 = 360 → 0
    expect(v).toBeCloseTo(0, 6);
    expect(f.push(1)).toBeCloseTo(0.5, 6);
  });

  it('no dona valors fora de [0, 360)', () => {
    const f = new CircularLowPassFilter(0.9);
    f.push(2);
    const v = f.push(358);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(360);
    // 2 + 0.9 * (-4) = -1.6 → 358.4
    expect(v).toBeCloseTo(358.4, 6);
  });
});
