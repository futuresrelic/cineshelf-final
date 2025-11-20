/**
 * CineShelf Service Worker - Network-Only When Online
 *
 * Strategy:
 * - When ONLINE: Always fetch from network (no cache)
 * - When OFFLINE: Use cache as fallback
 * - Minimal caching, only for offline support
 */

const CACHE_NAME = 'cineshelf-offline-v1';
const OFFLINE_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/trivia.js',
    '/js/cover-scanner.js'
];

// Install - cache only essential offline assets
self.addEventListener('install', event => {
    console.log('[SW] Installing (network-only mode)...');

    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching offline assets');
            return cache.addAll(OFFLINE_ASSETS);
        }).then(() => {
            console.log('[SW] Install complete, skipping waiting');
            return self.skipWaiting();
        })
    );
});

// Activate - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

// Fetch - Network-only when online, cache-fallback when offline
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip non-http protocols
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // NEVER cache these
    const neverCache = [
        '/api/',
        '/data/',
        'get-version.php',
        'bump-version.php',
        '/manifest.php',
        '/app-icon.png',
        'icon-',
        '/favicon.ico'
    ];

    if (neverCache.some(path => url.pathname.includes(path))) {
        console.log('[SW] 🚫 NEVER CACHE:', url.pathname);
        event.respondWith(fetch(request));
        return;
    }

    // NETWORK-ONLY strategy for all assets when online
    event.respondWith(
        fetch(request)
            .then(response => {
                console.log('[SW] ✓ Network fetch:', url.pathname);

                // Update cache in background for offline use
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                        console.log('[SW] 📦 Updated offline cache:', url.pathname);
                    });
                }

                return response;
            })
            .catch(error => {
                // Network failed - try cache (offline mode)
                console.log('[SW] ⚠️ Network failed, trying cache:', url.pathname);
                return caches.match(request).then(cached => {
                    if (cached) {
                        console.log('[SW] ✓ Serving from cache (offline):', url.pathname);
                        return cached;
                    }

                    // No cache available either
                    console.error('[SW] ❌ No cache available:', url.pathname);
                    return new Response('Offline and no cache available', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/plain'
                        })
                    });
                });
            })
    );
});

// Handle messages
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting requested');
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        console.log('[SW] Clear cache requested');
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('[SW] Cache cleared');
                // Recreate cache with offline assets
                return caches.open(CACHE_NAME);
            }).then(cache => {
                return cache.addAll(OFFLINE_ASSETS);
            })
        );
    }
});
