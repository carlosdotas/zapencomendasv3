// Prevent globalThis.__dirname = '.' injection from corrupting ESM packages that check typeof __dirname
delete (globalThis as any).__dirname;

import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.svg', 'icon.svg'],
        manifest: {
          name: 'EncomendasZap - Mapas & Logística',
          short_name: 'EncomendasZap',
          description: 'Mapa em tela cheia com rastreamento de entregas, rotas em tempo real e busca inteligente da EncomendasZap.',
          theme_color: '#001424',
          background_color: '#001424',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          share_target: {
            action: '/',
            method: 'GET',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
            },
          },
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /^\/tracking/, /^\/pedidos/, /^\/locais/, /^\/motoristas/, /^\/cidades/, /^\/users/, /^\/uploads/],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            // 1. REQUISIÇÕES DE NAVEGAÇÃO (Página Principal): NetworkFirst inteligente
            // Quando online: sempre carrega o HTML mais recente diretamente do servidor.
            // Quando offline ou com conexão instável: carrega o HTML em cache imediatamente (timeout 2s).
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'app-shell-navigation',
                networkTimeoutSeconds: 2,
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/unpkg\.com\/leaflet@.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'leaflet-cdn-assets',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/([a-z0-9-]+\.)*(tile\.openstreetmap|tile\.osm|opentopomap|cartocdn|basemaps)\.(org|fr|com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: {
                  maxEntries: 4000,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias em cache para funcionamento offline completo
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/unpkg\.com\/leaflet.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'leaflet-assets',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^\/(uploads|api\/uploads)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'uploads-cache',
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^\/(tracking|pedidos|locais|motoristas|cidades|users|tabela-precos).*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 2.5,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 3500,
      cssTarget: ['chrome64', 'firefox68', 'safari12', 'edge79'],
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
