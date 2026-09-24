import type { ObjectCardDto } from '@petjada/shared';
import { useSyncExternalStore } from 'react';

export interface ShowCardOptions {
  capturedAt?: string;
  collectionCompleted?: { name: string; bonusPoints: number } | null;
}

export interface CardRequest {
  card: ObjectCardDto;
  options: ShowCardOptions;
  resolve: () => void;
}

/**
 * Cua de fitxes a mostrar. Les pantalles imperatives (ruta, càmera) demanen
 * `openCard()` i el `CardSheetHost` (a l'arrel de React) les renderitza.
 */
let current: CardRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function openCard(card: ObjectCardDto, options: ShowCardOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    current = { card, options, resolve };
    emit();
  });
}

export function closeCard(): void {
  const req = current;
  current = null;
  emit();
  req?.resolve();
}

export function useCurrentCard(): CardRequest | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => current,
  );
}
