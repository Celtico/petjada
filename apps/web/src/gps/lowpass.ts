import { angleDiffDeg, normalizeDeg } from '../map/geo';

/** Filtre passa-baix exponencial per a valors lineals. */
export class LowPassFilter {
  private value: number | null = null;

  constructor(private readonly alpha: number) {}

  push(sample: number): number {
    if (this.value === null) this.value = sample;
    else this.value += this.alpha * (sample - this.value);
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Filtre passa-baix per a angles en graus, que gestiona el salt 359→0. */
export class CircularLowPassFilter {
  private value: number | null = null;

  constructor(private readonly alpha: number) {}

  push(sampleDeg: number): number {
    const sample = normalizeDeg(sampleDeg);
    if (this.value === null) {
      this.value = sample;
    } else {
      const diff = angleDiffDeg(this.value, sample);
      this.value = normalizeDeg(this.value + this.alpha * diff);
    }
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}
