/// <reference lib="webworker" />
// FridgeWise service worker:
//  * precaches the app shell so the app opens offline (the UI then shows an offline banner)
//  * serves index.html for every navigation (single-page app)
//  * keeps a font once it has been used, so a chosen font also works offline
//  * shows Web Push reminders and opens the app when one is tapped
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { ExpirationPlugin } from 'workbox-expiration';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Font files are not precached (most people never pick one); cache each the first time it's used.
registerRoute(
  ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
  new CacheFirst({ cacheName: 'fw-fonts', plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })] }),
);

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'FridgeWise';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Some food is about to expire.',
      icon: '/icons/pwa-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag || 'fridgewise-reminder',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
