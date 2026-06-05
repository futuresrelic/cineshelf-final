/**
 * CineShelf Cover Scanner - Batch Mode
 * Uses OpenAI Vision API to recognize DVD/Blu-ray covers
 * Modified for batch scanning: scan multiple covers, then resolve all at once
 */

const CoverScanner = (function() {
    let stream = null;
    let scanList = []; // Batch of scanned titles
    
    // Camera elements
    let video, canvas, ctx;
    
    function init() {
        video = document.getElementById('scannerVideo');
        canvas = document.getElementById('scannerCanvas');
        ctx = canvas ? canvas.getContext('2d') : null;
    }
    
    // Detect iOS devices
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    // Open scanner modal
async function openScanner() {
    init();

    // No need to check for API key anymore - it's configured on the server
    document.getElementById('coverScannerModal').classList.add('active');

    try {
        const iOS = isIOS();

        // iOS-specific constraints
        if (iOS) {
            console.log('iOS detected - using optimized camera constraints');

            // Strategy 1: Try exact rear camera for iOS
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { exact: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                });
                console.log('iOS: Rear camera acquired');
            } catch (err) {
                console.log('iOS: Rear camera failed, trying fallback:', err.message);

                // Strategy 2: Try ideal rear camera (less strict)
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: 'environment',
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    });
                    console.log('iOS: Rear camera (ideal) acquired');
                } catch (err2) {
                    console.log('iOS: Ideal rear camera failed, trying any camera:', err2.message);

                    // Strategy 3: Any camera on iOS
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    });
                    console.log('iOS: Front camera acquired');
                }
            }
        } else {
            // Non-iOS devices (Android, Desktop)
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                });
                console.log('Desktop/Android: Camera acquired');
            } catch (err) {
                // Fallback: any camera
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                console.log('Fallback: Any camera acquired');
            }
        }

        if (!stream) throw new Error('No camera available');

        video.srcObject = stream;

        // iOS needs special handling for video play
        if (iOS) {
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
        }

        await video.play();
        updateBatchCount();

        console.log('Camera started successfully');

    } catch (error) {
        console.error('Camera error:', error);
        closeScanner();

        if (error.name === 'NotFoundError') {
            alert('❌ No camera found on this device');
        } else if (error.name === 'NotAllowedError') {
            if (isIOS()) {
                alert('❌ Camera permission denied\n\niPhone/iPad users:\n1. Go to Settings > Safari > Camera\n2. Set to "Ask" or "Allow"\n3. Reload this page and try again');
            } else {
                alert('❌ Camera permission denied\n\nPlease allow camera access in your browser settings and reload the page');
            }
        } else if (error.name === 'OverconstrainedError') {
            alert('❌ Camera constraints not supported\n\nYour device camera doesn\'t support the requested resolution. Try using a different camera or device.');
        } else {
            alert('❌ Camera error: ' + error.message + '\n\nTry:\n1. Reload the page\n2. Check camera permissions\n3. Use a different browser');
        }
    }
}    
    // Capture and analyze cover
    async function captureAndAnalyze() {
        if (!stream) return;
        
        const btn = document.getElementById('captureCoverBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>🔄</span><span>Analyzing...</span>';
        
        try {
            // Capture frame from video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            
            // Convert to base64
            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            const base64Image = imageData.split(',')[1];
            
            // Send to OpenAI Vision API
            const title = await recognizeWithAI(base64Image);
            
            if (title) {
                // Add to batch list
                addToBatchList(title);
                
                // Flash success
                document.getElementById('scannerPreview').style.background = '#10b981';
                setTimeout(() => {
                    document.getElementById('scannerPreview').style.background = '';
                }, 300);
                
                // Play success sound (optional)
                playSuccessSound();
                
            } else {
                alert('❌ Could not recognize movie title. Try again with better lighting.');
            }
            
        } catch (error) {
            console.error('Scan error:', error);
            alert('Error scanning cover: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
    
    // Send image to backend API (which uses OpenAI Vision API)
    // This keeps the API key secure on the server
    async function recognizeWithAI(base64Image) {
        // Call our backend API endpoint instead of OpenAI directly
        const response = await fetch('/api/api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'scan_cover_image',
                image: base64Image
            })
        });

        if (!response.ok) {
            throw new Error('Backend API request failed');
        }

        const result = await response.json();

        if (!result.ok) {
            throw new Error(result.error || 'Failed to recognize cover image');
        }

        const title = result.data?.title?.trim();

        if (!title || title === 'UNKNOWN') {
            return null;
        }

        return title;
    }
    
    // Add recognized title to batch list
    function addToBatchList(title) {
        const id = Date.now();
        scanList.push({ id, title, timestamp: new Date().toISOString() });
        
        // Save to localStorage
        saveBatchList();
        
        // Update UI
        renderBatchList();
        updateBatchCount();
    }
    
    // Remove from batch list
    function removeFromBatchList(id) {
        scanList = scanList.filter(item => item.id !== id);
        saveBatchList();
        renderBatchList();
        updateBatchCount();
    }
    
    // Render batch list UI
    function renderBatchList() {
        const container = document.getElementById('scanBatchList');
        
        if (scanList.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No titles scanned yet. Scan a cover to begin!</p>';
            return;
        }
        
        container.innerHTML = scanList.map(item => `
            <div class="scan-batch-item" data-id="${item.id}">
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">${item.title}</div>
                    <div style="font-size: 0.75rem; color: #666;">${new Date(item.timestamp).toLocaleTimeString()}</div>
                </div>
                <button onclick="CoverScanner.removeFromBatch(${item.id})" 
                        style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 1.2rem; padding: 0.5rem;" 
                        title="Remove">
                    ✕
                </button>
            </div>
        `).join('');
    }
    
    // Update batch count badge
    function updateBatchCount() {
        const badge = document.getElementById('scanBatchCount');
        if (badge) {
            badge.textContent = scanList.length;
            badge.style.display = scanList.length > 0 ? 'inline' : 'none';
        }
    }
    
    // Save batch list to localStorage
    function saveBatchList() {
        localStorage.setItem('cineshelf_scan_batch', JSON.stringify(scanList));
    }
    
    // Load batch list from localStorage
    function loadBatchList() {
        const saved = localStorage.getItem('cineshelf_scan_batch');
        if (saved) {
            scanList = JSON.parse(saved);
            renderBatchList();
            updateBatchCount();
        }
    }
    
    // Clear all scanned titles
    function clearBatch() {
        if (!confirm('Clear all scanned titles?')) return;
        
        scanList = [];
        saveBatchList();
        renderBatchList();
        updateBatchCount();
    }
    
// Process batch: add all to unresolved for TMDB matching
async function processBatch() {
    if (scanList.length === 0) {
        showToastIfAvailable('No titles to process yet — scan some covers first!', 'error');
        return;
    }

    const btn = document.getElementById('processBatchBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>Processing...</span>';

    try {
        const count = scanList.length;

        // Add each title as unresolved copy
        for (const item of scanList) {
            await fetch('/api/api.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    action: 'add_unresolved',
                    user: localStorage.getItem('cineshelf_user') || 'default',
                    title: item.title
                })
            });
        }

        // Clear batch
        scanList = [];
        saveBatchList();
        renderBatchList();
        updateBatchCount();

        // Close scanner and switch to resolve tab
        closeScanner();
        if (typeof App !== 'undefined') App.switchTab('resolve');
        showToastIfAvailable(`✅ ${count} title${count !== 1 ? 's' : ''} sent to Resolve tab`, 'success');

    } catch (error) {
        console.error('Process batch error:', error);
        showToastIfAvailable('Error processing batch: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>✅</span><span>Process Batch</span>';
    }
}

// Scan a group photo: detect all movie covers in one image and add to batch
async function scanMultiCover() {
    if (!stream) return;

    const btn = document.getElementById('scanGroupBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>🤖</span><span>Scanning…</span>';

    try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        const base64Image = imageData.split(',')[1];

        const preview = document.getElementById('scannerPreview');
        if (preview) { preview.style.background = '#667eea'; setTimeout(() => { preview.style.background = ''; }, 250); }

        const response = await fetch('/api/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan_multi_cover', image: base64Image })
        });
        const result = await response.json();

        if (!result.ok) throw new Error(result.error || 'Could not scan image');

        const titles = result.data?.titles || [];
        if (titles.length === 0) {
            showToastIfAvailable('No titles recognised. Try better lighting or move covers closer.', 'error');
            return;
        }

        titles.forEach(t => addToBatchList(t));
        playSuccessSound();
        if (preview) { preview.style.background = '#10b981'; setTimeout(() => { preview.style.background = ''; }, 400); }
        showToastIfAvailable(`📚 Found ${titles.length} title${titles.length !== 1 ? 's' : ''}!`, 'success');

    } catch (error) {
        console.error('scanMultiCover error:', error);
        showToastIfAvailable('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
    
    // Close scanner and stop camera
    function closeScanner() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        document.getElementById('coverScannerModal').classList.remove('active');
    }
    
    // Play success sound (optional)
    function playSuccessSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBi6Dzc+qZjUJG2S47+ilUhMJPJff8r9oHgU2jdPywHoqBSd+zPDaikIKE1616uSqWRQKRZ7g8btiHgU3kNTzv24fBSJ4y+/itVQUCkKd3/K7ZSEGLobN8sCCLAUme8vw3ZJACRZetenrq1sUCkCa3vG7YyEGLoPN8cB+LAUkedPwz5NACBZetOrrqlgTC0Ce3vK6ZSIGLobM8cF/LAQle8vw3JBBChZftOrtqFgTC0Gd3vK6ZiEGLobM8cGAKwUjfcvw3I9BCRV6',
            );
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {}
    }
    
    // ─────────────────────────────────────────────
    // SCAN & MATCH — immediate database lookup
    // ─────────────────────────────────────────────

    let activeMatchTab = 'tmdb';

    async function scanAndMatch() {
        if (!stream) return;

        const btn = document.getElementById('scanMatchBtn');
        const captureBtn = document.getElementById('captureCoverBtn');
        const originalText = btn.innerHTML;

        btn.disabled = true;
        captureBtn.disabled = true;
        btn.innerHTML = '<span>🤖</span><span>Identifying…</span>';

        try {
            // Capture frame from video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            const base64Image = imageData.split(',')[1];

            // Flash camera
            const preview = document.getElementById('scannerPreview');
            if (preview) { preview.style.background = '#667eea'; setTimeout(() => { preview.style.background = ''; }, 250); }

            // Step 1: AI title recognition
            const title = await recognizeWithAI(base64Image);

            if (!title) {
                alert('❌ Could not recognise movie title. Try better lighting or a cleaner angle.');
                return;
            }

            playSuccessSound();

            // Step 2: Show match panel and search
            btn.innerHTML = '<span>🔍</span><span>Searching…</span>';
            await showMatchPanel(title);

        } catch (error) {
            console.error('Scan & Match error:', error);
            alert('Error during Scan & Match: ' + error.message);
        } finally {
            btn.disabled = false;
            captureBtn.disabled = false;
            btn.innerHTML = '<span>🔍</span><span>Scan &amp; Match</span>';
        }
    }

    async function showMatchPanel(title) {
        // Switch right panel from batch → match
        const batchPanel = document.getElementById('scanBatchPanel');
        const matchPanel = document.getElementById('scanMatchPanel');
        if (batchPanel) batchPanel.style.display = 'none';
        if (matchPanel) matchPanel.style.display = 'flex';

        // Populate title display and search input
        const titleEl = document.getElementById('matchScannedTitle');
        const inputEl = document.getElementById('matchSearchInput');
        if (titleEl) titleEl.textContent = 'Identified: "' + title + '"';
        if (inputEl) inputEl.value = title;

        // Reset to TMDB tab and show loading
        switchMatchTab('tmdb');
        setMatchLoading();

        // Search
        await performMatchSearch(title);

        // On mobile: scroll the panel into view
        if (matchPanel) matchPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideMatchPanel() {
        const batchPanel = document.getElementById('scanBatchPanel');
        const matchPanel = document.getElementById('scanMatchPanel');
        if (matchPanel) matchPanel.style.display = 'none';
        if (batchPanel) batchPanel.style.display = 'flex';
    }

    function switchMatchTab(tab) {
        activeMatchTab = tab;
        ['tmdb', 'umdb', 'imdb', 'omdb'].forEach(t => {
            const btn = document.getElementById('smTab-' + t);
            const panel = document.getElementById('smPanel-' + t);
            if (btn) btn.classList.toggle('active', t === tab);
            if (panel) panel.style.display = t === tab ? (t === 'imdb' || t === 'omdb' ? 'block' : 'flex') : 'none';
        });
    }

    function setMatchLoading() {
        const loading = '<p style="text-align:center;padding:2rem;color:rgba(255,255,255,0.4);font-size:0.85rem;">Searching…</p>';
        const tmdb = document.getElementById('smPanel-tmdb');
        const umdb = document.getElementById('smPanel-umdb');
        if (tmdb) tmdb.innerHTML = loading;
        if (umdb) umdb.innerHTML = loading;
    }

    async function performMatchSearch(query) {
        try {
            const response = await fetch('/api/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'search_multi', query, include_umdb: true })
            });
            const result = await response.json();

            if (!result.ok) throw new Error(result.error || 'Search failed');

            const all = result.data || [];
            const tmdbResults = all.filter(r => !r.source || r.source === 'tmdb');
            const umdbResults = all.filter(r => r.source === 'umdb');

            renderMatchResults('smPanel-tmdb', tmdbResults);
            renderMatchResults('smPanel-umdb', umdbResults);

            // OMDB auto-search (will show "not configured" gracefully)
            fetchOmdb(query);

        } catch (error) {
            const errHtml = '<p style="text-align:center;padding:1.5rem;color:#f87171;font-size:0.85rem;">Search failed: ' + error.message + '</p>';
            const tmdb = document.getElementById('smPanel-tmdb');
            const umdb = document.getElementById('smPanel-umdb');
            if (tmdb) tmdb.innerHTML = errHtml;
            if (umdb) umdb.innerHTML = errHtml;
        }
    }

    async function reSearch() {
        const input = document.getElementById('matchSearchInput');
        if (!input) return;
        const query = input.value.trim();
        if (!query) return;
        setMatchLoading();
        await performMatchSearch(query);
        // Reset IMDb results if tab is open
        const imdbResults = document.getElementById('smImdbResults');
        if (imdbResults) imdbResults.innerHTML = '';
    }

    function renderMatchResults(containerId, results) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!results || results.length === 0) {
            container.innerHTML = '<p style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.35);font-size:0.85rem;">No results found</p>';
            return;
        }

        const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'44\' height=\'66\'%3E%3Crect fill=\'%23444\' width=\'44\' height=\'66\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23888\' font-size=\'10\'%3E🎬%3C/text%3E%3C/svg%3E';

        container.innerHTML = results.slice(0, 12).map(item => {
            const isTV = item.media_type === 'tv';
            const title = (isTV ? (item.name || item.title) : item.title) || 'Unknown Title';
            const releaseDate = isTV ? item.first_air_date : item.release_date;
            const year = releaseDate ? releaseDate.substring(0, 4) : '—';
            const rawPoster = item.poster_path;
            const posterUrl = rawPoster
                ? (rawPoster.startsWith('http') ? rawPoster : 'https://image.tmdb.org/t/p/w200' + rawPoster)
                : PLACEHOLDER;
            const mediaIcon = isTV ? '📺' : '🎬';
            const sourceLabel = item.source === 'umdb' ? ' · UMDB' : '';
            const rating = item.vote_average ? ' · ⭐ ' + Number(item.vote_average).toFixed(1) : '';
            const overview = item.overview ? item.overview.substring(0, 110) + '…' : '';
            const safeTitle = encodeURIComponent(title);
            const source = item.source || 'tmdb';
            const mediaType = item.media_type || 'movie';

            return `<div class="scan-match-card" onclick="CoverScanner.selectMatch(${JSON.stringify(item.id)}, '${safeTitle}', '${year}', '${mediaType}', '${source}')">
                <img src="${posterUrl}" alt="" onerror="this.src='${PLACEHOLDER}'">
                <div class="scan-match-card-info">
                    <div class="scan-match-card-title">${mediaIcon} ${title}</div>
                    <div class="scan-match-card-meta">${year}${rating}${sourceLabel}</div>
                    <div class="scan-match-card-overview">${overview}</div>
                </div>
            </div>`;
        }).join('');
    }

    async function lookupImdb() {
        const input = document.getElementById('imdbLookupInput');
        const resultsDiv = document.getElementById('smImdbResults');
        if (!input || !resultsDiv) return;

        const imdbId = input.value.trim();
        if (!imdbId) { alert('Enter an IMDb ID (e.g. tt0137523)'); return; }

        resultsDiv.innerHTML = '<p style="text-align:center;padding:1rem;color:rgba(255,255,255,0.4);font-size:0.85rem;">Looking up…</p>';

        try {
            const response = await fetch('/api/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'find_by_imdb', imdb_id: imdbId })
            });
            const result = await response.json();

            if (!result.ok || !result.data) {
                resultsDiv.innerHTML = '<p style="text-align:center;padding:1rem;color:#f87171;font-size:0.85rem;">No match found for <strong>' + imdbId + '</strong></p>';
                return;
            }

            // find_by_imdb returns a single item; wrap in array for renderMatchResults
            renderMatchResults('smImdbResults', [result.data]);
        } catch (error) {
            resultsDiv.innerHTML = '<p style="text-align:center;padding:1rem;color:#f87171;font-size:0.85rem;">Lookup failed: ' + error.message + '</p>';
        }
    }

    async function fetchOmdb(query) {
        const container = document.getElementById('smOmdbResults');
        if (!container) return;

        container.innerHTML = '<p style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.35);font-size:0.85rem;">Searching OMDB…</p>';

        try {
            const response = await fetch('/api/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'search_omdb', query })
            });
            const result = await response.json();

            if (!result.ok) {
                // Graceful: show setup note if not configured
                container.innerHTML = `<div style="padding:1.25rem;color:rgba(255,255,255,0.5);font-size:0.82rem;line-height:1.6;">
                    <strong style="color:rgba(255,255,255,0.75);">OMDB not configured</strong><br>
                    To enable OMDB results, add <code style="background:rgba(255,255,255,0.1);padding:0.1em 0.4em;border-radius:4px;">OMDB_API_KEY</code>
                    to your environment variables or <code style="background:rgba(255,255,255,0.1);padding:0.1em 0.4em;border-radius:4px;">config/secrets.php</code>.<br><br>
                    Get a free key at <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" style="color:#667eea;">omdbapi.com</a>.
                </div>`;
                return;
            }

            const items = result.data || [];
            if (items.length === 0) {
                container.innerHTML = '<p style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.35);font-size:0.85rem;">No OMDB results found</p>';
                return;
            }

            // Render OMDB results (normalised to match our card format)
            renderMatchResults('smOmdbResults', items);

        } catch (error) {
            container.innerHTML = '<p style="text-align:center;padding:1rem;color:#f87171;font-size:0.85rem;">OMDB search failed</p>';
        }
    }

    async function selectMatch(rawId, encodedTitle, year, mediaType, source) {
        const title = decodeURIComponent(encodedTitle);
        const mediaIcon = mediaType === 'tv' ? '📺' : '🎬';
        const sourceTag = source === 'omdb' ? ' (via OMDB/IMDb)' : source === 'umdb' ? ' (UMDB)' : '';

        try {
            const user = localStorage.getItem('cineshelf_user') || 'default';
            let tmdbId = String(rawId);

            // OMDB results carry an IMDb ID (tt...) — resolve to TMDB first
            if (source === 'omdb' && tmdbId.startsWith('tt')) {
                const lookupResp = await fetch('/api/api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'find_by_imdb', imdb_id: tmdbId })
                });
                const lookupResult = await lookupResp.json();
                if (!lookupResult.ok || !lookupResult.data) {
                    throw new Error('Could not resolve IMDb ID to TMDB. Try searching via TMDB tab instead.');
                }
                tmdbId = String(lookupResult.data.id);
                mediaType = lookupResult.data.media_type || mediaType;
            }

            const response = await fetch('/api/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_copy',
                    user,
                    tmdb_id: tmdbId,
                    media_type: mediaType,
                    format: 'DVD',
                    condition: 'Good'
                })
            });
            const result = await response.json();

            if (!result.ok) throw new Error(result.error || 'Failed to add to collection');

            playSuccessSound();
            showToastIfAvailable(`✅ ${mediaIcon} "${title}" added!`, 'success');

            // Flash the preview green, then go back to the camera ready to scan the next cover
            const preview = document.getElementById('scannerPreview');
            if (preview) {
                preview.style.background = '#10b981';
                setTimeout(() => { preview.style.background = ''; }, 400);
            }

            // Return to camera (don't close — user exits manually)
            hideMatchPanel();

            // Refresh collection silently in background
            if (typeof App !== 'undefined' && typeof App.loadCollection === 'function') {
                App.loadCollection();
            }

        } catch (error) {
            console.error('selectMatch error:', error);
            showToastIfAvailable('Error adding to collection: ' + error.message, 'error');
        }
    }

    // Best-effort toast helper (App may not be loaded yet in all contexts)
    function showToastIfAvailable(message, type) {
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else if (typeof App !== 'undefined' && typeof App.showToast === 'function') {
            App.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // Public API
    return {
        open: openScanner,
        close: closeScanner,
        capture: captureAndAnalyze,
        removeFromBatch: removeFromBatchList,
        clearBatch: clearBatch,
        processBatch: processBatch,
        loadBatch: loadBatchList,
        // Scan & Match
        scanAndMatch: scanAndMatch,
        hideMatchPanel: hideMatchPanel,
        switchMatchTab: switchMatchTab,
        reSearch: reSearch,
        lookupImdb: lookupImdb,
        selectMatch: selectMatch,
        scanMultiCover: scanMultiCover
    };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    CoverScanner.loadBatch();
});