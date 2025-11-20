/**
 * CineShelf Service Worker - Force Fresh on Version Change
 *
 * Strategy:
 * 1. Check version on EVERY fetch of critical files
 * 2. If version changed: bypass cache, fetch fresh
 * 3. Network-first for all critical files (HTML/CSS/JS/PHP)
 */

let VERSION = null;
let CACHE_NAME = null;

// Fetch current version from server
async function getCurrentVersion() {
    // Try get-version.php first
    try {
        const response = await fetch('/get-version.php?t=' + Date.now());
        const data = await response.json();
        return 'v' + data.version;
    } catch (error) {
        console.warn('[SW] get-version.php failed, trying version.json:', error);
    }

    // Fallback to version.json
    try {
        const response = await fetch('/version.json?t=' + Date.now());
        const data = await response.json();
        return 'v' + data.version;
    } catch (error) {
        console.error('[SW] Failed to fetch version from both sources:', error);
        // Last resort fallback - should rarely be reached
        return 'v2.1.0';
    }
}

// Initialize version
async function initVersion() {
    VERSION = await getCurrentVersion();
    CACHE_NAME = `cineshelf-${VERSION}`;
    console.log('[SW] Initialized version:', VERSION);
    return VERSION;
}

// Install - cache initial files with version
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        initVersion().then(() => {
            console.log('[SW] Caching with version:', VERSION);
            return caches.open(CACHE_NAME);
        }).then(cache => {
            // Cache basic files (NOT icons or manifest - those always fetch fresh)
            return cache.addAll([
                '/',
                '/index.html'
            ]);
        }).then(() => {
            console.log('[SW] Install complete, skipping waiting');
            return self.skipWaiting();
        })
    );
});

// Activate - delete old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        initVersion().then(() => {
            return caches.keys();
        }).then(cacheNames => {
            console.log('[SW] Found caches:', cacheNames);
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName.startsWith('cineshelf-') && cacheName !== CACHE_NAME) {
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

// Fetch - ALWAYS check version for critical files
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
    
    // CRITICAL FILES - Always check version first, then network-first
    const isCriticalFile = 
        url.pathname === '/' ||
        url.pathname === '/index.html' ||
        url.pathname.startsWith('/js/') ||
        url.pathname.startsWith('/css/') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.php');
    
    if (isCriticalFile) {
        event.respondWith(
            handleCriticalFile(request, url)
        );
        return;
    }
    
    // Non-critical files (images, fonts, etc.) - cache-first
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            
            return fetch(request).then(response => {
                if (response.status === 200 && CACHE_NAME) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, clone);
                    });
                }
                return response;
            });
        })
    );
});

// Handle critical files with version check
async function handleCriticalFile(request, url) {
    try {
        // NEVER cache PHP files, API calls, manifest, or icons - always fetch fresh
        if (url.pathname.includes('/api/') || 
            url.pathname.endsWith('.php') ||
            url.pathname.includes('/data/') ||
            url.pathname.includes('get-version.php') ||
            url.pathname.includes('bump-version.php') ||
            url.pathname === '/pwa-register.js' ||
            url.pathname === '/manifest.json' ||
            url.pathname === '/manifest.php' ||
            url.pathname === '/app-icon.png' ||
            url.pathname.includes('icon-') ||
            url.pathname === '/favicon.ico') {
            
            console.log('[SW] 🚫 NO CACHE - Direct fetch:', url.pathname);
            return fetch(request);
        }
        
        // For HTML/CSS/JS: Check version first
        const currentVersion = await getCurrentVersion();
        console.log('[SW] Version check for', url.pathname, '- Current:', currentVersion, 'Stored:', VERSION);
        
        // Version changed? Bypass cache completely
        if (currentVersion !== VERSION) {
            console.log('[SW] 🔄 VERSION CHANGED!', VERSION, '→', currentVersion);
            VERSION = currentVersion;
            CACHE_NAME = `cineshelf-${VERSION}`;
            
            // Delete old caches
            console.log('[SW] Deleting old caches...');
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name.startsWith('cineshelf-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] ✓ Deleted:', name);
                        return caches.delete(name);
                    })
            );
            
            // Fetch fresh and cache new version
            console.log('[SW] Fetching fresh:', url.pathname);
            const response = await fetch(request);
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, clone);
            
            console.log('[SW] ✓ Cached in new version:', CACHE_NAME);
            return response;
        }
        
        // Version same: Network-first strategy
        console.log('[SW] Network-first fetch:', url.pathname);
        try {
            const response = await fetch(request);
            console.log('[SW] ✓ Network fetch successful:', response.status);
            
            // Cache the fresh response
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, clone);
            console.log('[SW] ✓ Updated cache');
            
            return response;
        } catch (networkError) {
            // Network failed - try cache
            console.log('[SW] ❌ Network failed, trying cache:', url.pathname);
            const cached = await caches.match(request);
            if (cached) {
                console.log('[SW] ✓ Returning cached version');
                return cached;
            }
            console.error('[SW] ❌ No cached version available');
            throw networkError;
        }
        
    } catch (error) {
        console.error('[SW] Fetch error:', url.pathname, error);
        
        // Last resort: try cache
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        
        // Return error response
        return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Handle messages
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting requested');
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({
            type: 'VERSION',
            version: VERSION
        });
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        console.log('[SW] Clear cache requested');
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
            })
        );
    }
});