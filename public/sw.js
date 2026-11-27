/** Modulus Bulletin service worker: offline shell, static asset cache, push notifications. */
const VERSION = 'v12.3';
const CACHE_NAME = `campus-bulletin-static-${VERSION}`;
const PAGES_CACHE = `campus-bulletin-pages-${VERSION}`;
const DATA_CACHE = `campus-bulletin-data-${VERSION}`;
const MEDIA_CACHE = `campus-bulletin-media-${VERSION}`;
const OWN_CACHES = [CACHE_NAME, PAGES_CACHE, DATA_CACHE, MEDIA_CACHE];
const MEDIA_LIMIT = 40;

const STATIC_ASSET = /^\/(css\/|js\/|fonts\/|img\/|favicon|mark\.svg|apple-touch-icon|icon-|og-image\.png|og-card\.svg|manifest\.webmanifest)/;
const PUBLIC_PAGES = ['/', '/syllabus', '/phase-test', '/answer-keys', '/contacts'];
const PRECACHE = [
  '/css/style.min.css?v=12.3',
  '/js/icons.js?v=12.3',
  '/js/core.js?v=12.3',
  '/js/app.js?v=12.3',
  '/js/notifications.js?v=12.3',
  '/js/install.js?v=12.3',
  '/js/marked.umd.js?v=12.3',
  '/js/purify.min.js?v=12.3',
  '/favicon.svg?v=12.3',
  '/mark.svg?v=12.3',
  // The fonts, so an offline page draws in its own type.
  '/fonts/inter.woff2?v=1',
  '/fonts/geist-mono.woff2?v=1',
];

// Never touched by the worker: admin surface, push endpoints, health, the worker itself.
function isPrivate(pathname) {
  return (
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/push') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/health') ||
    pathname === '/sw.js'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const statics = await caches.open(CACHE_NAME);
    // One missing asset must not block the update, so add individually.
    await Promise.allSettled(PRECACHE.map((url) => statics.add(url)));
    const pages = await caches.open(PAGES_CACHE);
    await Promise.allSettled(PUBLIC_PAGES.map((url) => cachePage(pages, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((name) =>
        name.startsWith('campus-bulletin-') && !OWN_CACHES.includes(name) ? caches.delete(name) : undefined
      )
    );
    await clients.claim();
  })());
});

// Only responses the server marks as public pages are stored, so an admin shell never lands in the cache.
async function cachePage(cache, url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (response.ok && response.headers.get('X-Bulletin-Page') === 'public') {
    await cache.put(url, response.clone());
  }
  return response;
}

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

async function networkFirst(request, cacheName, cacheKey, shouldStore) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && shouldStore(response)) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivate(url.pathname)) return;

  // Pages: always fresh when online, last copy when offline.
  if (request.mode === 'navigate') {
    const key = PUBLIC_PAGES.includes(url.pathname) ? url.pathname : null;
    if (!key) return;
    event.respondWith(
      networkFirst(request, PAGES_CACHE, key, (res) => res.headers.get('X-Bulletin-Page') === 'public').catch(
        async () => (await caches.match('/', { cacheName: PAGES_CACHE })) || Response.error()
      )
    );
    return;
  }

  // Public API data: fresh when online, last response when offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA_CACHE, request, () => true));
    return;
  }

  // Uploaded scans: filenames are unique, so a cached copy never goes stale.
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: MEDIA_CACHE });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(MEDIA_CACHE);
        await cache.put(request, response.clone());
        trimCache(MEDIA_CACHE, MEDIA_LIMIT);
      }
      return response;
    })());
    return;
  }

  if (!STATIC_ASSET.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Modulus Bulletin',
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
    icon: '/favicon-192x192.png?v=12.3',
    badge: '/favicon-192x192.png?v=12.3',
    data: {
      url: data.url || '/',
    },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find((client) => client.url === targetUrl);
    if (exact) return exact.focus();

    const existing = windows.find((client) => 'focus' in client);
    if (existing) {
      // navigate() only works on clients this worker controls; fall back to a new window otherwise.
      try {
        const navigated = await existing.navigate(targetUrl);
        if (navigated) return navigated.focus();
      } catch {
        // uncontrolled client
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});
