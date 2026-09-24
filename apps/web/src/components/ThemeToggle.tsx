import { Box, HStack, Switch, Text, VStack } from '@chakra-ui/react';
import { LuMoon, LuSun } from 'react-icons/lu';
import { t } from '../i18n/ca';
import { setThemeMode, useThemeMode } from '../theme-mode';

/** Bloc de preferència de tema: nit (per defecte) o dia. */
export function ThemeToggle() {
  const night = useThemeMode() === 'dark';
  const setTheme = setThemeMode;
  return (
    <Box bg="bg.panel" rounded="xl" shadow="sm" p="4">
      <HStack justify="space-between" gap="3">
        <HStack gap="3">
          <Box color="fg.subtle" fontSize="xl" aria-hidden>
            {night ? <LuMoon /> : <LuSun />}
          </Box>
          <VStack align="flex-start" gap="0">
            <Text fontWeight="semibold">{t.theme.title}</Text>
            <Text fontSize="sm" color="fg.muted">
              {night ? t.theme.night : t.theme.day}
            </Text>
          </VStack>
        </HStack>
        <Switch.Root
          size="lg"
          colorPalette="brand"
          checked={night}
          onCheckedChange={(e) => setTheme(e.checked ? 'dark' : 'light')}
        >
          <Switch.HiddenInput aria-label={t.theme.toggleLabel} />
          <Switch.Control />
        </Switch.Root>
      </HStack>
    </Box>
  );
}
