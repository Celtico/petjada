import { Box } from '@chakra-ui/react';
import { LuCrosshair, LuNavigation } from 'react-icons/lu';
import type { AlignmentState } from './alignment';

export interface AlignmentSymbolProps {
  state: AlignmentState;
  /** Desplaçament del símbol (px) cap a on cal girar. */
  dx: number;
  dy: number;
  /** Angle de la fletxa (graus, 0 = amunt). */
  arrowDeg: number;
  visible: boolean;
}

/**
 * Símbol d'alineació del mode càmera. Es desplaça segons l'error de rumb i
 * inclinació; en LOCKED es centra i canvia al color d'accent.
 */
export function AlignmentSymbol({ state, dx, dy, arrowDeg, visible }: AlignmentSymbolProps) {
  const locked = state === 'LOCKED';
  return (
    <Box
      position="absolute"
      left="50%"
      top="45%"
      zIndex={3}
      pointerEvents="none"
      opacity={visible ? 1 : 0}
      transition="transform 0.25s ease, opacity 0.4s ease"
      style={{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` }}
    >
      <Box
        fontSize="7xl"
        color={locked ? 'accent.solid' : 'brand.contrast'}
        filter={locked ? 'drop-shadow(0 0 16px var(--chakra-colors-accent-300))' : 'drop-shadow(0 0 8px rgba(0,0,0,0.6))'}
        transition="color 0.3s ease, filter 0.3s ease"
        animation={locked ? 'none' : undefined}
      >
        <LuCrosshair />
      </Box>
      <Box
        position="absolute"
        left="50%"
        top="50%"
        fontSize="3xl"
        color="accent.solid"
        opacity={state === 'ALIGNING' ? 1 : 0}
        transition="opacity 0.2s ease"
        style={{ transform: `translate(-50%, -50%) rotate(${arrowDeg}deg) translateY(-58px)` }}
      >
        <LuNavigation />
      </Box>
    </Box>
  );
}
