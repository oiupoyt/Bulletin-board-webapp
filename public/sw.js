/** Campus Bulletin - Static asset cache and push notifications. */
const CACHE_NAME = 'campus-bulletin-static-v7';
const STATIC_ASSET = /^\/(css\/|js\/|favicon|apple-touch-icon|og-image\.png|og-card\.svg)/;

function isCacheable(request, url) {
  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/health') &&
    !url.pathname.startsWith('/uploads/') &&
    STATIC_ASSET.test(url.pathname)
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) =>
        cacheName.startsWith('campus-bulletin-static-') && cacheName !== CACHE_NAME
          ? caches.delete(cacheName)
          : undefined
      )
    );
    await clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isCacheable(event.request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Campus Bulletin',
    body: 'New circular or examination update posted.',
    url: '/',
    tag: 'notice-update',
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    tag: data.tag || 'notice-update',
    renotify: true,
    data: {
      url: data.url || '/',
    },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
