/**
 * Pollen_SARDI PWA - Service Worker
 * Handles offline caching and background sync
 */

const CACHE_NAME = 'pollen_sardi-v1';
const OFFLINE_URL = '/';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => {
                self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension and other non-http requests
    if (!event.request.url.startsWith('http')) {
        return;
    }
    
    // Skip API calls (Google Apps Script)
    if (event.request.url.includes('script.google.com')) {
        return;
    }
    
    // Skip nominatim (geocoding)
    if (event.request.url.includes('nominatim.openstreetmap.org')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached response and update cache in background
                    event.waitUntil(
                        fetch(event.request)
                            .then((networkResponse) => {
                                if (networkResponse.ok) {
                                    caches.open(CACHE_NAME)
                                        .then((cache) => {
                                            cache.put(event.request, networkResponse);
                                        });
                                }
                            })
                            .catch(() => {})
                    );
                    return cachedResponse;
                }
                
                // Not in cache, fetch from network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Cache successful responses
                        if (networkResponse.ok) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed, try to return offline page for navigation
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// Background sync for pending transfers
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-transfers') {
        event.waitUntil(syncPendingTransfers());
    }
});

async function syncPendingTransfers() {
    // This would sync pending transfers when back online
    // Implementation depends on having access to localStorage
    // which isn't directly available in service workers
    // The main app handles this on 'online' event
    console.log('Background sync triggered');
}

// Push notifications (future feature)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'New notification',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            vibrate: [100, 50, 100],
            data: {
                url: data.url || '/'
            }
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Pollen_SARDI', options)
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Check if already open
                for (const client of windowClients) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});
