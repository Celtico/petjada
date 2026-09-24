import type { UserDto } from '@petjada/shared';
import { useSyncExternalStore } from 'react';
import { session } from './session';

function subscribe(onChange: () => void): () => void {
  return session.subscribe(() => onChange());
}

function getSnapshot(): UserDto | null {
  return session.user;
}

/** Usuari actual (o `null`), reactiu als canvis de sessió. */
export function useSession(): UserDto | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsEditor(): boolean {
  const user = useSession();
  return user?.role === 'editor' || user?.role === 'admin';
}
