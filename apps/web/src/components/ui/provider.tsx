import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { system } from '../../theme';

/** Proveïdor de Chakra amb el tema de Petjada. Només mode clar. */
export function Provider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
