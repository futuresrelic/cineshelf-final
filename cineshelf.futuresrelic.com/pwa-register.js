// CineShelf PWA - Registration & Aggressive Update Checker
(function() {
    'use strict';


    let updateAvailable = false;
    let registration = null;

    // Check if service worker is supported
    if (!('serviceWorker' in navigator)) {
        console.warn('[PWA] Service Worker not supported');
        return;
    }

    // Check localStorage access
    try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
    } catch (e) {
        console.error('[PWA] localStorage blocked:', e);
    }
    
    // Force check version on page load
    async function checkVersionOnLoad() {
        console.log('[PWA] checkVersionOnLoad() started');
        try {
            console.log('[PWA] Fetching /get-version.php...');
            const response = await fetch('/get-version.php?t=' + Date.now());
            console.log('[PWA] Fetch response status:', response.status);
            
            const serverData = await response.json();
            const serverVersion = serverData.version;
            console.log('[PWA] Server version:', serverVersion);
            
            // Get cached version from localStorage
            const cachedVersion = localStorage.getItem('cineshelf-version');
            console.log('[PWA] Cached version:', cachedVersion || 'NOT SET');
            
            console.log('[PWA] Version comparison:', {
                server: serverVersion,
                cached: cachedVersion,
                match: cachedVersion === serverVersion
            });
            
            // ALWAYS store version first (fix for mobile)
            console.log('[PWA] Attempting to store version in localStorage...');
            localStorage.setItem('cineshelf-version', serverVersion);
            
            // Verify it was stored
            const verifyStored = localStorage.getItem('cineshelf-version');
            console.log('[PWA] Verify stored version:', verifyStored);
            if (verifyStored === serverVersion) {
                console.log('[PWA] ✓ Version stored successfully!');
            } else {
                console.error('[PWA] ❌ Version storage FAILED!');
            }
            
            // Version changed? Force update
            if (cachedVersion && cachedVersion !== serverVersion) {
                console.log('[PWA] 🔄 Version changed! Starting forced update...');
                
                // Clear service worker
                console.log('[PWA] Unregistering service workers...');
                const registrations = await navigator.serviceWorker.getRegistrations();
                console.log('[PWA] Found', registrations.length, 'service workers');
                for (let reg of registrations) {
                    await reg.unregister();
                    console.log('[PWA] ✓ Unregistered:', reg.scope);
                }
                
                // Clear caches
                console.log('[PWA] Clearing caches...');
                const cacheNames = await caches.keys();
                console.log('[PWA] Found', cacheNames.length, 'caches:', cacheNames);
                for (let name of cacheNames) {
                    await caches.delete(name);
                    console.log('[PWA] ✓ Deleted cache:', name);
                }
                
                // Show update banner
                console.log('[PWA] Showing update banner...');
                showVersionUpdateBanner(cachedVersion, serverVersion);
                
                // Reload after 2 seconds
                console.log('[PWA] Reloading in 2 seconds...');
                setTimeout(() => {
                    console.log('[PWA] Reloading NOW!');
                    window.location.reload(true);
                }, 2000);
                
                return;
            } else {
                console.log('[PWA] ✓ Version matches, no update needed');
            }
            
        } catch (error) {
            console.error('[PWA] ❌ Version check FAILED:', error);
            console.error('[PWA] Error stack:', error.stack);
        }
    }
    
    // Show version update banner
    function showVersionUpdateBanner(oldVersion, newVersion) {
        const banner = document.createElement('div');
        banner.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 1rem;
                text-align: center;
                z-index: 10000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            ">
                <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem;">
                    🎬 CineShelf Updated!
                </div>
                <div style="font-size: 0.9rem;">
                    ${oldVersion} → ${newVersion}
                </div>
                <div style="font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.9;">
                    Refreshing in 2 seconds...
                </div>
            </div>
        `;
        document.body.insertBefore(banner, document.body.firstChild);
    }
    
    // Check version immediately on load
    console.log('[PWA] Calling checkVersionOnLoad() now...');
    checkVersionOnLoad();
    
    // Register service worker
    console.log('[PWA] Registering service worker...');
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => {
            registration = reg;
            console.log('[PWA] ✓ Service Worker registered');
            console.log('[PWA] Scope:', reg.scope);
            console.log('[PWA] Active:', !!reg.active);
            console.log('[PWA] Installing:', !!reg.installing);
            console.log('[PWA] Waiting:', !!reg.waiting);
            
            // Check for updates every 5 minutes (less aggressive to avoid false positives)
            setInterval(() => {
                console.log('[PWA] Running periodic update check...');
                reg.update();
            }, 300000);
            
            // Check for updates when page becomes visible
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    console.log('[PWA] Page visible, checking for updates...');
                    reg.update();
                }
            });
            
            // Handle waiting service worker (update available)
            if (reg.waiting) {
                console.log('[PWA] ⚠️ Update waiting!');
                showUpdateNotification(reg.waiting);
            }
            
            // Handle new service worker installing
            reg.addEventListener('updatefound', () => {
                console.log('[PWA] 🔄 Update found!');
                const newWorker = reg.installing;
                
                newWorker.addEventListener('statechange', () => {
                    console.log('[PWA] New worker state:', newWorker.state);
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[PWA] ⚠️ New service worker installed but old one still controlling');
                        showUpdateNotification(newWorker);
                    }
                });
            });
        })
        .catch(error => {
            console.error('[PWA] ❌ Service Worker registration FAILED:', error);
        });
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'VERSION_UPDATE') {
            console.log(`[CineShelf] Updated to version ${event.data.version}`);
        }
    });
    
    // Show update notification banner
    function showUpdateNotification(worker) {
        if (updateAvailable) return; // Don't show multiple times
        updateAvailable = true;
        
        const banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 1rem;
                text-align: center;
                z-index: 10000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            ">
                <span style="font-size: 1.5rem;">✨</span>
                <span style="font-weight: 600; margin: 0 0.5rem;">New version available!</span>
                <button id="update-btn" style="
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    margin: 0 0.5rem;
                    font-size: 0.9rem;
                ">
                    Update Now
                </button>
                <button id="dismiss-update-btn" style="
                    background: transparent;
                    color: white;
                    border: 1px solid white;
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                ">
                    Later
                </button>
            </div>
        `;
        
        document.body.insertBefore(banner, document.body.firstChild);
        
        // Setup controllerchange listener BEFORE clicking update
        let controllerChangeHandled = false;
        const handleControllerChange = () => {
            if (!controllerChangeHandled) {
                controllerChangeHandled = true;
                console.log('[PWA] Controller changed, reloading...');
                window.location.reload();
            }
        };
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

        // Update button handler
        document.getElementById('update-btn').addEventListener('click', () => {
            console.log('[PWA] Update button clicked');
            updateAvailable = false;

            // Tell the service worker to skip waiting
            if (worker) {
                console.log('[PWA] Sending SKIP_WAITING to worker');
                worker.postMessage({ type: 'SKIP_WAITING' });
            }

            // If worker is already activated, just reload
            if (worker.state === 'activated') {
                console.log('[PWA] Worker already activated, reloading now');
                window.location.reload();
                return;
            }

            // Show loading message
            banner.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 1rem;
                    text-align: center;
                    z-index: 10000;
                ">
                    <span style="font-size: 1.5rem;">⏳</span>
                    <span style="font-weight: 600; margin-left: 0.5rem;">Updating CineShelf...</span>
                </div>
            `;

            // Fallback: reload after 2 seconds if controllerchange doesn't fire
            setTimeout(() => {
                if (!controllerChangeHandled) {
                    console.log('[PWA] Fallback reload after timeout');
                    window.location.reload();
                }
            }, 2000);
        });
        
        // Dismiss button handler
        document.getElementById('dismiss-update-btn').addEventListener('click', () => {
            banner.remove();
            updateAvailable = false;
        });
    }
    
    // Check for updates on load
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
            reg.update();
        });
    }
    
})();