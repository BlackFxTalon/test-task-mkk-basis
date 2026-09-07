// Собственный service worker (стратегия injectManifest модуля @vite-pwa/nuxt).
// В точку `self.__WB_MANIFEST` workbox встраивает precache-манифест сборки:
// index.html, манифест, иконки и логотип приходят из globPatterns
// (nuxt.config.ts). Навигации — network-first: пока есть сеть, пользователь
// получает свежую оболочку; оффлайн отдаёт precache. Хешированные ассеты
// /_nuxt/ — cache-first: они неизменяемы (dontCacheBustURLsMatching).
import { PrecacheFallbackPlugin, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);

// Для injectManifest autoUpdate требует безусловного пропуска waiting-фазы:
// новый SW активируется сразу, а клиент vite-plugin-pwa перезагружает вкладку
// по событию activated.
self.skipWaiting();

registerRoute(
  ({ request, url }) => request.mode === 'navigate' && url.origin === self.location.origin,
  new NetworkFirst({
    cacheName: 'nav-cache',
    networkTimeoutSeconds: 4,
    plugins: [new PrecacheFallbackPlugin({ fallbackURL: '/' })],
  }),
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/_nuxt/'),
  new CacheFirst({ cacheName: 'asset-cache' }),
);

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
