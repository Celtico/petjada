import './styles/base.css';
import { registerSW } from 'virtual:pwa-register';
import { albumScreen } from './album/album';
import { collectionDetailScreen } from './album/collection';
import { arScreen } from './ar/screen';
import { accountScreen, authDoneScreen } from './auth/account';
import { session } from './auth/session';
import { editorCollectionScreen, editorRouteCardsScreen, editorScreen } from './editor/editor';
import { t } from './i18n/ca';
import { createRouteScreen } from './routes/create';
import { routeDetailScreen } from './routes/detail';
import { routesListScreen } from './routes/list';
import { mountSimPanel } from './sim/panel';
import { el } from './ui/dom';
import { errorView, loadingView } from './ui/layout';
import { router } from './ui/router';
import { walkScreen } from './walk/screen';

registerSW({ immediate: true });

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

router.register('/', () => router.navigate('/rutes', true));
router.register('/rutes', routesListScreen);
router.register('/rutes/:id', routeDetailScreen);
router.register('/crear', createRouteScreen);
router.register('/ruta', walkScreen);
router.register('/ruta/camera', arScreen);
router.register('/album', albumScreen);
router.register('/album/colleccions/:id', collectionDetailScreen);
router.register('/compte', accountScreen);
router.register('/auth/done', authDoneScreen);
router.register('/editor', editorScreen);
router.register('/editor/colleccions/:id', editorCollectionScreen);
router.register('/editor/rutes/:id/fitxes', editorRouteCardsScreen);
router.setNotFound((container) => {
  container.append(errorView(t.app.notFound, () => router.navigate('/rutes')));
});

async function boot(): Promise<void> {
  root!.replaceChildren(el('div', { className: 'centered' }, el('img', { className: 'logo', src: '/logo.svg', alt: t.app.name }), loadingView()));
  const user = await session.bootstrap();
  if (!user) {
    root!.replaceChildren(errorView(t.app.sessionError, () => void boot()));
    return;
  }
  mountSimPanel();
  router.start(root!);
}

void boot();
