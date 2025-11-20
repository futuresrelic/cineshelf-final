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

    const settings = JSON.parse(localStorage.getItem('cineshelf_settings') || '{}');
    if (!settings.openaiKey) {
        alert('⚠️ OpenAI API key required!\n\nGo to Settings tab and add your OpenAI API key first.');
        return;
    }

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
    
    // Send image to OpenAI Vision API
    async function recognizeWithAI(base64Image) {
        const settings = JSON.parse(localStorage.getItem('cineshelf_settings') || '{}');
        const apiKey = settings.openaiKey;
        
        if (!apiKey) {
            throw new Error('OpenAI API key not found');
        }
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'This is a DVD or Blu-ray cover. Extract ONLY the movie title. Return just the title, nothing else. If you cannot determine the title, return "UNKNOWN".'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 50
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }
        
        const data = await response.json();
        const title = data.choices[0]?.message?.content?.trim();
        
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
        alert('No titles to process!');
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
        
        // Close scanner
        closeScanner();
        
        // Switch to resolve tab
        App.switchTab('resolve');
        
        alert(`✅ ${count} titles added to Resolve tab!\n\nNow match each title with TMDB.`);
        
    } catch (error) {
        console.error('Process batch error:', error);
        alert('Error processing batch: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>✅</span><span>Process Batch</span>';
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
    
    // Public API
    return {
        open: openScanner,
        close: closeScanner,
        capture: captureAndAnalyze,
        removeFromBatch: removeFromBatchList,
        clearBatch: clearBatch,
        processBatch: processBatch,
        loadBatch: loadBatchList
    };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    CoverScanner.loadBatch();
});