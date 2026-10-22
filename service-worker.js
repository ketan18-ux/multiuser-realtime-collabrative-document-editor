/**
 * service-worker.js — Version 2
 *
 * Provides offline caching for application shell assets.
 * Uses Network-First for HTML navigation so page transitions are always fresh,
 * falling back to Cache when offline.
 * Uses Cache-First for static assets (CSS, JS, icons).
 */

const CACHE_NAME = 'doc-editor-v2';

// Essential shell files to cache for offline usage
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/css/style.css',
  '/css/auth.css',
  '/js/config.js',
  '/js/supabase-client.js',
  '/js/auth.js',
  '/js/security.js',
  '/js/database.js',
  '/js/documents.js',
  '/js/editor.js',
  '/js/offline.js',
  '/js/app.js',
  '/config/authorized-emails.js'
];

// Install: precache app shell files
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Precache skipped for ${url}:`, err);
          })
        )
      );
    })
  );
});

// Activate: clean up older caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and cross-origin requests (e.g. Supabase API, external CDNs)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Strategy 1: Network-First for HTML navigations
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // If offline, try matching the requested URL in cache, then fall back to the appropriate page
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (url.pathname.includes('register')) {
              return caches.match('/register.html');
            }
            if (url.pathname.includes('login')) {
              return caches.match('/login.html');
            }
            return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Strategy 2: Cache-First for static assets (CSS, JS, etc.)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to keep cache updated
        fetch(request).then((freshResponse) => {
          if (freshResponse && freshResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, freshResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      });
    })
  );
});
