import { useEffect, useSyncExternalStore } from 'react';
import { walkSession } from './session';

/**
 * Versió del `walkSession`: puja a cada canvi (posició, estat, objectes,
 * captura, gir). Els components que la llegeixen es tornen a renderitzar.
 */
let version = 0;
const listeners = new Set<() => void>();
let bound = false;

function bump(): void {
  version += 1;
  for (const l of listeners) l();
}

function bindOnce(): void {
  if (bound) return;
  bound = true;
  walkSession.positions.on(bump);
  walkSession.states.on(bump);
  walkSession.objectsChanged.on(bump);
  walkSession.views.on(bump);
  walkSession.turnaround.on(bump);
  walkSession.captured.on(bump);
}

function subscribe(onChange: () => void): () => void {
  bindOnce();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): number {
  return version;
}

/** Retorna el `walkSession` compartit i força un re-render a cada canvi. */
export function useWalkSession(): typeof walkSession {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(bindOnce, []);
  return walkSession;
}
