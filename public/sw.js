const cachePrefix = 'jstqb-study-shell-';
const cacheName = 'jstqb-study-shell-development';
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/u, '');
const appShell = [`${scopePath}/`, `${scopePath}/manifest.webmanifest`, `${scopePath}/app-icon.svg`];
const appShellUrls = new Set(appShell.map((path) => new URL(path, self.location.origin).href));

function hasSensitiveHeaders(request) {
  return ['authorization', 'cookie', 'proxy-authorization'].some((header) => request.headers.has(header));
}

function isSameOriginAppShellRequest(request) {
  if (request.method !== 'GET' || hasSensitiveHeaders(request) || request.headers.has('range')) return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && appShellUrls.has(url.href);
}

function isAppNavigation(request) {
  if (request.method !== 'GET' || request.mode !== 'navigate' || hasSensitiveHeaders(request)) return false;
  const url = new URL(request.url);
  const scopePrefix = `${scopePath}/`;
  return url.origin === self.location.origin && (url.pathname === scopePath || url.pathname.startsWith(scopePrefix));
}

self.addEventListener('install', (event) => {
  const requests = appShell.map((path) => new Request(path, { cache: 'reload', credentials: 'omit' }));
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key)),
      )),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  if (isSameOriginAppShellRequest(event.request)) {
    event.respondWith(caches.open(cacheName).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: false });
      return cached ?? fetch(event.request);
    }));
    return;
  }

  if (isAppNavigation(event.request)) {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(cacheName);
      const fallback = await cache.match(`${scopePath}/`);
      return fallback ?? Response.error();
    }));
  }
});
