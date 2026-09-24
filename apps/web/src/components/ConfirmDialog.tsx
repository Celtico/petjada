import { Button, Dialog, Portal, Text, VStack } from '@chakra-ui/react';
import { t } from '../i18n/ca';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  lines?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Només un botó (informatiu). */
  infoOnly?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diàleg de confirmació propi (mai `confirm()` del navegador). */
export function ConfirmDialog({ open, title, lines, confirmLabel, cancelLabel, danger, infoOnly, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onCancel()} placement="center" role={infoOnly ? 'dialog' : 'alertdialog'}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4" rounded="2xl">
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            {lines && lines.length > 0 && (
              <Dialog.Body>
                <VStack align="stretch" gap="2">
                  {lines.map((line) => (
                    <Text key={line}>{line}</Text>
                  ))}
                </VStack>
              </Dialog.Body>
            )}
            <Dialog.Footer gap="3">
              {!infoOnly && (
                <Button variant="outline" size="lg" onClick={onCancel} disabled={busy}>
                  {cancelLabel ?? t.app.cancel}
                </Button>
              )}
              <Button colorPalette={danger ? 'red' : 'brand'} size="lg" onClick={onConfirm} loading={busy}>
                {confirmLabel ?? t.app.ok}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
