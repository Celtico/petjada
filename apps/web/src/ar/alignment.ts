import { angleDiffDeg } from '../map/geo';

/**
 * Màquina d'estats d'alineació del mode càmera. És pura: no toca el DOM ni
 * els sensors; rep mostres i retorna l'estat.
 *
 *  MOVING   → el mòbil gira ràpid: s'amaguen els objectes i es mostra el símbol.
 *  ALIGNING → quiet però no apunta a l'objecte: el símbol indica cap a on girar.
 *  LOCKED   → error < lockAngle mantingut lockHoldMs: es mostra l'objecte.
 *             Histèresi: només se surt amb error > unlockAngle.
 */
export type AlignmentState = 'MOVING' | 'ALIGNING' | 'LOCKED';

export interface AlignmentOptions {
  /** Velocitat de rotació (graus/s) a partir de la qual es considera MOVING. */
  movingRateDps: number;
  /** Error angular màxim per entrar a LOCKED (graus). */
  lockAngleDeg: number;
  /** Error angular per sortir de LOCKED (graus). Ha de ser > lockAngleDeg. */
  unlockAngleDeg: number;
  /** Temps mantenint l'error sota el llindar per confirmar LOCKED (ms). */
  lockHoldMs: number;
}

export interface AlignmentSample {
  /** Rumb actual del mòbil (graus). */
  heading: number;
  /** Inclinació actual (graus, 0 = horitzó). */
  pitch: number;
  /** Rumb cap a l'objectiu (graus), o `null` si no n'hi ha. */
  targetHeading: number | null;
  /** Inclinació cap a l'objectiu (graus). */
  targetPitch: number;
  rotationRate: number;
  timestamp: number;
}

export interface AlignmentResult {
  state: AlignmentState;
  /** Error signat de rumb (graus): positiu = cal girar a la dreta. */
  headingError: number;
  /** Error signat d'inclinació (graus): positiu = cal apuntar més amunt. */
  pitchError: number;
  /** Error angular combinat (graus). */
  totalError: number;
  hasTarget: boolean;
}

export class AlignmentStateMachine {
  private state: AlignmentState = 'MOVING';
  private alignedSince: number | null = null;

  constructor(private readonly options: AlignmentOptions) {}

  get current(): AlignmentState {
    return this.state;
  }

  reset(): void {
    this.state = 'MOVING';
    this.alignedSince = null;
  }

  update(sample: AlignmentSample): AlignmentResult {
    const hasTarget = sample.targetHeading !== null;
    const headingError = hasTarget ? angleDiffDeg(sample.heading, sample.targetHeading as number) : 0;
    const pitchError = hasTarget ? sample.targetPitch - sample.pitch : 0;
    const totalError = Math.hypot(headingError, pitchError);

    if (sample.rotationRate > this.options.movingRateDps || !hasTarget) {
      this.state = 'MOVING';
      this.alignedSince = null;
      return { state: this.state, headingError, pitchError, totalError, hasTarget };
    }

    if (this.state === 'LOCKED') {
      if (totalError > this.options.unlockAngleDeg) {
        this.state = 'ALIGNING';
        this.alignedSince = null;
      }
      return { state: this.state, headingError, pitchError, totalError, hasTarget };
    }

    // MOVING (quiet) o ALIGNING
    if (totalError <= this.options.lockAngleDeg) {
      if (this.alignedSince === null) this.alignedSince = sample.timestamp;
      if (sample.timestamp - this.alignedSince >= this.options.lockHoldMs) {
        this.state = 'LOCKED';
      } else {
        this.state = 'ALIGNING';
      }
    } else {
      this.alignedSince = null;
      this.state = 'ALIGNING';
    }
    return { state: this.state, headingError, pitchError, totalError, hasTarget };
  }
}
