import type { Position } from '@petjada/shared';
import { describe, expect, it } from 'vitest';
import { destination, haversineM, lineLengthM } from '../map/geo';
import {
  coverageFraction,
  distanceToLineM,
  distanceToPolygonM,
  interpolateOnLine,
  locateOnLine,
  markCovered,
  pointInPolygon,
  polygonInvalidReason,
  sampleLine,
} from './geo';

const ORIGIN = { lon: 0.6206, lat: 41.6176 };
const EAST_1KM = destination(ORIGIN, 90, 1000);
const LINE: Position[] = [
  [ORIGIN.lon, ORIGIN.lat],
  [EAST_1KM.lon, EAST_1KM.lat],
];

const SQUARE: Position[][] = [
  [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
    [0, 0],
  ],
];

describe('distanceToLineM', () => {
  it('mesura la distància perpendicular a un segment', () => {
    const p = destination(destination(ORIGIN, 90, 500), 0, 30);
    expect(distanceToLineM(p, LINE)).toBeCloseTo(30, 0);
  });

  it('fa servir l’extrem quan la projecció cau fora del segment', () => {
    const p = destination(ORIGIN, 270, 40);
    expect(distanceToLineM(p, LINE)).toBeCloseTo(40, 0);
  });
});

describe('interpolateOnLine i locateOnLine', () => {
  it('interpola a la fracció demanada', () => {
    const p = interpolateOnLine(LINE, 0.25);
    expect(haversineM(ORIGIN, p)).toBeCloseTo(250, 0);
  });

  it('localitza la fracció d’un punt projectat sobre la línia', () => {
    const off = destination(destination(ORIGIN, 90, 400), 0, 25);
    const located = locateOnLine(LINE, off);
    expect(located.fraction).toBeCloseTo(0.4, 2);
    expect(located.distanceM).toBeCloseTo(25, 0);
    expect(distanceToLineM(located.point, LINE)).toBeLessThan(0.5);
  });

  it('són inverses entre elles', () => {
    for (const fraction of [0, 0.1, 0.5, 0.93, 1]) {
      expect(locateOnLine(LINE, interpolateOnLine(LINE, fraction)).fraction).toBeCloseTo(fraction, 3);
    }
  });
});

describe('cobertura', () => {
  it('mostreja la línia a intervals regulars', () => {
    const samples = sampleLine(LINE, 5);
    expect(samples).toHaveLength(Math.round(lineLengthM(LINE) / 5));
    expect(haversineM(ORIGIN, samples[0])).toBeCloseTo(2.5, 0);
  });

  it('cobreix només el tram caminat', () => {
    const samples = sampleLine(LINE, 5);
    const half = destination(ORIGIN, 90, 500);
    const covered = markCovered(samples, samples.map(() => false), [[ORIGIN.lon, ORIGIN.lat], [half.lon, half.lat]], 20);
    expect(coverageFraction(covered)).toBeGreaterThan(0.5);
    expect(coverageFraction(covered)).toBeLessThan(0.54);
  });

  it('un track paral·lel fora del buffer no cobreix res', () => {
    const samples = sampleLine(LINE, 5);
    const a = destination(ORIGIN, 0, 40);
    const b = destination(EAST_1KM, 0, 40);
    const covered = markCovered(samples, samples.map(() => false), [[a.lon, a.lat], [b.lon, b.lat]], 20);
    expect(coverageFraction(covered)).toBe(0);
  });

  it('és acumulativa entre lots', () => {
    const samples = sampleLine(LINE, 5);
    const half = destination(ORIGIN, 90, 500);
    const covered = samples.map(() => false);
    markCovered(samples, covered, [[ORIGIN.lon, ORIGIN.lat], [half.lon, half.lat]], 20);
    markCovered(samples, covered, [[half.lon, half.lat], [EAST_1KM.lon, EAST_1KM.lat]], 20);
    expect(coverageFraction(covered)).toBe(1);
  });
});

describe('polígons', () => {
  it('detecta punts dins i fora', () => {
    expect(pointInPolygon({ lon: 0.005, lat: 0.005 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ lon: 0.02, lat: 0.005 }, SQUARE)).toBe(false);
  });

  it('respecta els forats', () => {
    const hole: Position[] = [
      [0.004, 0.004],
      [0.006, 0.004],
      [0.006, 0.006],
      [0.004, 0.006],
      [0.004, 0.004],
    ];
    expect(pointInPolygon({ lon: 0.005, lat: 0.005 }, [SQUARE[0], hole])).toBe(false);
  });

  it('la distància és 0 a dins i positiva a fora', () => {
    expect(distanceToPolygonM({ lon: 0.005, lat: 0.005 }, SQUARE)).toBe(0);
    const outside = destination({ lon: 0.01, lat: 0.005 }, 90, 200);
    expect(distanceToPolygonM(outside, SQUARE)).toBeCloseTo(200, 0);
  });

  it('valida anells', () => {
    expect(polygonInvalidReason(SQUARE)).toBeNull();
    expect(polygonInvalidReason([SQUARE[0].slice(0, 4)])).toBe('anell no tancat');
    const bowtie: Position[] = [
      [0, 0],
      [0.01, 0.01],
      [0.01, 0],
      [0, 0.01],
      [0, 0],
    ];
    expect(polygonInvalidReason([bowtie])).toBe('autointersecció');
  });
});
