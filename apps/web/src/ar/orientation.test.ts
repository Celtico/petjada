import { describe, expect, it } from 'vitest';
import { headingFromEuler, pitchFromBeta } from './orientation';

describe('orientation', () => {
  it('pitchFromBeta: mòbil dret = horitzó', () => {
    expect(pitchFromBeta(90)).toBe(0);
    expect(pitchFromBeta(120)).toBe(30);
    expect(pitchFromBeta(60)).toBe(-30);
  });

  it('headingFromEuler: mòbil dret (beta 90) mirant al nord → 0', () => {
    expect(headingFromEuler(0, 90, 0, 0)).toBeCloseTo(0, 5);
  });

  it('headingFromEuler: girar el mòbil cap a l’est', () => {
    // alpha creix en sentit antihorari; per mirar a l'est (90) cal alpha = 270
    expect(headingFromEuler(270, 90, 0, 0)).toBeCloseTo(90, 5);
    expect(headingFromEuler(90, 90, 0, 0)).toBeCloseTo(270, 5);
  });
});
