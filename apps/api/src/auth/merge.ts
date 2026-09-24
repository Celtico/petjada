/**
 * Lògica pura de la fusió convidat → compte.
 */

export interface PointsComponents {
  /** Suma de punts dels objectes capturats. */
  capturePoints: number;
  /** Suma de bonus de rutes completades. */
  routeBonus: number;
  /** Suma de bonus de col·leccions completades. */
  collectionBonus: number;
}

/** `total_points` es recalcula sempre a partir dels components, mai sumant totals. */
export function recomputeTotalPoints(c: PointsComponents): number {
  return Math.max(0, Math.round(c.capturePoints + c.routeBonus + c.collectionBonus));
}

export interface InProgressState {
  accountHasInProgress: boolean;
  guestHasInProgress: boolean;
}

/**
 * Si tots dos tenen una ruta en curs, es conserva la del compte i s'elimina la
 * del convidat (només pot haver-n'hi una per usuari).
 */
export function shouldDropGuestInProgress(state: InProgressState): boolean {
  return state.accountHasInProgress && state.guestHasInProgress;
}

/** No cal fusionar si no hi ha convidat o si és el mateix usuari. */
export function needsMerge(guestId: string | null | undefined, accountId: string): boolean {
  return !!guestId && guestId !== accountId;
}
