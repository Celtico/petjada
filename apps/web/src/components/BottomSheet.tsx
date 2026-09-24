import { Box, Button, Drawer, Heading, HStack, IconButton, Portal } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';
import { t } from '../i18n/ca';

/** Panell fix a la part inferior d'una pantalla de mapa (no modal). */
export function BottomPanel({ children, maxH = '55%' }: { children: ReactNode; maxH?: string }) {
  return (
    <Box
      position="absolute"
      left="0"
      right="0"
      bottom="0"
      zIndex={4}
      bg="bg.panel"
      roundedTop="2xl"
      shadow="lg"
      maxH={maxH}
      overflowY="auto"
      px="4"
      pt="3"
      pb="calc(var(--chakra-spacing-safe-bottom) + var(--chakra-spacing-4))"
    >
      <Box w="10" h="1" rounded="full" bg="border.muted" mx="auto" mb="3" />
      {children}
    </Box>
  );
}

export interface SheetDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Botó principal al peu (p. ex. "Desa"). */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
}

/** Full modal que puja des de baix (fitxes, edició d'objectes). */
export function SheetDialog({ open, onClose, title, children, primaryLabel, onPrimary, primaryDisabled }: SheetDialogProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(e) => !e.open && onClose()} placement="bottom">
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content roundedTop="2xl" maxH="85vh" pb="safeBottom">
            <Drawer.Header>
              <HStack justify="space-between">
                <Heading as="h2" size="lg">
                  {title}
                </Heading>
                <IconButton aria-label={t.app.close} variant="ghost" size="lg" onClick={onClose}>
                  <LuX />
                </IconButton>
              </HStack>
            </Drawer.Header>
            <Drawer.Body>{children}</Drawer.Body>
            <Drawer.Footer>
              {primaryLabel ? (
                <Button colorPalette="brand" size="lg" w="100%" onClick={onPrimary ?? onClose} disabled={primaryDisabled}>
                  {primaryLabel}
                </Button>
              ) : (
                <Button variant="outline" colorPalette="brand" size="lg" w="100%" onClick={onClose}>
                  {t.app.close}
                </Button>
              )}
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
