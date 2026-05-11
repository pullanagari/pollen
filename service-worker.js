const CACHE_NAME = 'pollen_sardi-v1';

const STATIC_ASSETS = [
    '/pollen/',
    '/pollen/index.html',
    '/pollen/css/styles.css',
    '/pollen/js/app.js',
    '/pollen/manifest.json',
    '/pollen/icon.svg'
];

self.addEventListener('install', (event) => {

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then((cache) => {

                return cache.addAll(STATIC_ASSETS);

            })

    );

});
