const CACHE_NAME = 'pollen-sardi-v1';

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

// FETCH - Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
            .catch(() => {
                // If both cache and network fail, return nothing
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});
