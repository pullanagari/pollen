// Bump this whenever app files change, otherwise phones keep serving the cached old app.js
const CACHE_NAME = 'pollen-sardi-v14';

// Barcode scanner library (iPhone/Safari/Firefox use it). Version-pinned, so it never
// changes - cache it so scanning still works offline.
const SCANNER_LIB_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

const urlsToCache = [
    SCANNER_LIB_URL,
    '/pollen/',
    '/pollen/index.html',
    '/pollen/manifest.json',
    '/pollen/css/styles.css?v=6',
    '/pollen/js/app.js?v=16',
    '/pollen/icons/icon-192.png',
    '/pollen/icons/icon-512.png'
];

// INSTALL - Cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                // Use Promise.allSettled to prevent failure on missing files
                return Promise.allSettled(
                    urlsToCache.map(url => 
                        cache.add(url).catch(err => {
                            console.log('Failed to cache:', url);
                            return null;
                        })
                    )
                );
            })
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// ACTIVATE - Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control of all pages immediately
    return self.clients.claim();
});

// FETCH - Network first so updates reach the phone straight away,
// fall back to the cached copy only when offline
self.addEventListener('fetch', (event) => {
    // Scanner library: cache first (pinned version), fetch and store it if missing
    if (event.request.method === 'GET' && event.request.url === SCANNER_LIB_URL) {
        event.respondWith(
            caches.match(SCANNER_LIB_URL).then((cached) => cached || fetch(event.request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(SCANNER_LIB_URL, copy));
                }
                return response;
            }))
        );
        return;
    }

    // Only handle GET requests for this app's own files
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((cached) => {
                    return cached || new Response('Offline', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});
