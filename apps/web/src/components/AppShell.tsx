import { Box, Button, Flex, Heading, HStack, IconButton, Image, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { IconType } from 'react-icons';
import { LuBookImage, LuChevronLeft, LuFootprints, LuLandmark, LuUser, LuX } from 'react-icons/lu';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIsEditor, useSession } from '../auth/use-session';
import { t } from '../i18n/ca';

const BANNER_DISMISSED_KEY = 'petjada.guestBannerDismissed';

interface Tab {
  path: string;
  label: string;
  icon: IconType;
  editorOnly?: boolean;
}

const TABS: Tab[] = [
  { path: '/rutes', label: t.nav.routes, icon: LuFootprints },
  { path: '/album', label: t.nav.album, icon: LuBookImage },
  { path: '/editor', label: t.nav.editor, icon: LuLandmark, editorOnly: true },
  { path: '/compte', label: t.nav.account, icon: LuUser },
];

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Banner discret (tancable) que proposa crear compte als convidats. */
export function GuestBanner() {
  const user = useSession();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!user?.isGuest || dismissed) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } catch {
      /* ignora */
    }
    setDismissed(true);
  };
  return (
    <HStack bg="accent.subtle" borderBottomWidth="1px" borderColor="accent.muted" px="3" py="2" gap="2">
      <Text fontSize="sm" flex="1" color="fg">
        {t.auth.guestBanner}
      </Text>
      <Button size="xs" colorPalette="brand" onClick={() => navigate('/compte')}>
        {t.auth.guestBannerAction}
      </Button>
      <IconButton aria-label={t.app.close} size="xs" variant="ghost" onClick={dismiss}>
        <LuX />
      </IconButton>
    </HStack>
  );
}

/** Barra de navegació inferior amb pestanyes grans (una mà). */
export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isEditor = useIsEditor();
  const tabs = TABS.filter((tab) => !tab.editorOnly || isEditor);
  return (
    <Flex
      as="nav"
      bg="bg.panel"
      borderTopWidth="1px"
      borderColor="border"
      pb="safeBottom"
      flexShrink={0}
      zIndex={5}
    >
      {tabs.map((tab) => {
        const active = location.pathname.startsWith(tab.path);
        return (
          <Button
            key={tab.path}
            flex="1"
            variant="ghost"
            h="16"
            rounded="none"
            flexDirection="column"
            gap="1"
            fontSize="xs"
            color={active ? 'brand.fg' : 'fg.muted'}
            bg={active ? 'brand.subtle' : 'transparent'}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
          >
            <Box fontSize="2xl">
              <tab.icon />
            </Box>
            {tab.label}
          </Button>
        );
      })}
    </Flex>
  );
}

export interface PageProps {
  title: string;
  /** Botó "enrere" en lloc del logo. */
  onBack?: () => void;
  /** Sense barra de navegació inferior. */
  noNav?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

/** Pàgina estàndard: barra superior, contingut desplaçable i navegació inferior. */
export function Page({ title, onBack, noNav, actions, children }: PageProps) {
  return (
    <Flex direction="column" h="100%" minH="0">
      <HStack as="header" bg="bg.panel" shadow="sm" px="3" pb="3" pt="calc(var(--chakra-spacing-safe-top) + var(--chakra-spacing-3))" gap="3" zIndex={5}>
        {onBack ? (
          <IconButton aria-label={t.app.back} variant="ghost" size="lg" onClick={onBack}>
            <LuChevronLeft />
          </IconButton>
        ) : (
          <Image src="/logo.svg" alt={t.app.name} boxSize="9" />
        )}
        <Heading as="h1" size="lg" flex="1" truncate>
          {title}
        </Heading>
        {actions}
      </HStack>
      <GuestBanner />
      <Box flex="1" minH="0" overflowY="auto" px="4" py="4">
        {children}
      </Box>
      {!noNav && <BottomNav />}
    </Flex>
  );
}

/** Barra superior translúcida per a pantalles de mapa. */
export function OverlayTopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <HStack
      position="absolute"
      top="0"
      left="0"
      right="0"
      zIndex={5}
      px="3"
      pb="6"
      pt="calc(var(--chakra-spacing-safe-top) + var(--chakra-spacing-3))"
      gap="3"
      color="white"
      pointerEvents="none"
      bgGradient="to-b"
      gradientFrom="blackAlpha.600"
      gradientTo="transparent"
    >
      <IconButton aria-label={t.app.back} variant="solid" bg="bg.panel" color="fg" size="lg" rounded="full" pointerEvents="auto" onClick={onBack}>
        <LuChevronLeft />
      </IconButton>
      <Heading as="h1" size="md" textShadow="0 1px 3px rgba(0,0,0,0.6)">
        {title}
      </Heading>
    </HStack>
  );
}
