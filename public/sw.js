/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Service Worker for Lectura PWA Offline Support & Cache Management
 *
 * NOTE: CACHE_NAME contains __CACHE_VERSION__ which is replaced dynamically
 * by the Express server at /api/sw.js with the actual APP_VERSION string.
 * This ensures old caches are always cleared when the app version changes.
 */

const CACHE_NAME = "lectura-__CACHE_VERSION__";
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/manifest.json?v=2.99.202",
];

// 1. Install Event: Pre-cache core shell resources
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[PWA Service Worker] Pre-caching app shell assets, cache:", CACHE_NAME);
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[PWA Service Worker] Pre-cache failed for some assets, continuing anyway:", err);
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 2. Activate Event: Clean up ALL legacy caches (any name that doesn't match current)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[PWA Service Worker] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-First strategy (always try network, fall back to cache only when offline)
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests or dynamic API endpoints (/api/...) and Firebase/Gemini external requests
  if (
    event.request.method !== "GET" ||
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.hostname.includes("firestore.googleapis.com") ||
    requestUrl.hostname.includes("generativelanguage.googleapis.com")
  ) {
    return;
  }

  // Network-First with Cache Fallback strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === "basic"
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // If offline or network fails, try returning cached asset
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fallback for navigation requests (HTML pages) when offline
        if (event.request.mode === "navigate") {
          const offlinePage = await caches.match("/index.html");
          if (offlinePage) {
            return offlinePage;
          }
        }

        return new Response("Вы находитесь в офлайн-режиме", {
          status: 503,
          statusText: "Service Unavailable",
          headers: new Headers({ "Content-Type": "text/plain; charset=utf-8" }),
        });
      })
  );
});
