import { Box, Center, Image, VStack } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AlbumScreen } from './album/AlbumScreen';
import { CollectionScreen } from './album/CollectionScreen';
import { ArScreen } from './ar/ArScreen';
import { AccountScreen, AuthDoneScreen, AuthErrorScreen } from './auth/AccountScreen';
import { session } from './auth/session';
import { ErrorView, LoadingView } from './components/StatusViews';
import { Toaster } from './components/ui/toaster';
import { assetUrl } from './config';
import { EditorCollectionScreen } from './editor/EditorCollectionScreen';
import { EditorRouteCardsScreen } from './editor/EditorRouteCardsScreen';
import { EditorScreen } from './editor/EditorScreen';
import { t } from './i18n/ca';
import { CardSheetHost } from './objects/CardSheet';
import { CreateRouteScreen } from './routes/CreateRouteScreen';
import { RouteDetailScreen } from './routes/RouteDetailScreen';
import { RoutesListScreen } from './routes/RoutesListScreen';
import { SimPanel } from './sim/SimPanel';
import { WalkScreen } from './walk/WalkScreen';

type Boot = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' };

function NotFound() {
  return <ErrorView message={t.app.notFound} onRetry={() => (window.location.hash = '/rutes')} retryLabel={t.walk.backToRoutes} />;
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });

  const start = useCallback(async () => {
    setBoot({ kind: 'loading' });
    const user = await session.bootstrap();
    setBoot(user ? { kind: 'ready' } : { kind: 'error' });
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  if (boot.kind !== 'ready') {
    return (
      <Center h="100%" px="6">
        <VStack gap="4">
          <Image src={assetUrl('/logo.svg')} alt={t.app.name} boxSize="24" />
          {boot.kind === 'loading' ? <LoadingView /> : <ErrorView message={t.app.sessionError} onRetry={() => void start()} />}
        </VStack>
        <Toaster />
      </Center>
    );
  }

  return (
    <HashRouter>
      <Box h="100%" position="relative">
        <Routes>
          <Route path="/" element={<Navigate to="/rutes" replace />} />
          <Route path="/rutes" element={<RoutesListScreen />} />
          <Route path="/rutes/:id" element={<RouteDetailScreen />} />
          <Route path="/crear" element={<CreateRouteScreen />} />
          <Route path="/ruta" element={<WalkScreen />} />
          <Route path="/ruta/camera" element={<ArScreen />} />
          <Route path="/album" element={<AlbumScreen />} />
          <Route path="/album/colleccions/:id" element={<CollectionScreen />} />
          <Route path="/compte" element={<AccountScreen />} />
          <Route path="/auth/done" element={<AuthDoneScreen />} />
          <Route path="/auth/error" element={<AuthErrorScreen />} />
          <Route path="/editor" element={<EditorScreen />} />
          <Route path="/editor/colleccions/:id" element={<EditorCollectionScreen />} />
          <Route path="/editor/rutes/:id/fitxes" element={<EditorRouteCardsScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <SimPanel />
        <CardSheetHost />
        <Toaster />
      </Box>
    </HashRouter>
  );
}
