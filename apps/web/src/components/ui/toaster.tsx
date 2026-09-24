import { Toaster as ChakraToaster, Portal, Spinner, Stack, Toast, createToaster } from '@chakra-ui/react';

export const toaster = createToaster({
  placement: 'top',
  pauseOnPageIdle: true,
  duration: 3000,
});

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

/** Avís curt. Els errors duren una mica més. */
export function toast(description: string, type: ToastKind = 'info', duration?: number): void {
  toaster.create({ description, type, duration: duration ?? (type === 'error' ? 4500 : 3000) });
}

export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: '4' }} paddingTop="safeTop">
        {(item) => (
          <Toast.Root width={{ md: 'sm' }}>
            {item.type === 'loading' ? <Spinner size="sm" color="brand.solid" /> : <Toast.Indicator />}
            <Stack gap="1" flex="1" maxWidth="100%">
              {item.title && <Toast.Title>{item.title}</Toast.Title>}
              {item.description && <Toast.Description>{item.description}</Toast.Description>}
            </Stack>
            {item.action && <Toast.ActionTrigger>{item.action.label}</Toast.ActionTrigger>}
            {item.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}
