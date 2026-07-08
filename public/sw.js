const CACHE_NAME = 'lectura-v2.11.0';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Event: pre-cache critical app shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching App Shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate new service worker immediately
  );
});

// Activate Event: clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting obsolete cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Immediately take control of all open clients
  );
});

// Fetch Event: intercept network requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass cache for backend API calls
  if (url.pathname.startsWith('/api/')) {
    return; // Let browser fetch normally
  }

  // 2. Navigation requests (HTML pages) -> Network-First, fallback to cached App Shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh HTML page
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If offline, serve the cached index.html
          return caches.match('/')
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Fallback to absolute index.html just in case
              return caches.match('/index.html');
            });
        })
    );
    return;
  }

  // 3. Static assets & media (JS, CSS, SVGs, Fonts) -> Stale-While-Revalidate
  // Focus on assets from the same origin or specific CDNs (like Google Fonts)
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              // Only cache valid standard GET responses
              if (networkResponse.ok && event.request.method === 'GET') {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseClone);
                });
              }
              return networkResponse;
            })
            .catch((err) => {
              console.warn('[Service Worker] Fetch failed for:', event.request.url, err);
              // If fetching failed, we just return whatever was in the cache or let it fail
            });

          // Return cached response instantly if available, else wait for network
          return cachedResponse || fetchPromise;
        })
    );
  }
});
