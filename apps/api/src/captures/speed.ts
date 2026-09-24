/**
 * Comprovació pura de coherència de velocitat entre dues captures.
 * Es descompta la incertesa del GPS (`slackM`, normalment la suma de les
 * precisions) i s'evita dividir per intervals nuls.
 */
export interface SpeedCheck {
  ok: boolean;
  speedMps: number;
}

export function checkSpeed(distanceM: number, elapsedS: number, maxSpeedMps: number, slackM = 0): SpeedCheck {
  const effectiveDistance = Math.max(0, distanceM - slackM);
  const seconds = Math.max(1, elapsedS);
  const speedMps = effectiveDistance / seconds;
  return { ok: speedMps <= maxSpeedMps, speedMps };
}
