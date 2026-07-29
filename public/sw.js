/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Service Worker for Remix Lectura PWA Offline Support & Cache Management
 */

const CACHE_NAME = "remix-lectura-v2.59";
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/src/main.tsx",
  "/src/index.css"
];

// 1. Install Event: Pre-cache core shell resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[PWA Service Worker] Pre-caching app shell assets");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[PWA Service Worker] Pre-cache failed for some assets, continuing anyway:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up legacy caches
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

// 3. Fetch Event: Stale-While-Revalidate Strategy for UI shell & Cache-First for static assets
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests or dynamic API endpoints (/api/...) and Firebase/Gemini external requests
  if (
    event.request.method !== "GET" ||
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.hostname.includes("firestore.googleapis.com") ||
    requestUrl.hostname.includes("generativelanguage.googleapis.com text/html")
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
