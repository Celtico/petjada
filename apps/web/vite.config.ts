import path from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const ROOT_ENV_DIR = path.resolve(__dirname, '../..');

// `DEV_HTTP=1 pnpm dev:web` serveix per HTTP (sense certificat) per provar des de
// l'escriptori amb el mode de simulació. La càmera i els sensors necessiten HTTPS.
const DEV_HTTP = process.env.DEV_HTTP === '1';

// Ruta base del desplegament, amb barra inicial i final. A GitHub Pages és
// `/<repositori>/` (`BASE_PATH=/petjada/`); en un domini propi, `/`.
const BASE = `/${(process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

export default defineConfig({
  base: BASE,
  // El `.env` és únic i viu a l'arrel del monorepo.
  envDir: ROOT_ENV_DIR,
  resolve: {
    // El paquet compartit s'empaqueta des del codi font (ESM) en lloc del dist CommonJS.
    alias: { '@petjada/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') },
  },
  server: {
    host: true,
    port: 5173,
    https: DEV_HTTP ? undefined : {},
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: true,
    https: {},
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    react(),
    ...(DEV_HTTP
      ? []
      : [basicSsl({ name: 'petjada-dev', domains: ['localhost'], certDir: path.resolve(__dirname, '.cert') })]),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png', 'cover.png', 'splash/*.png', 'objects/*.webp'],
      manifest: {
        name: 'Petjada',
        short_name: 'Petjada',
        description: 'Camina. Troba. Suma.',
        lang: 'ca',
        theme_color: '#0B1714',
        background_color: '#0B1714',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icons/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${BASE}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        // `wasm`: SQLite del backend local (`VITE_BACKEND=local`), perquè funcioni sense connexió.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'petjada-api', networkTimeoutSeconds: 8, expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'api.mapbox.com' && /\/styles\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'mapbox-styles', expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'api.mapbox.com' && !/\/styles\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'mapbox-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 24 * 60 * 60 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
