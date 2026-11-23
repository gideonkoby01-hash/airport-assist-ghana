// Airport Assist Ghana service worker: makes the app open instantly and still open when the connection is poor.
//   * The app's own files (hashed, so they never change) are kept after the first visit.
//   * Pages are always fetched fresh when there is a connection; the last good copy is the fallback when there is none.
//   * Nothing from the database, sign-in or the Edge Functions is ever stored here: those requests go straight through.
// A new version waits until the person taps "Refresh" in the app, so a form being filled in is never reloaded under them.
const SHELL = 'aag-shell-v1';
const ASSETS = 'aag-assets-v1';
const MAX_ASSETS = 150;
const SLOW_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add(new Request('/', { cache: 'reload' }))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (![SHELL, ASSETS].includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => hit);
  return hit || fresh;
}

const OFFLINE = () => new Response('You are offline. Open the app again when you have a connection.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// Pages: the fresh copy when the network answers; the last good copy when it is offline, or too slow (a weak signal). The fresh
// copy keeps downloading in the background and is saved for next time either way.
async function page(request) {
  const cache = await caches.open(SHELL);
  const network = fetch(request).then((response) => {
    if (response.ok && !response.redirected) cache.put('/', response.clone());
    return response;
  });
  const cached = await cache.match('/');
  if (!cached) return network.catch(OFFLINE);
  network.catch(() => {});
  const slow = new Promise((resolve) => setTimeout(() => resolve(null), SLOW_MS));
  try {
    return (await Promise.race([network, slow])) || cached;
  } catch {
    return cached;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                  // the database, sign-in and functions are on other addresses
  if (url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') return event.respondWith(page(request));
  if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request));
  if (/\.(png|webp|jpe?g|svg|ico|woff2?|webmanifest|js)$/.test(url.pathname)) return event.respondWith(staleWhileRevalidate(request));
});
