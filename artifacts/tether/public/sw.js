// Tether Service Worker — handles Web Push notifications

const CACHE_NAME = 'tether-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: '💓 Tether',
      body: event.data ? event.data.text() : 'Someone is thinking of you!',
    };
  }

  const title = data.title ?? '💓 Tether';
  const options = {
    body: data.body ?? 'Someone is thinking of you 💙',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag ?? 'tether-nudge',
    renotify: true,
    requireInteraction: false,
    data: {
      url: self.registration.scope,
      screen: data.screen ?? 'home',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const screen = event.notification.data?.screen ?? 'home';
  const baseUrl = self.registration.scope;
  const targetUrl = baseUrl + '?screen=' + encodeURIComponent(screen);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(baseUrl)) {
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          client.postMessage({ type: 'TETHER_NAVIGATE', screen });
          if ('focus' in client) return client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
