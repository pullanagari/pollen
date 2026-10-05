// Bump this whenever app files change, otherwise phones keep serving the cached old app.js
const CACHE_NAME = 'pollen-sardi-v2';

const urlsToCache = [
    '/pollen/',
    '/pollen/index.html',
    '/pollen/manifest.json',
    '/pollen/css/styles.css',
    '/pollen/js/app.js',
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
    // Only handle GET requests for this app's own files
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
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
