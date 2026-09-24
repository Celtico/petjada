import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { system } from '../../theme';
import { initThemeMode } from '../../theme-mode';

initThemeMode();

/**
 * Proveïdor de Chakra amb el tema de Petjada. El tema de nit és el
 * predeterminat (classe `dark` a <html>); es canvia des de Compte.
 */
export function Provider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
