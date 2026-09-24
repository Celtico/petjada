import { useSyncExternalStore } from 'react';

/**
 * Tema de color de l'app: nit (per defecte) o dia. Chakra aplica els valors
 * `_dark` quan <html> té la classe `dark`. L'script inline de `index.html`
 * aplica l'elecció guardada abans del primer pintat; aquí només es canvia i es
 * notifica. Tot en local (preferència d'aquest dispositiu).
 */
export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'petjada.theme';
const DEFAULT_MODE: ThemeMode = 'dark';

const listeners = new Set<() => void>();

function readStored(): ThemeMode {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function apply(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
}

let current: ThemeMode = typeof document === 'undefined' ? DEFAULT_MODE : readStored();

export function getThemeMode(): ThemeMode {
  return current;
}

export function setThemeMode(mode: ThemeMode): void {
  current = mode;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* sense emmagatzematge: només per a aquesta sessió */
  }
  apply(mode);
  for (const l of listeners) l();
}

/** Aplica el tema guardat (per si l'script inline no s'ha executat). */
export function initThemeMode(): void {
  apply(current);
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getThemeMode,
    () => DEFAULT_MODE,
  );
}
