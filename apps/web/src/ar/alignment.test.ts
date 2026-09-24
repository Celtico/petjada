import { describe, expect, it } from 'vitest';
import { AlignmentStateMachine, type AlignmentSample } from './alignment';

const OPTIONS = { movingRateDps: 30, lockAngleDeg: 8, unlockAngleDeg: 15, lockHoldMs: 400 };

function sample(over: Partial<AlignmentSample>): AlignmentSample {
  return {
    heading: 0,
    pitch: 0,
    targetHeading: 0,
    targetPitch: 0,
    rotationRate: 0,
    timestamp: 0,
    ...over,
  };
}

describe('AlignmentStateMachine', () => {
  it('comença a MOVING i hi torna quan el mòbil gira ràpid', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    expect(m.current).toBe('MOVING');
    const r = m.update(sample({ rotationRate: 50, heading: 0 }));
    expect(r.state).toBe('MOVING');
  });

  it('sense objectiu es queda a MOVING', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    const r = m.update(sample({ targetHeading: null }));
    expect(r.state).toBe('MOVING');
    expect(r.hasTarget).toBe(false);
  });

  it('quiet però desalineat → ALIGNING amb errors signats', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    const r = m.update(sample({ heading: 10, targetHeading: 40, pitch: 5, targetPitch: -5 }));
    expect(r.state).toBe('ALIGNING');
    expect(r.headingError).toBe(30);
    expect(r.pitchError).toBe(-10);
  });

  it('l’error de rumb passa pel camí curt (350 → 10)', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    const r = m.update(sample({ heading: 350, targetHeading: 10 }));
    expect(r.headingError).toBe(20);
  });

  it('cal mantenir l’alineació lockHoldMs per arribar a LOCKED', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    expect(m.update(sample({ heading: 2, timestamp: 0 })).state).toBe('ALIGNING');
    expect(m.update(sample({ heading: 2, timestamp: 200 })).state).toBe('ALIGNING');
    expect(m.update(sample({ heading: 2, timestamp: 400 })).state).toBe('LOCKED');
  });

  it('si es perd l’alineació abans del hold, es reinicia el comptador', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    m.update(sample({ heading: 2, timestamp: 0 }));
    m.update(sample({ heading: 20, timestamp: 200 }));
    expect(m.update(sample({ heading: 2, timestamp: 500 })).state).toBe('ALIGNING');
    expect(m.update(sample({ heading: 2, timestamp: 900 })).state).toBe('LOCKED');
  });

  it('histèresi: a LOCKED es tolera fins a unlockAngle', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    m.update(sample({ heading: 0, timestamp: 0 }));
    m.update(sample({ heading: 0, timestamp: 500 }));
    expect(m.current).toBe('LOCKED');
    expect(m.update(sample({ heading: 12, timestamp: 600 })).state).toBe('LOCKED');
    expect(m.update(sample({ heading: 16, timestamp: 700 })).state).toBe('ALIGNING');
  });

  it('un moviment brusc treu de LOCKED', () => {
    const m = new AlignmentStateMachine(OPTIONS);
    m.update(sample({ timestamp: 0 }));
    m.update(sample({ timestamp: 500 }));
    expect(m.current).toBe('LOCKED');
    expect(m.update(sample({ rotationRate: 90, timestamp: 600 })).state).toBe('MOVING');
  });
});
