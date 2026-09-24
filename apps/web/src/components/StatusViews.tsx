import { Box, Button, Center, Spinner, Text, VStack } from '@chakra-ui/react';
import type { IconType } from 'react-icons';
import { t } from '../i18n/ca';

export function LoadingView({ label }: { label?: string }) {
  return (
    <Center flex="1" minH="40" py="8">
      <VStack gap="3">
        <Spinner size="lg" color="brand.solid" />
        <Text color="fg.muted">{label ?? t.app.loading}</Text>
      </VStack>
    </Center>
  );
}

export function ErrorView({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <Center flex="1" minH="40" py="8" px="4">
      <VStack gap="4" maxW="sm" textAlign="center">
        <Text color="fg.error" fontWeight="medium">
          {message}
        </Text>
        {onRetry && (
          <Button variant="outline" colorPalette="brand" size="lg" onClick={onRetry}>
            {retryLabel ?? t.app.retry}
          </Button>
        )}
      </VStack>
    </Center>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: IconType; text: string }) {
  return (
    <Center py="10" px="4">
      <VStack gap="3" color="fg.muted" textAlign="center">
        <Box fontSize="4xl" color="brand.fg" opacity={0.6}>
          <Icon />
        </Box>
        <Text>{text}</Text>
      </VStack>
    </Center>
  );
}
