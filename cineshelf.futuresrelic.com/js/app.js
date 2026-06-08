// CineShelf - Frontend Application
// Clean architecture inspired by ChoreQuest
// Version: Managed by version-manager.html (see version.json)

// VersionGuard: this constant must match version.json on every frontend-touching commit.
const APP_VERSION = '2.9.1';

// Inline SVG placeholder — no network request, no 404 errors
const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 92 138' width='92' height='138'%3E%3Crect fill='%23331a4a' width='92' height='138'/%3E%3Crect fill='%23553c7b' x='8' y='12' width='76' height='114' rx='5'/%3E%3Ctext x='46' y='76' text-anchor='middle' dominant-baseline='middle' fill='rgba(255,255,255,0.4)' font-size='36' font-family='sans-serif'%3E%3F%3C%2Ftext%3E%3C%2Fsvg%3E";

async function checkVersionGuard() {
    try {
        const r = await fetch('/get-version.php?t=' + Date.now());
        if (!r.ok) return;
        const data = await r.json();
        const serverVer = data.version || '';
        if (serverVer && serverVer !== APP_VERSION) {
            console.warn('[VersionGuard] Version mismatch — server=' + serverVer + ' script=' + APP_VERSION + '. version.json was not bumped after a frontend change.');
        }
    } catch (_) { /* network errors are non-fatal */ }
}

// Genre Emoji Mapping
const GENRE_EMOJIS = {
    'Action': '💥',
    'Adventure': '🗺️',
    'Animation': '🎨',
    'Comedy': '😂',
    'Crime': '🔫',
    'Documentary': '📹',
    'Drama': '🎭',
    'Family': '👨‍👩‍👧‍👦',
    'Fantasy': '🔮',
    'History': '📜',
    'Horror': '😱',
    'Music': '🎵',
    'Mystery': '🔍',
    'Romance': '💕',
    'Science Fiction': '🚀',
    'Thriller': '🎬',
    'TV Movie': '📺',
    'War': '⚔️',
    'Western': '🤠'
};

// Convert genre string to emoji string
function getGenreEmojis(genreString) {
    if (!genreString) return '';
    return genreString.split(',')
        .map(g => g.trim())
        .map(g => GENRE_EMOJIS[g] || '🎬')
        .join(' ');
}

// Get certification badge color
function getCertColor(cert) {
    const colors = {
        'G': '#4caf50',
        'PG': '#2196f3',
        'PG-13': '#ff9800',
        'R': '#f44336',
        'NC-17': '#9c27b0',
        'TV-Y': '#4caf50',
        'TV-Y7': '#4caf50',
        'TV-G': '#4caf50',
        'TV-PG': '#2196f3',
        'TV-14': '#ff9800',
        'TV-MA': '#f44336'
    };
    return colors[cert] || '#666';
}

// Format runtime
function formatRuntime(minutes) {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

// Safe HTML escaping — used throughout the UI for untrusted strings
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const App = (function() {
    
    // State
    let currentUser = localStorage.getItem('cineshelf_user') || 'default';
    let currentTab = 'collection';
    let currentView = 'grid';
    let currentCollectionSubview = 'movies'; // 'movies' | 'wishlist' | 'physical'
    let collection = [];
    let originalCollection = []; // Store full collection for filtering
    let wishlist = [];
    let originalWishlist = []; // Store full wishlist for filtering
    let collectionDirty = false; // Flag: collection data changed but grid not re-rendered
    let copyManagerMovieId = null; // Track which movie the copy manager is editing
    let containerMemberships = {}; // movie_id → [container_name, ...] for 📦 badge
    let shelves = []; // Store shelves for filtering
    let settings = {};
    let selectedMovie = null;
    
    // API Configuration
    const API_URL = '/api/api.php';
    
    // ========================================
    // LOADING / BUSY INDICATOR
    // Prevents double-clicks, shows activity
    // ========================================

    let _busyCount = 0;
    const _busyButtons = new WeakSet();

    function showBusy(msg) {
        _busyCount++;
        const el = document.getElementById('globalLoader');
        if (el) {
            el.querySelector('.loader-text').textContent = msg || 'Working…';
            el.classList.add('active');
        }
    }

    function hideBusy() {
        _busyCount = Math.max(0, _busyCount - 1);
        if (_busyCount === 0) {
            const el = document.getElementById('globalLoader');
            if (el) el.classList.remove('active');
        }
    }

    // Wraps any async onclick handler to prevent double-clicks and show a spinner
    function busyClick(handler, btnElement) {
        if (_busyButtons.has(btnElement)) return; // already running
        _busyButtons.add(btnElement);
        const origText = btnElement.textContent;
        btnElement.disabled = true;
        btnElement.style.opacity = '0.6';
        const run = async () => {
            try { await handler(); }
            finally {
                btnElement.disabled = false;
                btnElement.style.opacity = '';
                _busyButtons.delete(btnElement);
            }
        };
        run();
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    async function init() {
        console.log('CineShelf v2.0 initializing...');

        // Wait for auth to be ready if needed
        let authUser = Auth.getCurrentUser();
        if (!authUser) {
            // Auth might still be initializing, wait for it
            console.log('Waiting for auth to complete...');
            authUser = await Auth.init();
        }

        if (authUser) {
            currentUser = authUser.username || authUser.email;

            // Update Settings tab with OAuth account info
            const usernameInput = document.getElementById('settingUsername');
            if (usernameInput) {
                usernameInput.value = authUser.email || authUser.username;
            }

            // Update display name input
            const displayNameInput = document.getElementById('settingDisplayName');
            if (displayNameInput) {
                displayNameInput.value = authUser.display_name || authUser.username || authUser.email || '';
            }

            // Show OAuth provider if available
            if (authUser.oauth_provider) {
                const providerRow = document.getElementById('oauthProviderRow');
                const providerIcon = document.getElementById('oauthProviderIcon');
                const providerName = document.getElementById('oauthProviderName');

                if (providerRow && providerIcon && providerName) {
                    providerRow.style.display = 'block';
                    if (authUser.oauth_provider === 'google') {
                        providerIcon.textContent = '🔵';
                        providerName.textContent = 'Google';
                    } else {
                        providerIcon.textContent = '🔑';
                        providerName.textContent = authUser.oauth_provider;
                    }
                }
            }

            // Initialize public collection settings
            initPublicSettings(authUser);

            // Show first-run onboarding if never seen
            _maybeShowOnboarding(authUser);
        }

        // Load settings
    loadSettings();
    loadBrandSettings();

    // Apply stored theme immediately (before any rendering)
    if (settings.theme && settings.theme !== 'midnight') {
        document.documentElement.setAttribute('data-theme', settings.theme);
    }
    // Apply stored light/dark mode
    if (settings.themeMode === 'light') {
        document.documentElement.setAttribute('data-theme-mode', 'light');
        const btn = document.getElementById('themeModeToggle');
        if (btn) btn.textContent = '☀️';
    }
    // Measure sticky header + collection bar height now and on resize
    updateHeaderHeight();
    updateStickyBarHeight();
    window.addEventListener('resize', () => { updateHeaderHeight(); updateStickyBarHeight(); });

    // Set dropdown values from settings before loading data
    const sortDropdown = document.getElementById('sortBy');
    const settingsDropdown = document.getElementById('settingDefaultSort');
    const defaultSort = settings.defaultSort || 'title';

    if (sortDropdown) {
        sortDropdown.value = defaultSort;
    }
    if (settingsDropdown) {
        settingsDropdown.value = defaultSort;
    }

    // Restore view, region, and classification settings dropdowns
    const viewDropdown = document.getElementById('settingDefaultView');
    if (viewDropdown && settings.defaultView) viewDropdown.value = settings.defaultView;

    const certRegionDropdown = document.getElementById('settingCertRegion');
    if (certRegionDropdown) certRegionDropdown.value = settings.certRegion || 'US';

    const physRegionDropdown = document.getElementById('settingDefaultPhysicalRegion');
    if (physRegionDropdown) physRegionDropdown.value = settings.defaultPhysicalRegion || '';

    // Migrate legacy autoSpineColors boolean to new spineColorMode string
    if (!settings.spineColorMode) {
        settings.spineColorMode = (settings.autoSpineColors === false) ? 'format' : 'shelf';
    }
    const spineColorModeDropdown = document.getElementById('settingSpineColorMode');
    if (spineColorModeDropdown) spineColorModeDropdown.value = settings.spineColorMode || 'shelf';

    // Restore active theme swatch
    const activeTheme = settings.theme || 'midnight';
    document.querySelectorAll('.theme-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.theme === activeTheme);
    });

    // Build bottom nav and nav picker
    buildBottomNav();
    renderNavPicker();

    // Load data (sorting will be applied automatically)
    loadCollection();
    loadWishlist();
    loadGroups();
    loadShelves(); // Load shelves to populate dropdown
    loadLayoutProfiles(); // Load layout profiles for selector
    _initPackagingToggles(); // Wire up packaging checkbox toggles

        // Apply saved view preferences
        if (settings.defaultView) {
            setView(settings.defaultView);
        }

        // Modal scroll lock — prevent background from scrolling when a modal is open
        // Only save scroll position on the FIRST modal open (not when stacking modals)
        const observer = new MutationObserver(() => {
            const anyActive = document.querySelector('.modal.active');
            if (anyActive) {
                if (!document.body.classList.contains('modal-open')) {
                    // First modal opening — save the real scroll position
                    document.body._scrollY = window.scrollY;
                    document.body.classList.add('modal-open');
                    document.body.style.top = `-${document.body._scrollY}px`;
                }
                // If already modal-open, don't overwrite saved scroll position
            } else {
                document.body.classList.remove('modal-open');
                document.body.style.top = '';
                if (document.body._scrollY !== undefined) {
                    window.scrollTo(0, document.body._scrollY);
                }
            }
        });
        document.querySelectorAll('.modal').forEach(modal => {
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        });

        // Close user menu when clicking outside
        document.addEventListener('click', function(e) {
            const menu = document.getElementById('userMenu');
            if (menu && !menu.contains(e.target)) {
                menu.classList.remove('open');
            }
        });

        // Handle redirect from URL Reader tool (?openAmazonImport=1)
        if (new URLSearchParams(window.location.search).get('openAmazonImport') === '1') {
            const hasSavedText = !!sessionStorage.getItem('cineshelf_amazon_paste_text');
            showToast(
                hasSavedText
                    ? '📋 Amazon text is ready — open a copy and use "🛒 Import from Amazon" to load it'
                    : '📋 Open a copy and use "🛒 Import from Amazon" → Paste Text tab',
                'info'
            );
            // Clean up the query param without a page reload
            history.replaceState({}, '', window.location.pathname);
        }

        // Handle UMDB deep-link: ?action=add&tmdb_id=123&title=The+Godfather&year=1972
        _handleDeepLink();

        console.log('CineShelf ready!');
    }
    
    // ========================================
    // API CALLS
    // ========================================
    
    async function apiCall(action, data = {}) {
    showBusy();
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({
                action: action,
                ...data
            })
        });

        const result = await response.json();

        if (!result.ok) {
            const error = new Error(result.error || 'API request failed');
            error.data = result.data;
            throw error;
        }

        return result.data;

    } catch (error) {
        console.error('API Error:', error);
        showToast('Error: ' + error.message, 'error');
        throw error;
    } finally {
        hideBusy();
    }
}
    
    // ========================================
    // COLLECTION MANAGEMENT
    // ========================================
    
    async function loadCollection() {
    try {
        const [data, memberships] = await Promise.all([
            apiCall('list_collection'),
            apiCall('get_container_memberships').catch(() => [])
        ]);

        // Build movie_id → container_name map for badge display
        containerMemberships = {};
        (memberships || []).forEach(m => {
            if (!containerMemberships[m.movie_id]) {
                containerMemberships[m.movie_id] = [];
            }
            containerMemberships[m.movie_id].push(m.container_name);
        });
        
        // Group movies by movie_id
        const grouped = {};
        data.forEach(item => {
            if (!grouped[item.movie_id]) {
                grouped[item.movie_id] = {
                    movie: item,
                    copies: []
                };
            }
            grouped[item.movie_id].copies.push(item);
        });
        
        collection = Object.values(grouped);
        originalCollection = [...collection]; // Store original for shelf filtering

        // Apply default sort after loading data
        const defaultSort = settings.defaultSort || 'title';
        sortMovies('collection', defaultSort);

        // Initialize filter UI if visible
        if (document.getElementById('filterControls')?.style.display !== 'none') {
            updateFilterUI();
        }
        updateBadges();
        
    } catch (error) {
        console.error('Failed to load collection:', error);
        showToast('Failed to load your collection. Try refreshing.', 'error');
    }
}
    
// Get unique directors from collection
function getUniqueDirectors() {
    const directors = new Set();
    collection.forEach(group => {
        if (group.movie.director) {
            directors.add(group.movie.director);
        }
    });
    return Array.from(directors).sort();
}

// Get unique genres from collection
function getUniqueGenres() {
    const genres = new Set();
    collection.forEach(group => {
        if (group.movie.genre) {
            group.movie.genre.split(',').forEach(g => {
                genres.add(g.trim());
            });
        }
    });
    return Array.from(genres).sort();
}

// Get unique certifications from collection
function getUniqueCertifications() {
    const certs = new Set();
    collection.forEach(group => {
        if (group.movie.certification) {
            certs.add(group.movie.certification);
        }
    });
    return Array.from(certs).sort();
}

// Get unique actors from collection
function getUniqueActors() {
    const actors = new Set();
    collection.forEach(group => {
        if (group.movie.actors) {
            // Actors may be comma-separated string
            if (typeof group.movie.actors === 'string') {
                group.movie.actors.split(',').forEach(a => {
                    const actor = a.trim();
                    if (actor) actors.add(actor);
                });
            }
        }
        // Also check cast array if it exists
        if (group.movie.cast && Array.isArray(group.movie.cast)) {
            group.movie.cast.forEach(actor => {
                if (actor.name) actors.add(actor.name);
            });
        }
    });
    return Array.from(actors).sort();
}

// Get unique studios from collection
function getUniqueStudios() {
    const studios = new Set();
    collection.forEach(group => {
        if (group.movie.studio) {
            studios.add(group.movie.studio);
        }
        // Also check production_companies if it exists
        if (group.movie.production_companies) {
            if (typeof group.movie.production_companies === 'string') {
                group.movie.production_companies.split(',').forEach(s => {
                    const studio = s.trim();
                    if (studio) studios.add(studio);
                });
            } else if (Array.isArray(group.movie.production_companies)) {
                group.movie.production_companies.forEach(company => {
                    if (company.name) studios.add(company.name);
                });
            }
        }
    });
    return Array.from(studios).sort();
}

// Current filter state — persisted to sessionStorage so filters survive tab switches
// but reset on full page reload (intentional: filters shouldn't haunt you between sessions)
const _defaultFilters = {
    search: '',
    director: 'all',
    actor: 'all',
    studio: 'all',
    genre: 'all',
    certification: 'all',
    yearMin: null,
    yearMax: null
};

function _saveFilters() {
    try { sessionStorage.setItem('cineshelf_filters', JSON.stringify(currentFilters)); } catch (_) {}
}

function _restoreFilterUI() {
    const el = id => document.getElementById(id);
    if (el('filterSearch'))       el('filterSearch').value       = currentFilters.search || '';
    if (el('filterDirector'))     el('filterDirector').value     = currentFilters.director || 'all';
    if (el('filterActor'))        el('filterActor').value        = currentFilters.actor || 'all';
    if (el('filterStudio'))       el('filterStudio').value       = currentFilters.studio || 'all';
    if (el('filterGenre'))        el('filterGenre').value        = currentFilters.genre || 'all';
    if (el('filterCertification'))el('filterCertification').value= currentFilters.certification || 'all';
    if (el('filterYearMin'))      el('filterYearMin').value      = currentFilters.yearMin || '';
    if (el('filterYearMax'))      el('filterYearMax').value      = currentFilters.yearMax || '';
}

let currentFilters = (() => {
    try {
        const saved = sessionStorage.getItem('cineshelf_filters');
        return saved ? { ..._defaultFilters, ...JSON.parse(saved) } : { ..._defaultFilters };
    } catch (_) { return { ..._defaultFilters }; }
})();

// Apply filters to collection
function applyFilters() {
    let filtered = [...collection];

    // Filter by search term
    if (currentFilters.search && currentFilters.search.trim()) {
        const searchTerm = currentFilters.search.toLowerCase().trim();
        filtered = filtered.filter(group => {
            const title = (group.movie.title || '').toLowerCase();
            const displayTitle = (group.movie.display_title || '').toLowerCase();
            return title.includes(searchTerm) || displayTitle.includes(searchTerm);
        });
    }

    // Filter by director
    if (currentFilters.director !== 'all') {
        filtered = filtered.filter(group =>
            group.movie.director === currentFilters.director
        );
    }

    // Filter by actor
    if (currentFilters.actor !== 'all') {
        filtered = filtered.filter(group => {
            const movie = group.movie;
            // Check actors string
            if (movie.actors && typeof movie.actors === 'string') {
                if (movie.actors.includes(currentFilters.actor)) return true;
            }
            // Check cast array
            if (movie.cast && Array.isArray(movie.cast)) {
                if (movie.cast.some(actor => actor.name === currentFilters.actor)) return true;
            }
            return false;
        });
    }

    // Filter by studio
    if (currentFilters.studio !== 'all') {
        filtered = filtered.filter(group => {
            const movie = group.movie;
            // Check studio field
            if (movie.studio === currentFilters.studio) return true;
            // Check production_companies string
            if (movie.production_companies && typeof movie.production_companies === 'string') {
                if (movie.production_companies.includes(currentFilters.studio)) return true;
            }
            // Check production_companies array
            if (movie.production_companies && Array.isArray(movie.production_companies)) {
                if (movie.production_companies.some(company => company.name === currentFilters.studio)) return true;
            }
            return false;
        });
    }

    // Filter by genre
    if (currentFilters.genre !== 'all') {
        filtered = filtered.filter(group =>
            group.movie.genre && group.movie.genre.includes(currentFilters.genre)
        );
    }

    // Filter by certification
    if (currentFilters.certification !== 'all') {
        filtered = filtered.filter(group =>
            group.movie.certification === currentFilters.certification
        );
    }

    // Filter by year range
    if (currentFilters.yearMin) {
        filtered = filtered.filter(group =>
            group.movie.year >= currentFilters.yearMin
        );
    }
    
    if (currentFilters.yearMax) {
        filtered = filtered.filter(group => 
            group.movie.year <= currentFilters.yearMax
        );
    }
    
    return filtered;
}

let ignoreArticles = false;

function _sortTitle(title) {
    if (!ignoreArticles) return title || '';
    return (title || '').replace(/^(the|a|an)\s+/i, '');
}

function toggleIgnoreArticles(on) {
    ignoreArticles = on;
    const sel = document.getElementById('sortBySelect');
    if (sel) sortMoviesEnhanced(sel.value);
}

// Enhanced sort function with new options
function sortMoviesEnhanced(sortBy) {
    let filtered = applyFilters();

    filtered.sort((a, b) => {
        const movieA = a.movie;
        const movieB = b.movie;

        switch (sortBy) {
            case 'title':
                return _sortTitle(movieA.title).localeCompare(_sortTitle(movieB.title));
            case 'title-desc':
                return _sortTitle(movieB.title).localeCompare(_sortTitle(movieA.title));
            case 'year':
                return (movieA.year || 0) - (movieB.year || 0);
            case 'year-desc':
                return (movieB.year || 0) - (movieA.year || 0);
            case 'rating':
                return (movieA.rating || 0) - (movieB.rating || 0);
            case 'rating-desc':
                return (movieB.rating || 0) - (movieA.rating || 0);
            case 'director':
                return (movieA.director || 'ZZZ').localeCompare(movieB.director || 'ZZZ');
            case 'director-desc':
                return (movieB.director || 'ZZZ').localeCompare(movieA.director || 'ZZZ');
            case 'runtime':
                return (movieA.runtime || 0) - (movieB.runtime || 0);
            case 'runtime-desc':
                return (movieB.runtime || 0) - (movieA.runtime || 0);
            case 'certification':
                return (movieA.certification || 'ZZZ').localeCompare(movieB.certification || 'ZZZ');
            case 'added':
                return (a.copies[0]?.created_at || '').localeCompare(b.copies[0]?.created_at || '');
            case 'added-desc':
                return (b.copies[0]?.created_at || '').localeCompare(a.copies[0]?.created_at || '');
            default:
                return 0;
        }
    });
    
    // Temporarily replace collection with filtered result
    const originalCollection = collection;
    collection = filtered;
    renderCollection();
    collection = originalCollection; // Restore for next operation
}

// Update filter UI
function updateFilterUI() {
    const directorSelect = document.getElementById('filterDirector');
    const actorSelect = document.getElementById('filterActor');
    const studioSelect = document.getElementById('filterStudio');
    const genreSelect = document.getElementById('filterGenre');
    const certSelect = document.getElementById('filterCertification');

    if (directorSelect) {
        const directors = getUniqueDirectors();
        directorSelect.innerHTML = '<option value="all">All Directors</option>' +
            directors.map(d => `<option value="${d}">${d}</option>`).join('');
    }

    if (actorSelect) {
        const actors = getUniqueActors();
        actorSelect.innerHTML = '<option value="all">All Actors</option>' +
            actors.map(a => `<option value="${a}">${a}</option>`).join('');
    }

    if (studioSelect) {
        const studios = getUniqueStudios();
        studioSelect.innerHTML = '<option value="all">All Studios</option>' +
            studios.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    if (genreSelect) {
        const genres = getUniqueGenres();
        genreSelect.innerHTML = '<option value="all">All Genres</option>' +
            genres.map(g => `<option value="${g}">${g}</option>`).join('');
    }

    if (certSelect) {
        const certs = getUniqueCertifications();
        certSelect.innerHTML = '<option value="all">All Ratings</option>' +
            certs.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

// Reset filters
function resetFilters() {
    currentFilters = { ..._defaultFilters };
    _saveFilters();
    _restoreFilterUI();
    sortMoviesEnhanced('title');
}

function renderCollection() {
    const grid = document.getElementById('collectionGrid');
    const empty = document.getElementById('emptyCollection');
    
    if (!grid) return;
    
    if (collection.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }
    
    grid.style.display = 'grid';
    empty.style.display = 'none';

    // Capture ordered list for prev/next nav
    collectionNavList = collection.map(g => g.movie.movie_id);

    grid.innerHTML = collection.map(group => {
        const movie = group.movie;
        const copyCount = group.copies.length;
        const posterUrl = movie.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
        const displayTitle = movie.display_title || movie.title || 'Unknown';
        const safeTitle = displayTitle.replace(/"/g, '&quot;');
        const mediaIcon = movie.media_type === 'tv' ? '📺' : '🎬';

        // Box-set membership badge
        const bsNames = containerMemberships[movie.movie_id];
        const bsTitle = bsNames ? bsNames.join(', ') : '';

        // Get genre emojis
        const genreEmojis = getGenreEmojis(movie.genre);

        // Get cert color
        const certColor = movie.certification ? getCertColor(movie.certification) : '#666';

        // Format runtime
        const runtimeFormatted = formatRuntime(movie.runtime);

        // Conditional rendering based on currentView
        if (currentView === 'list') {
            // Simplified list view - essential metadata only
            return `
            <div class="movie-card collection-card" data-movie-id="${movie.movie_id}" onclick="App.openMovieWithNav(${movie.movie_id}, 'collection')" style="cursor: pointer;">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${copyCount > 1 ? `<div class="copy-count-badge">${copyCount} copies</div>` : ''}
                    ${bsNames ? `<div class="boxset-member-badge" title="In box set: ${bsTitle}">📦</div>` : ''}
                </div>
                <div class="movie-info">
                    <h3 class="movie-title">${mediaIcon} ${safeTitle}</h3>
                    <div class="movie-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge" style="--cert-color: ${certColor};">${movie.certification}</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${movie.rating.toFixed(1)}</span>` : ''}
                        ${runtimeFormatted ? `<span>${runtimeFormatted}</span>` : ''}
                    </div>
                </div>
                <div class="movie-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); App.openMovieWithNav(${movie.movie_id}, 'collection');" title="Details">👁️</button>
                    ${copyCount > 1 ?
                        `<button class="btn-icon" onclick="event.stopPropagation(); App.openCopyManager(${movie.movie_id});" title="Manage">📋</button>` :
                        `<button class="btn-icon" onclick="event.stopPropagation(); App.deleteCopy(${group.copies[0].copy_id}, ${movie.movie_id});" title="Delete">🗑️</button>`
                    }
                </div>
            </div>
            `;
        } else {
            // Netflix-style for grid and compact views (hover overlay)
            return `
            <div class="movie-card" data-movie-id="${movie.movie_id}" onclick="App.openMovieWithNav(${movie.movie_id}, 'collection')" style="cursor: pointer;">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${copyCount > 1 ? `<div class="copy-count-badge">${copyCount} copies</div>` : ''}
                    ${bsNames ? `<div class="boxset-member-badge" title="In box set: ${bsTitle}">📦</div>` : ''}
                </div>

                <!-- ✨ NETFLIX HOVER OVERLAY -->
                <div class="hover-overlay">
                    <div class="hover-title">${safeTitle}</div>
                    <div class="hover-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge-hover" style="--cert-color: ${certColor};">${movie.certification}</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${movie.rating.toFixed(1)}</span>` : ''}
                        ${runtimeFormatted ? `<span>${runtimeFormatted}</span>` : ''}
                    </div>
                    ${genreEmojis ? `<div class="genre-emojis">${genreEmojis}</div>` : ''}
                    ${movie.director ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">🎬 ${movie.director}</div>` : ''}
                    <div class="hover-actions">
                        <button class="hover-btn" onclick="event.stopPropagation(); App.openMovieWithNav(${movie.movie_id}, 'collection');" title="Details">👁️</button>
                        ${copyCount > 1 ?
                            `<button class="hover-btn" onclick="event.stopPropagation(); App.openCopyManager(${movie.movie_id});" title="Manage">📋</button>` :
                            `<button class="hover-btn" onclick="event.stopPropagation(); App.deleteCopy(${group.copies[0].copy_id}, ${movie.movie_id});" title="Delete">🗑️</button>`
                        }
                    </div>
                </div>

                <div class="movie-info">
                    <h3 class="movie-title">${mediaIcon} ${safeTitle}</h3>
                </div>
            </div>
            `;
        }
    }).join('');
}

    // ========================================
    // SHELF FILTERING
    // ========================================

    async function filterByShelf() {
        const shelfFilter = document.getElementById('shelfFilter');
        const selectedShelfId = shelfFilter.value;

        if (!selectedShelfId) {
            // Show all movies
            collection = [...originalCollection];
            renderCollection();
            return;
        }

        try {
            // Get shelf contents with hierarchical aggregation
            const shelfId = parseInt(selectedShelfId);
            const shelfContents = await apiCall('get_shelf_contents', { shelf_id: shelfId });

            // Get all child shelves recursively
            const getAllChildShelves = (parentId) => {
                const children = shelves.filter(s => s.parent_shelf_id === parentId);
                let allChildren = [...children];
                children.forEach(child => {
                    allChildren = allChildren.concat(getAllChildShelves(child.id));
                });
                return allChildren;
            };

            const childShelves = getAllChildShelves(shelfId);
            const childShelfIds = childShelves.map(s => s.id);

            // Get contents for all child shelves
            const childContents = await Promise.all(
                childShelfIds.map(id => apiCall('get_shelf_contents', { shelf_id: id }).catch(() => []))
            );

            // Combine all movies
            let allMovies = [...shelfContents];
            childContents.forEach(contents => {
                allMovies = allMovies.concat(contents);
            });

            // Deduplicate by movie_id
            const uniqueMovieIds = new Set();
            const uniqueMovies = [];
            allMovies.forEach(movie => {
                if (!uniqueMovieIds.has(movie.movie_id)) {
                    uniqueMovieIds.add(movie.movie_id);
                    uniqueMovies.push(movie);
                }
            });

            // Filter original collection to only show movies in this shelf
            collection = originalCollection.filter(group =>
                uniqueMovieIds.has(group.movie.movie_id)
            );

            renderCollection();

        } catch (error) {
            console.error('Failed to filter by shelf:', error);
            showToast('Failed to filter by shelf', 'error');
        }
    }

    function populateShelfDropdown() {
        const shelfFilter = document.getElementById('shelfFilter');
        if (!shelfFilter) return;

        // Build hierarchical shelf structure
        const topLevelShelves = shelves.filter(s => !s.parent_shelf_id);
        const childShelvesByParent = {};

        shelves.forEach(shelf => {
            if (shelf.parent_shelf_id) {
                if (!childShelvesByParent[shelf.parent_shelf_id]) {
                    childShelvesByParent[shelf.parent_shelf_id] = [];
                }
                childShelvesByParent[shelf.parent_shelf_id].push(shelf);
            }
        });

        // Recursive function to build options with indentation
        const buildOptions = (shelfList, level = 0) => {
            let html = '';
            shelfList.forEach(shelf => {
                const indent = '&nbsp;&nbsp;'.repeat(level);
                html += `<option value="${shelf.id}">${indent}${shelf.name}</option>`;

                // Add children
                const children = childShelvesByParent[shelf.id] || [];
                if (children.length > 0) {
                    html += buildOptions(children, level + 1);
                }
            });
            return html;
        };

        shelfFilter.innerHTML = '<option value="">All Movies</option>' + buildOptions(topLevelShelves);
    }

    function sortMovies(type, sortBy) {
        console.log(`sortMovies called: type=${type}, sortBy=${sortBy}`);

        if (type === 'collection') {
            console.log('Collection before sort:', collection.map(g => ({
                title: g.movie.title,
                year: g.movie.year,
                rating: g.movie.rating,
                created_at: g.copies[0]?.created_at
            })));
            
            // Sort collection (grouped movies)
            collection.sort((a, b) => {
                const movieA = a.movie;
                const movieB = b.movie;
                
                switch (sortBy) {
                    case 'title':
                        return (movieA.display_title || movieA.title || '').localeCompare(movieB.display_title || movieB.title || '');
                    case 'title-desc':
                        return (movieB.display_title || movieB.title || '').localeCompare(movieA.display_title || movieA.title || '');
                    case 'year':
                        return (movieA.year || 0) - (movieB.year || 0);
                    case 'year-desc':
                        return (movieB.year || 0) - (movieA.year || 0);
                    case 'rating':
                        return (movieA.rating || 0) - (movieB.rating || 0);
                    case 'rating-desc':
                        return (movieB.rating || 0) - (movieA.rating || 0);
                    case 'runtime':
                        return (movieA.runtime || 0) - (movieB.runtime || 0);
                    case 'runtime-desc':
                        return (movieB.runtime || 0) - (movieA.runtime || 0);
                    case 'certification':
                        const certOrder = { 'G': 1, 'PG': 2, 'PG-13': 3, 'R': 4, 'NC-17': 5, 'NR': 6, '': 7 };
                        const certA = certOrder[movieA.certification] || 7;
                        const certB = certOrder[movieB.certification] || 7;
                        return certA - certB;
                    case 'created_at':
                        const dateA = new Date(a.copies[0]?.created_at || 0);
                        const dateB = new Date(b.copies[0]?.created_at || 0);
                        return dateA - dateB;
                    default:
                        return 0;
                }
            });
            
            console.log('Collection after sort:', collection.map(g => g.movie.title));
            console.log(`Collection sorted, first movie:`, collection[0]?.movie?.title);
            
            // Force re-render
            renderCollection();
            
            console.log('renderCollection called');
            
        } else {
            // Sort wishlist
            wishlist.sort((a, b) => {
                switch (sortBy) {
                    case 'title':
                        return (a.display_title || a.title || '').localeCompare(b.display_title || b.title || '');
                    case 'title-desc':
                        return (b.display_title || b.title || '').localeCompare(a.display_title || a.title || '');
                    case 'year':
                        return (a.year || 0) - (b.year || 0);
                    case 'year-desc':
                        return (b.year || 0) - (a.year || 0);
                    case 'rating':
                        return (a.rating || 0) - (b.rating || 0);
                    case 'rating-desc':
                        return (b.rating || 0) - (a.rating || 0);
                    case 'runtime':
                        return (a.runtime || 0) - (b.runtime || 0);
                    case 'runtime-desc':
                        return (b.runtime || 0) - (a.runtime || 0);
                    case 'certification':
                        const certOrder = { 'G': 1, 'PG': 2, 'PG-13': 3, 'R': 4, 'NC-17': 5, 'NR': 6, '': 7 };
                        const certA = certOrder[a.certification] || 7;
                        const certB = certOrder[b.certification] || 7;
                        return certA - certB;
                    default:
                        return 0;
                }
            });

            renderWishlist();
        }
        
        console.log(`Sorted ${type} by ${sortBy}`);
    }
    
    // Backward compatibility wrapper for old HTML — now context-aware
    function sortCollection() {
        const sortBy = document.getElementById('sortBy')?.value || 'title';
        if (currentCollectionSubview === 'wishlist') {
            sortMovies('wishlist', sortBy);
        } else if (typeof sortMoviesEnhanced === 'function') {
            sortMoviesEnhanced(sortBy);
        } else {
            sortMovies('collection', sortBy);
        }
    }
    
    // ========================================
    // WISHLIST MANAGEMENT
    // ========================================
    
    async function loadWishlist() {
    try {
        const data = await apiCall('list_wishlist');
        wishlist = data || [];
        originalWishlist = [...wishlist];

        // Populate wishlist filter dropdowns
        populateWishlistFilters();

        // Apply default sort AFTER loading data
        const defaultSort = settings.defaultSort || 'title';
        sortMovies('wishlist', defaultSort);

        updateBadges();

    } catch (error) {
        console.error('Failed to load wishlist:', error);
        showToast('Failed to load your wishlist. Try refreshing.', 'error');
    }
}

    function populateWishlistFilters() {
        // Genre dropdown
        const genreSelect = document.getElementById('wishlistGenreFilter');
        if (genreSelect) {
            const genres = new Set();
            originalWishlist.forEach(item => {
                if (item.genre) {
                    item.genre.split(',').forEach(g => genres.add(g.trim()));
                }
            });
            const sorted = [...genres].sort();
            genreSelect.innerHTML = '<option value="all">All Genres</option>' +
                sorted.map(g => `<option value="${g}">${g}</option>`).join('');
        }

        // Rating dropdown
        const ratingSelect = document.getElementById('wishlistRatingFilter');
        if (ratingSelect) {
            const certs = new Set();
            originalWishlist.forEach(item => {
                if (item.certification) certs.add(item.certification);
            });
            const certOrder = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];
            const sorted = [...certs].sort((a, b) => (certOrder.indexOf(a) === -1 ? 99 : certOrder.indexOf(a)) - (certOrder.indexOf(b) === -1 ? 99 : certOrder.indexOf(b)));
            ratingSelect.innerHTML = '<option value="all">All Ratings</option>' +
                sorted.map(c => `<option value="${c}">${c}</option>`).join('');
        }
    }

    function filterWishlist() {
        const search = (document.getElementById('wishlistSearch')?.value || '').toLowerCase().trim();
        const genre = document.getElementById('wishlistGenreFilter')?.value || 'all';
        const rating = document.getElementById('wishlistRatingFilter')?.value || 'all';

        let filtered = [...originalWishlist];

        if (search) {
            filtered = filtered.filter(item => {
                const title = (item.title || '').toLowerCase();
                const displayTitle = (item.display_title || '').toLowerCase();
                return title.includes(search) || displayTitle.includes(search);
            });
        }

        if (genre !== 'all') {
            filtered = filtered.filter(item => item.genre && item.genre.includes(genre));
        }

        if (rating !== 'all') {
            filtered = filtered.filter(item => item.certification === rating);
        }

        wishlist = filtered;

        // Re-apply current sort
        const sortBy = document.getElementById('sortBy')?.value || 'title';
        sortMovies('wishlist', sortBy);
    }
    
    function renderWishlist() {
        const grid = document.getElementById('wishlistGrid');
        const empty = document.getElementById('emptyWishlist');
        
        if (wishlist.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }
        
        grid.style.display = 'grid';
        empty.style.display = 'none';

        // Capture ordered list for prev/next nav
        wishlistNavList = wishlist.map(w => w.movie_id);

        grid.innerHTML = wishlist.map(item => {
            const posterUrl = item.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
            const mediaIcon = item.media_type === 'tv' ? '📺 ' : '';
            const safeTitle = (item.title || 'Unknown').replace(/"/g, '&quot;');
            const isPriority = item.priority > 0;

            // Conditional rendering based on currentView
            if (currentView === 'list') {
                // Wishlist-style for list view (always-visible metadata)
                return `
                <div class="movie-card wishlist-card" data-movie-id="${item.movie_id}" onclick="App.openMovieWithNav(${item.movie_id}, 'wishlist')" style="cursor:pointer;">
                    <div class="movie-poster-container">
                        <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                        ${isPriority ? `<div class="priority-badge">⭐ Priority</div>` : ''}
                    </div>
                    <div class="movie-info">
                        <h3 class="movie-title">${mediaIcon}${safeTitle}</h3>
                        <div class="movie-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${item.rating.toFixed(1)}</span>` : ''}
                        </div>
                        ${item.target_format ? `<div class="movie-format">Want: ${item.target_format}</div>` : ''}
                    </div>
                    <div class="movie-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); App.openMovieWithNav(${item.movie_id}, 'wishlist');" title="Details">👁️</button>
                        <button class="btn btn-sm" style="font-size:0.8rem;padding:4px 10px;" onclick="event.stopPropagation(); App.quickOwnWishlistItem(${item.movie_id});" title="Add to Collection">📦 Own It</button>
                        <button class="btn-icon" onclick="event.stopPropagation(); App.removeFromWishlist(${item.movie_id});" title="Remove">🗑️</button>
                    </div>
                </div>
                `;
            } else {
                // Netflix-style for grid and compact views (hover overlay)
                return `
                <div class="movie-card" data-movie-id="${item.movie_id}" onclick="App.openMovieWithNav(${item.movie_id}, 'wishlist')" style="cursor:pointer;">
                    <div class="movie-poster-container">
                        <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                        ${isPriority ? `<div class="priority-badge">⭐ Priority</div>` : ''}
                    </div>

                    <div class="hover-overlay">
                        <div class="hover-title">${mediaIcon}${safeTitle}</div>
                        <div class="hover-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${item.rating.toFixed(1)}</span>` : ''}
                        </div>
                        ${item.target_format ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">Want: ${item.target_format}</div>` : ''}
                        <div class="hover-actions">
                            <button class="hover-btn" onclick="event.stopPropagation(); App.openMovieWithNav(${item.movie_id}, 'wishlist');" title="Details">👁️</button>
                            <button class="hover-btn" style="background:rgba(102,126,234,0.7);border-radius:6px;padding:4px 8px;font-size:0.8rem;" onclick="event.stopPropagation(); App.quickOwnWishlistItem(${item.movie_id});" title="Add to Collection">📦 Own It</button>
                            <button class="hover-btn" onclick="event.stopPropagation(); App.removeFromWishlist(${item.movie_id});" title="Remove">🗑️</button>
                        </div>
                    </div>

                    <div class="movie-info">
                        <h3 class="movie-title">${mediaIcon}${safeTitle}</h3>
                    </div>
                </div>
                `;
            }
        }).join('');
    }
    
    async function removeFromWishlist(movieId) {
        if (!confirm('Remove from wishlist?')) return;
        
        try {
            await apiCall('remove_wishlist', { movie_id: movieId });
            showToast('Removed from wishlist', 'success');
            loadWishlist();
        } catch (error) {
            console.error('Failed to remove from wishlist:', error);
            showToast('Failed to remove from wishlist', 'error');
        }
    }

    function quickOwnWishlistItem(movieId) {
        const item = wishlist.find(w => w.movie_id === movieId);
        if (!item) return;
        const modal = document.getElementById('quickOwnModal');
        const body  = document.getElementById('quickOwnBody');
        if (!modal || !body) { moveToCollection(movieId); return; }

        const esc = s => String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeTitle = esc(item.display_title || item.title || 'Unknown');
        const preFmt   = item.target_format || 'DVD';
        const preNotes = [item.target_edition ? `Edition: ${item.target_edition}` : '', item.notes || ''].filter(Boolean).join(' | ');

        body.innerHTML = `
            <div style="display:flex;gap:0.75rem;align-items:center;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid rgba(255,255,255,0.1);">
                <img src="${esc(item.poster_url||'')}" alt="${safeTitle}"
                     style="width:44px;height:66px;object-fit:cover;border-radius:4px;flex-shrink:0;"
                     onerror="this.style.display='none'">
                <div>
                    <div style="font-weight:700;font-size:0.95rem;">${safeTitle}</div>
                    ${item.year ? `<div style="color:#aaa;font-size:0.82rem;">${item.year}</div>` : ''}
                    ${item.target_format ? `<div style="color:#a8b8ff;font-size:0.8rem;">Wanted: ${esc(item.target_format)}</div>` : ''}
                </div>
            </div>
            <div class="form-row" style="display:flex;gap:0.5rem;">
                <div class="form-group" style="flex:1;">
                    <label>Format *</label>
                    <select id="qown-format" class="form-control">
                        ${['DVD','Blu-ray','4K UHD','VHS','LaserDisc','Digital'].map(f => `<option value="${f}" ${f===preFmt?'selected':''}>${f}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Condition</label>
                    <select id="qown-condition" class="form-control">
                        ${['Mint','Near Mint','Good','Fair','Poor'].map(c => `<option value="${c}" ${c==='Good'?'selected':''}>${c}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="qown-notes" class="form-control" rows="2"
                    placeholder="Optional notes…">${preNotes ? esc(preNotes) : ''}</textarea>
            </div>
            <label style="display:flex;align-items:center;gap:0.6rem;margin-top:0.75rem;cursor:pointer;padding:0.6rem 0.75rem;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);">
                <input type="checkbox" id="qown-remove-wishlist" checked style="width:auto;accent-color:#10b981;">
                <span style="font-size:0.875rem;">Remove from wishlist after adding</span>
            </label>
            <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
                <button class="btn" onclick="App._saveQuickOwn(${movieId})">📦 Add to Collection</button>
                <button class="btn-secondary" onclick="document.getElementById('quickOwnModal').classList.remove('active')">Cancel</button>
            </div>
        `;
        modal.classList.add('active');
    }

    async function _saveQuickOwn(movieId) {
        const item = wishlist.find(w => w.movie_id === movieId);
        if (!item) return;
        const format         = document.getElementById('qown-format')?.value || 'DVD';
        const condition      = document.getElementById('qown-condition')?.value || 'Good';
        const notes          = document.getElementById('qown-notes')?.value.trim() || '';
        const removeWishlist = document.getElementById('qown-remove-wishlist')?.checked !== false;

        // Close the modal immediately — no more waiting mid-flow
        document.getElementById('quickOwnModal').classList.remove('active');

        try {
            // Fire both operations concurrently when possible
            const ops = [
                apiCall('add_copy', {
                    movie_id:   movieId,
                    tmdb_id:    item.tmdb_id,
                    format,
                    condition,
                    notes,
                    media_type: item.media_type || 'movie',
                })
            ];
            if (removeWishlist) {
                ops.push(apiCall('remove_wishlist', { movie_id: movieId }));
            }
            await Promise.all(ops);

            const title = item.display_title || item.title || 'Film';
            const msg = removeWishlist
                ? `"${title}" added to collection and removed from wishlist`
                : `"${title}" added to collection`;
            showToast(msg, 'success');

            // Refresh both lists in parallel
            await Promise.all([loadCollection(), removeWishlist ? loadWishlist() : Promise.resolve()]);
        } catch (e) {
            showToast(e.message || 'Failed to add to collection', 'error');
        }
    }

    async function moveToCollection(movieId) {
        const item = wishlist.find(w => w.movie_id === movieId);
        if (!item) return;

        const mediaType = item.media_type || 'movie';
        const isTV = mediaType === 'tv';

        // Now wishlist includes tmdb_id thanks to API fix!
        selectedMovie = {
            id: item.tmdb_id,
            title: item.title,
            poster_path: item.poster_url,
            media_type: mediaType
        };

        // Switch to add tab and show form
        switchTab('add');

        const titlePrefix = isTV ? '📺 ' : '';
        document.getElementById('selectedMovieTitle').textContent = titlePrefix + item.title;
        document.getElementById('selectedMoviePoster').src = item.poster_url || '';

        if (item.target_format) {
            document.getElementById('copyFormat').value = item.target_format;
        }

        // Pre-select physical media region from settings
        const regionDropdown = document.getElementById('copyRegion');
        if (regionDropdown && settings.defaultPhysicalRegion) {
            regionDropdown.value = settings.defaultPhysicalRegion;
        }

        document.getElementById('addMovieForm').style.display = 'block';
        document.getElementById('searchResults').style.display = 'none';

        // Show/hide TV season picker
        const seasonPicker = document.getElementById('tvSeasonPicker');
        if (seasonPicker) {
            if (isTV) {
                seasonPicker.style.display = 'block';
                buildSeasonCheckboxes(item.tmdb_id);
            } else {
                seasonPicker.style.display = 'none';
            }
        }

        showToast('Ready to add to collection!', 'info');
    }

    // ========================================
    // PRESET WISHLIST COLLECTIONS
    // ========================================
    // Loaded dynamically from /data/presets.json via API
    // Managed through /admin/preset-manager.html

    let PRESET_LISTS = {}; // Will be populated from API

    // Load presets from API
    async function loadPresets() {
        try {
            const result = await apiCall('get_presets');
            PRESET_LISTS = result || {};
        } catch (error) {
            console.error('Failed to load presets:', error);
            PRESET_LISTS = {}; // Fallback to empty if load fails
        }
    }

    // ── Wishlist Web Scraper ──────────────────────────────────────────────────
    let _scrapeMovies = [];   // {title, year} objects from last extraction

    function openWishlistScraper() {
        _scrapeMovies = [];
        const modal = document.getElementById('wishlistScraperModal');
        if (!modal) return;
        document.getElementById('scrapeUrl').value = '';
        document.getElementById('scrapeStatus').style.display = 'none';
        document.getElementById('scrapeResults').style.display = 'none';
        if (document.getElementById('scrapeManualText')) document.getElementById('scrapeManualText').value = '';
        modal.classList.add('active');
    }

    function closeWishlistScraper() {
        const modal = document.getElementById('wishlistScraperModal');
        if (modal) modal.classList.remove('active');
    }

    function _setScrapeStatus(msg, type) {
        const el = document.getElementById('scrapeStatus');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = msg;
        el.style.background = type === 'error' ? 'rgba(239,68,68,0.15)' :
                              type === 'success' ? 'rgba(16,185,129,0.15)' :
                              'rgba(102,126,234,0.15)';
        el.style.color = type === 'error' ? 'var(--error,#ef4444)' :
                         type === 'success' ? '#10b981' : 'var(--text)';
    }

    function _parseTitleLines(text) {
        const movies = [];
        const seen = new Set();
        for (const raw of text.split('\n')) {
            const line = raw.trim().replace(/^\d+[\.\)]\s*/, '').trim();
            if (!line) continue;
            const m = line.match(/^(.+?)\s*\((\d{4})\)\s*$/);
            const title = m ? m[1].trim() : line.replace(/\b\d{4}\b/, '').replace(/[()]/g,'').trim();
            const year  = m ? parseInt(m[2]) : (line.match(/\b(\d{4})\b/)?.[1] ? parseInt(line.match(/\b(\d{4})\b/)[1]) : null);
            if (!title || seen.has(title.toLowerCase())) continue;
            seen.add(title.toLowerCase());
            movies.push({ title, year });
        }
        return movies;
    }

    function _renderScrapeResults() {
        const listEl = document.getElementById('scrapeMovieList');
        const countEl = document.getElementById('scrapeCount');
        const resultsEl = document.getElementById('scrapeResults');
        if (!listEl) return;

        const wishlistIds = new Set(wishlist.map(w => (w.display_title || w.title || '').toLowerCase()));

        countEl.textContent = `${_scrapeMovies.length} film${_scrapeMovies.length !== 1 ? 's' : ''} extracted`;
        listEl.innerHTML = _scrapeMovies.map((m, i) => {
            const key = m.title.toLowerCase();
            const alreadyIn = wishlistIds.has(key);
            return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.6rem;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);${alreadyIn ? 'opacity:0.5;' : ''}">
                <div style="flex:1;min-width:0;">
                    <span style="font-weight:600;font-size:0.9rem;">${m.title}</span>
                    ${m.year ? `<span style="color:var(--text-muted);font-size:0.8rem;margin-left:0.4rem;">${m.year}</span>` : ''}
                    ${alreadyIn ? `<span style="font-size:0.75rem;color:#10b981;margin-left:0.4rem;">✓ in wishlist</span>` : ''}
                </div>
                ${!alreadyIn ? `<button style="font-size:0.75rem;padding:2px 8px;background:rgba(239,68,68,0.15);border:none;border-radius:4px;cursor:pointer;color:var(--text);" onclick="App._removeScrapeResult(${i})">✕</button>` : ''}
            </div>`;
        }).join('');
        resultsEl.style.display = 'block';
    }

    function _removeScrapeResult(index) {
        _scrapeMovies.splice(index, 1);
        _renderScrapeResults();
    }

    function clearScrapeResults() {
        _scrapeMovies = [];
        document.getElementById('scrapeResults').style.display = 'none';
        document.getElementById('scrapeStatus').style.display = 'none';
    }

    function parseWishlistManual() {
        const text = document.getElementById('scrapeManualText')?.value || '';
        _scrapeMovies = _parseTitleLines(text);
        if (_scrapeMovies.length === 0) {
            _setScrapeStatus('No movies found — check formatting (Title (Year) per line)', 'error');
            return;
        }
        _setScrapeStatus(`Parsed ${_scrapeMovies.length} titles`, 'success');
        _renderScrapeResults();
    }

    async function runWishlistScrape() {
        const url = document.getElementById('scrapeUrl')?.value.trim();
        if (!url) { _setScrapeStatus('Enter a URL first', 'error'); return; }
        const useAI = document.getElementById('scrapeUseAI')?.checked !== false;
        _setScrapeStatus(useAI ? '🤖 AI is fetching and extracting the list…' : '🔄 Fetching article…', 'info');
        document.getElementById('scrapeResults').style.display = 'none';

        try {
            const result = await apiCall('fetch_article', { url, use_ai: useAI });
            let movies = [];
            if (result && result.ai_extracted && Array.isArray(result.movies)) {
                movies = result.movies.map(m => typeof m === 'string'
                    ? { title: m, year: null }
                    : { title: m.title || m, year: m.year || null });
            } else if (result && result.content) {
                // Fallback: regex parse plain text
                movies = _parseTitleLines(result.content);
            }
            if (movies.length === 0) {
                _setScrapeStatus('No movies found. Try pasting the text manually instead.', 'error');
                return;
            }
            _scrapeMovies = movies.filter(m => m.title);
            _setScrapeStatus(`✅ Found ${_scrapeMovies.length} films!`, 'success');
            _renderScrapeResults();
        } catch (err) {
            _setScrapeStatus(`Failed: ${err.message || 'could not reach article'}`, 'error');
        }
    }

    async function addScrapeResultsToWishlist() {
        const wishlistKeys = new Set(wishlist.map(w => (w.display_title || w.title || '').toLowerCase()));
        const toAdd = _scrapeMovies.filter(m => !wishlistKeys.has(m.title.toLowerCase()));
        if (toAdd.length === 0) {
            _setScrapeStatus('All films are already in your wishlist!', 'success');
            return;
        }
        _setScrapeStatus(`Adding ${toAdd.length} film${toAdd.length !== 1 ? 's' : ''} to wishlist…`, 'info');

        let added = 0;
        let failed = 0;
        for (const movie of toAdd) {
            try {
                // Search TMDB/UMDB to resolve the title to an ID
                const searchQ = movie.year ? `${movie.title} ${movie.year}` : movie.title;
                const results = await apiCall('search_multi', { query: searchQ });
                if (!Array.isArray(results) || !results.length) { failed++; continue; }
                const match = results[0];
                const tmdbId = String(match.id || match.tmdb_id || '');
                if (!tmdbId) { failed++; continue; }
                await apiCall('add_wishlist', {
                    tmdb_id:    tmdbId,
                    media_type: match.media_type || 'movie',
                });
                added++;
            } catch (_) { failed++; }
        }

        await loadWishlist();
        _renderScrapeResults();  // Refresh to show "✓ in wishlist" on newly added items
        const msg = `Added ${added} film${added !== 1 ? 's' : ''} to wishlist` + (failed ? ` (${failed} not found)` : '');
        _setScrapeStatus(msg, added > 0 ? 'success' : 'error');
        if (added > 0) showToast(msg, 'success');
    }

    // Load presets when app initializes
    loadPresets();

    async function openPresetLists() {
        const modal = document.getElementById('presetListsModal');
        const container = document.getElementById('presetListsContainer');

        // Reload presets from server to get latest changes
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">Loading presets...</div>';
        modal.classList.add('active');

        await loadPresets();

        // Build preset list cards
        container.innerHTML = Object.entries(PRESET_LISTS).map(([key, list]) => `
            <div class="preset-list-card">
                <div class="preset-list-header">
                    <div>
                        <h3>${list.icon} ${list.name}</h3>
                        <p>${list.description}</p>
                    </div>
                    <span class="preset-count">${list.movies.length} movies</span>
                </div>
                <div class="preset-actions">
                    <button class="btn-ghost" onclick="App.viewPresetList('${key}')">View List</button>
                    <button class="btn" onclick="App.addPresetToWishlist('${key}')">Add All to Wishlist</button>
                </div>
            </div>
        `).join('');
    }

    function closePresetLists() {
        document.getElementById('presetListsModal').classList.remove('active');
    }

    async function viewPresetList(listKey) {
        const list = PRESET_LISTS[listKey];
        if (!list) return;

        const container = document.getElementById('presetListsContainer');
        if (!container) return;

        container.innerHTML = `
            <div style="margin-bottom:1rem;">
                <button class="btn-ghost" onclick="App.openPresetLists()" style="margin-bottom:1rem;">← Back to Lists</button>
                <h3>${list.icon} ${list.name}</h3>
                <p style="color:var(--text-muted);margin:0.5rem 0 1rem;">${list.description}</p>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:60vh;overflow-y:auto;">
                ${list.movies.map(m => `
                    <div style="padding:0.6rem 1rem;background:var(--bg-hover);border-radius:var(--radius);display:flex;justify-content:space-between;align-items:center;">
                        <span>${m.title}</span>
                        <span style="color:var(--text-muted);font-size:0.85rem;">${m.year}</span>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:1.5rem;">
                <button class="btn" onclick="App.addPresetToWishlist('${listKey}')">Add All to Wishlist</button>
            </div>
        `;
    }

    async function addPresetToWishlist(listKey) {
        const list = PRESET_LISTS[listKey];
        if (!list) return;

        if (!confirm(`Add all ${list.movies.length} movies from "${list.name}" to your wishlist?`)) {
            return;
        }

        showToast(`Adding ${list.movies.length} movies to wishlist...`, 'info');
        let added = 0;
        let skipped = 0;

        for (const movie of list.movies) {
            try {
                let tmdbId = movie.tmdb_id; // Use stored TMDB ID if available
                let movieData = null;

                // If we have a stored TMDB ID, fetch movie data directly
                if (tmdbId) {
                    try {
                        movieData = await apiCall('get_movie', {
                            tmdb_id: tmdbId,
                            media_type: 'movie',
                            cert_region: settings.certRegion || 'US'
                        });
                    } catch (error) {
                        console.warn(`Stored TMDB ID ${tmdbId} failed, falling back to search`);
                        tmdbId = null; // Fall back to search
                    }
                }

                // If no stored ID or fetch failed, search for the movie
                if (!tmdbId) {
                    const results = await apiCall('search_movie', { query: movie.title });

                    // Find best match by year
                    const match = results.find(r =>
                        r.title.toLowerCase() === movie.title.toLowerCase() &&
                        r.release_date && r.release_date.startsWith(movie.year.toString())
                    ) || results[0];

                    if (match) {
                        tmdbId = match.id;
                        movieData = await apiCall('get_movie', {
                            tmdb_id: tmdbId,
                            media_type: 'movie',
                            cert_region: settings.certRegion || 'US'
                        });
                    }
                }

                if (movieData && tmdbId) {
                    // Check if already in wishlist
                    const exists = wishlist.find(w => w.tmdb_id === tmdbId.toString());
                    if (!exists) {
                        await apiCall('add_wishlist', {
                            tmdb_id: tmdbId,
                            media_type: 'movie'
                        });
                        added++;
                    } else {
                        skipped++;
                    }
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`Failed to add ${movie.title}:`, error);
            }
        }

        await loadWishlist();
        closePresetLists();
        showToast(`Added ${added} movies to wishlist${skipped > 0 ? ` (${skipped} already in wishlist)` : ''}`, 'success');
    }

    // ========================================
    // SEARCH & ADD MOVIE
    // ========================================
    
    async function searchMovies() {
        const query = document.getElementById('movieSearch').value.trim();

        if (!query) {
            showToast('Please enter a search term', 'error');
            return;
        }

        try {
            const results = await apiCall('search_multi', { query: query });

            const resultsDiv = document.getElementById('searchResults');
            resultsDiv.style.display = 'grid';

            if (results.length === 0) {
                resultsDiv.innerHTML = '<p>No results found</p>';
                return;
            }

            resultsDiv.innerHTML = results.map(item => {
                const isTV = item.media_type === 'tv';
                const title = isTV ? (item.name || '') : (item.title || '');
                const date = isTV ? item.first_air_date : item.release_date;
                const yearStr = date ? date.substring(0, 4) : 'Unknown';
                const isUmdb = item.source === 'umdb';
                // Handle both TMDB relative paths and full URLs (UMDB)
                const rawPoster = item.poster_path || item.poster_url || '';
                const posterUrl = rawPoster
                    ? (rawPoster.startsWith('http') ? rawPoster : 'https://image.tmdb.org/t/p/w300' + rawPoster)
                    : '';
                const safeTitle = title.replace(/"/g, '&quot;');
                const sourceBadge = isUmdb ? '<span class="umdb-badge">UMDB</span>' : '';
                return `
                <div class="search-result-card"
                     data-movie-id="${item.id}"
                     data-movie-title="${safeTitle}"
                     data-poster-path="${rawPoster}"
                     data-media-type="${item.media_type || 'movie'}">
                    <img src="${posterUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'92\' height=\'138\'%3E%3Crect fill=\'%23333\' width=\'92\' height=\'138\'/%3E%3C/svg%3E'}" alt="${safeTitle}">
                    <div class="search-result-info">
                        <h4>${isTV ? '📺 ' : ''}${title}</h4>
                        <p>${yearStr} ${isTV ? '<span class="tv-badge">TV Series</span>' : ''} ${sourceBadge}</p>
                        ${item.vote_average ? `<p>⭐ ${item.vote_average.toFixed(1)}</p>` : ''}
                    </div>
                </div>
                `;
            }).join('');

            // Add click handlers
            resultsDiv.querySelectorAll('.search-result-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.movieId;
                    const title = card.dataset.movieTitle;
                    const posterPath = card.dataset.posterPath;
                    const mediaType = card.dataset.mediaType || 'movie';
                    selectMovie(id, title, posterPath, mediaType);
                });
            });

            showToast(`Found ${results.length} results`, 'success');

        } catch (error) {
            console.error('Search failed:', error);
            showToast('Search failed. Check your connection and try again.', 'error');
        }
    }

    // IMDB Lookup Function
    async function lookupByImdbId() {
    console.log('CineShelf: IMDB lookup button clicked');
    
    const imdbId = document.getElementById('imdbId').value.trim();
    console.log('CineShelf: IMDB ID entered:', imdbId);
    
    if (!imdbId) {
        showToast('Please enter an IMDb ID (e.g., tt0287457)', 'error');
        return;
    }

    if (!/^tt\d{7,8}$/.test(imdbId)) {
        showToast('Invalid IMDb ID format. Should be like: tt0287457', 'error');
        console.log('CineShelf: Invalid IMDB ID format:', imdbId);
        return;
    }

    const btn = document.getElementById('imdbBtn');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = '🔍 Looking up...';
    
    console.log('CineShelf: Starting IMDB lookup for:', imdbId);

    try {
        // Route through backend — searches TMDB then UMDB automatically
        const details = await apiCall('find_by_imdb', { imdb_id: imdbId });

        console.log('CineShelf: find_by_imdb response:', details);

        if (details) {
            const mediaType = details.media_type || 'movie';
            console.log(`CineShelf: Found ${mediaType} via IMDB ID ${imdbId}:`, details);

            // Resolve poster URL (backend may return poster_path or poster_url)
            const posterPath = details.poster_path || details.poster_url || null;
            const posterUrl = posterPath
                ? (posterPath.startsWith('http') ? posterPath : `https://image.tmdb.org/t/p/w500${posterPath}`)
                : null;

            // Build movie data object
            let movieData = {
                id: (details.id || '').toString(),
                tmdb_id: (details.id || '').toString(),
                title: mediaType === 'tv' ? (details.name || details.title) : (details.title || details.name),
                year: null,
                poster_url: posterUrl,
                overview: details.overview || '',
                rating: details.vote_average || 0,
                media_type: mediaType,
                genre: details.genres?.map(g => g.name).join(', ') || '',
                director: null,
                runtime: null,
                certification: null,
                source: details.source || 'tmdb'
            };

            // Get year based on media type
            if (mediaType === 'tv') {
                movieData.year = details.first_air_date ? new Date(details.first_air_date).getFullYear() : null;
                movieData.runtime = details.episode_run_time?.[0] || null;

                // Get TV rating for preferred region (fallback to US)
                if (details.content_ratings?.results) {
                    const prefCertCountry = (settings.certRegion || 'US') === 'CA-QC' ? 'CA' : (settings.certRegion || 'US');
                    const regionRating = details.content_ratings.results.find(r => r.iso_3166_1 === prefCertCountry);
                    const usRating = prefCertCountry !== 'US' ? details.content_ratings.results.find(r => r.iso_3166_1 === 'US') : null;
                    movieData.certification = regionRating?.rating || usRating?.rating || null;
                }
            } else {
                movieData.year = details.release_date ? new Date(details.release_date).getFullYear() : null;
                movieData.runtime = details.runtime || null;

                // Get director
                if (details.credits?.crew) {
                    const director = details.credits.crew.find(person => person.job === 'Director');
                    movieData.director = director?.name || null;
                }

                // Get certification for preferred region (fallback to US)
                if (details.release_dates?.results) {
                    const prefCertCountry = (settings.certRegion || 'US') === 'CA-QC' ? 'CA' : (settings.certRegion || 'US');
                    const regionRelease = details.release_dates.results.find(r => r.iso_3166_1 === prefCertCountry);
                    const cert = regionRelease?.release_dates?.find(d => d.certification)?.certification;
                    if (cert) {
                        movieData.certification = cert;
                    } else if (prefCertCountry !== 'US') {
                        const usRelease = details.release_dates.results.find(r => r.iso_3166_1 === 'US');
                        movieData.certification = usRelease?.release_dates?.find(d => d.certification)?.certification || null;
                    }
                }
            }

            console.log('CineShelf: Processed movie data:', movieData);

            // Store as selected movie
            selectedMovie = movieData;

            // Show the add form
            document.getElementById('searchResults').style.display = 'none';
            const form = document.getElementById('addMovieForm');
            form.style.display = 'block';

            const titlePrefix = mediaType === 'tv' ? '📺 ' : '';
            document.getElementById('selectedMovieTitle').textContent = titlePrefix + movieData.title;
            document.getElementById('selectedMoviePoster').src = movieData.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';

            // Show/hide TV season picker
            const seasonPicker = document.getElementById('tvSeasonPicker');
            if (seasonPicker) {
                if (mediaType === 'tv') {
                    seasonPicker.style.display = 'block';
                    buildSeasonCheckboxes(movieData.id || movieData.tmdb_id);
                } else {
                    seasonPicker.style.display = 'none';
                }
            }

            showToast(`Found: ${movieData.title} (${movieData.year || 'Unknown'})`, 'success');

        } else {
            console.log('CineShelf: No movie or TV found for IMDB ID:', imdbId);
            showToast(`No movie or TV series found with IMDb ID: ${imdbId}`, 'error');
        }

    } catch (error) {
        console.error('CineShelf: IMDB lookup error:', error);
        showToast('Failed to lookup by IMDb ID. Check your connection.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

    function selectMovie(id, title, posterPath, mediaType) {
        // If called from IMDb lookup, selectedMovie already has media_type set
        const mType = mediaType || (selectedMovie && selectedMovie.media_type) || 'movie';
        selectedMovie = { id, title: title, poster_path: posterPath, media_type: mType };

        const titleEl = document.getElementById('selectedMovieTitle');
        titleEl.textContent = (mType === 'tv' ? '📺 ' : '') + selectedMovie.title;
        // Handle both TMDB relative paths and full URLs (UMDB)
        const posterSrc = posterPath
            ? (posterPath.startsWith('http') ? posterPath : 'https://image.tmdb.org/t/p/w300' + posterPath)
            : '';
        document.getElementById('selectedMoviePoster').src = posterSrc;

        // Pre-select physical media region from settings
        const regionDropdown2 = document.getElementById('copyRegion');
        if (regionDropdown2 && settings.defaultPhysicalRegion) {
            regionDropdown2.value = settings.defaultPhysicalRegion;
        }

        document.getElementById('addMovieForm').style.display = 'block';
        document.getElementById('searchResults').style.display = 'none';

        // Show/hide TV season picker
        const seasonPicker = document.getElementById('tvSeasonPicker');
        if (seasonPicker) {
            if (mType === 'tv') {
                seasonPicker.style.display = 'block';
                buildSeasonCheckboxes(id);
            } else {
                seasonPicker.style.display = 'none';
            }
        }
    }

    // Build season checkboxes for a TV show
    async function buildSeasonCheckboxes(tmdbId) {
        const container = document.getElementById('tvSeasonCheckboxes');
        if (!container) return;
        container.innerHTML = '<span style="color:rgba(255,255,255,0.5)">Loading seasons...</span>';

        try {
            // Fetch TV show details via backend (routes to TMDB or UMDB)
            const data = await apiCall('get_movie', { tmdb_id: tmdbId, media_type: 'tv' });
            const numSeasons = data.number_of_seasons || 1;

            // Store for later use
            if (selectedMovie) selectedMovie.number_of_seasons = numSeasons;

            let html = '';
            for (let i = 1; i <= numSeasons; i++) {
                html += `<label class="season-checkbox" onclick="this.classList.toggle('checked')">
                    <input type="checkbox" value="${i}" name="season"> S${i}
                </label>`;
            }
            container.innerHTML = html;
        } catch (e) {
            // Fallback: simple text input
            container.innerHTML = `<input type="text" id="seasonsOwnedText" placeholder="e.g., 1, 2, 3"
                style="width:100%; padding:0.5rem; border-radius:4px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">`;
        }
    }

    // Get selected seasons as comma-separated string
    function getSelectedSeasons() {
        const checkboxes = document.querySelectorAll('#tvSeasonCheckboxes input[type="checkbox"]:checked');
        if (checkboxes.length > 0) {
            return Array.from(checkboxes).map(cb => cb.value).join(', ');
        }
        // Fallback text input
        const textInput = document.getElementById('seasonsOwnedText');
        return textInput ? textInput.value.trim() : '';
    }
    
    async function addToCollection() {
        if (!selectedMovie) return;

        const format = document.getElementById('copyFormat').value;
        const edition = document.getElementById('copyEdition').value;
        const region = document.getElementById('copyRegion').value;
        const condition = document.getElementById('copyCondition').value;
        const notes = document.getElementById('copyNotes').value;
        const mediaType = selectedMovie.media_type || 'movie';
        const seasonsOwned = mediaType === 'tv' ? getSelectedSeasons() : '';
        // Physical media attributes (v3.0.0)
        const aspectRatio = document.getElementById('copyAspectRatio')?.value || '';
        const packageType = document.getElementById('copyPackageType')?.value || '';
        const featureCount = document.getElementById('copyFeatureCount')?.value || 'Single';
        const hasSlipcover = document.getElementById('copyHasSlipcover')?.checked ? 1 : 0;
        const hasBooklet = document.getElementById('copyHasBooklet')?.checked ? 1 : 0;
        const hasBonusDisc = document.getElementById('copyHasBonusDisc')?.checked ? 1 : 0;
        const bonusDiscCount = hasBonusDisc ? parseInt(document.getElementById('copyBonusDiscCount')?.value || '1') : 0;
        const hasDigitalCopy = document.getElementById('copyHasDigitalCopy')?.checked ? 1 : 0;
        const has3d = document.getElementById('copyHas3d')?.checked ? 1 : 0;

        try {
            await apiCall('add_copy', {
                tmdb_id: selectedMovie.id,
                format: format,
                edition: edition,
                region: region,
                condition: condition,
                notes: notes,
                media_type: mediaType,
                seasons_owned: seasonsOwned,
                cert_region: settings.certRegion || 'US',
                aspect_ratio: aspectRatio,
                package_type: packageType,
                feature_count: featureCount,
                has_slipcover: hasSlipcover,
                has_booklet: hasBooklet,
                has_bonus_disc: hasBonusDisc,
                bonus_disc_count: bonusDiscCount,
                has_digital_copy: hasDigitalCopy,
                has_3d: has3d
            });

            showToast('Added to collection!', 'success');

            // Clear form
            cancelAdd();

            // Reload collection
            loadCollection();

            // Switch to collection tab
            switchTab('collection');

        } catch (error) {
            console.error('Failed to add to collection:', error);
            showToast(error.message || 'Failed to add to collection', 'error');
        }
    }

    async function addToWishlist() {
        if (!selectedMovie) return;

        const mediaType = selectedMovie.media_type || 'movie';

        try {
            await apiCall('add_wishlist', {
                tmdb_id: selectedMovie.id,
                priority: 0,
                target_format: document.getElementById('copyFormat').value,
                notes: document.getElementById('copyNotes').value,
                media_type: mediaType
            });

            showToast('Added to wishlist!', 'success');

            // Clear form
            cancelAdd();

            // Reload wishlist
            loadWishlist();

            // Switch to wishlist sub-view inside Collection tab
            switchTab('collection');
            switchCollectionView('wishlist');

        } catch (error) {
            console.error('Failed to add to wishlist:', error);
            showToast(error.message || 'Failed to add to wishlist', 'error');
        }
    }

    function cancelAdd() {
        selectedMovie = null;
        document.getElementById('movieSearch').value = '';
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('addMovieForm').style.display = 'none';
        document.getElementById('copyFormat').value = 'DVD';
        document.getElementById('copyEdition').value = '';
        document.getElementById('copyRegion').value = settings.defaultPhysicalRegion || '';
        document.getElementById('copyCondition').value = 'Good';
        document.getElementById('copyNotes').value = '';

        // Hide and reset season picker
        const seasonPicker = document.getElementById('tvSeasonPicker');
        if (seasonPicker) {
            seasonPicker.style.display = 'none';
            const checkboxContainer = document.getElementById('tvSeasonCheckboxes');
            if (checkboxContainer) checkboxContainer.innerHTML = '';
        }

        // Show search results again
        document.getElementById('searchResults').style.display = 'grid';
    }
    
    // ========================================
    // COPY MANAGEMENT
    // ========================================
    
    async function openCopyManager(movieId) {
    copyManagerMovieId = movieId;
    try {
        const copies = await apiCall('get_movie_copies', { movie_id: movieId });

        if (copies.length === 0) {
            showToast('No more copies', 'info');
            closeCopyManager();
            return;
        }

        const firstCopy = copies[0];
        const movieTitle = firstCopy && firstCopy.movie ?
            firstCopy.movie.title : 'this movie';

        // Check if this is a TV show
        const group = collection.find(c => c.movie.movie_id === movieId);
        const isTV = group && group.movie.media_type === 'tv';

        const content = document.getElementById('copyManagerContent');

        content.innerHTML = `
            <h4>All Copies of ${isTV ? '📺 ' : ''}${movieTitle}</h4>
            <div class="copies-list">
                ${copies.map((copy, index) => `
                    <div class="copy-item" id="copy-item-${copy.id}">
                        <div class="copy-header">
                            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                                <strong>Copy #${index + 1}</strong>
                                ${copy.umdb_physical_copy_id
                                    ? `<span class="umdb-link-badge" title="${copy.umdb_physical_copy_id}">UMDB ${copy.umdb_sync_status === 'PENDING' ? '⏳' : '✓'}</span>`
                                    : ''}
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items:center;">
                                ${!copy.umdb_physical_copy_id ? `<button class="btn-sm btn-umdb-sm" onclick="App.pushCopyToUmdb(${copy.id}, ${movieId})" title="Push to UMDB">Push to UMDB</button>` : ''}
                                <button class="btn-icon" onclick="App.editCopy(${copy.id})" title="Edit">✏️</button>
                                <button class="btn-icon" onclick="App.deleteCopy(${copy.id}, ${movieId})" title="Delete">🗑️</button>
                            </div>
                        </div>

                        <!-- View Mode -->
                        <div id="copy-view-${copy.id}" class="copy-details">
                            <div><strong>Format:</strong> ${copy.format}</div>
                            ${copy.aspect_ratio ? `<div><strong>Aspect Ratio:</strong> ${copy.aspect_ratio}</div>` : ''}
                            ${copy.edition ? `<div><strong>Edition:</strong> ${copy.edition}</div>` : ''}
                            ${copy.edition_publisher ? `<div><strong>Publisher:</strong> ${copy.edition_publisher}</div>` : ''}
                            ${copy.studio ? `<div><strong>Studio:</strong> ${copy.studio}</div>` : ''}
                            ${copy.package_type ? `<div><strong>Package:</strong> ${copy.package_type}</div>` : ''}
                            ${copy.feature_count && copy.feature_count !== 'Single' ? `<div><strong>Features:</strong> ${copy.feature_count}</div>` : ''}
                            ${copy.region ? `<div><strong>Region:</strong> ${copy.region}</div>` : ''}
                            ${copy.country ? `<div><strong>Country:</strong> ${copy.country}</div>` : ''}
                            ${copy.language ? `<div><strong>Language(s):</strong> ${copy.language}</div>` : ''}
                            ${copy.video_standard ? `<div><strong>Video Standard:</strong> ${copy.video_standard}</div>` : ''}
                            ${copy.condition ? `<div><strong>Condition:</strong> ${copy.condition}</div>` : ''}
                            ${copy.seasons_owned ? `<div><strong>Seasons:</strong> ${copy.seasons_owned}</div>` : ''}
                            ${(copy.has_slipcover || copy.has_booklet || copy.has_bonus_disc || copy.has_digital_copy || copy.has_3d) ? `
                            <div><strong>Extras:</strong> ${[
                                copy.has_slipcover ? 'Slipcover' : '',
                                copy.has_booklet ? 'Booklet' : '',
                                copy.has_bonus_disc ? (copy.bonus_disc_count > 1 ? copy.bonus_disc_count + ' Bonus Discs' : 'Bonus Disc') : '',
                                copy.has_digital_copy ? 'Digital Copy' : '',
                                copy.has_3d ? '3D' : ''
                            ].filter(Boolean).join(', ')}</div>` : ''}
                            ${copy.bonus_content ? `<div><strong>Bonus Content:</strong> ${copy.bonus_content}</div>` : ''}
                            ${copy.barcode ? `<div><strong>Barcode:</strong> <span style="font-family:monospace;">${copy.barcode}</span>${copy.ean && copy.ean !== copy.barcode ? ` / EAN: <span style="font-family:monospace;">${copy.ean}</span>` : ''}</div>` : ''}
                            ${copy.asin ? `<div><strong>ASIN:</strong> <span style="font-family:monospace;">${copy.asin}</span></div>` : ''}
                            ${copy.notes ? `<div><strong>Notes:</strong> ${copy.notes}</div>` : ''}

                            <!-- Physical Edition & Component Tracking -->
                            <div class="edition-section">
                                ${copy.edition_id ? (() => {
                                    const hasUmdb = !!copy.edition_umdb_release_id;
                                    const edLangs = copy.edition_languages || '';
                                    const edVideo = copy.edition_video_system || '';
                                    const edCopyProt = copy.edition_copy_protected == 1;
                                    const edAudio = copy.edition_audio_formats || '';
                                    const edSubs = copy.edition_subtitles || '';
                                    const edAsin = copy.edition_asin || '';
                                    const edDiscColor = copy.edition_disc_color || '';
                                    const edType = copy.edition_edition_type || '';
                                    const edRegion = copy.edition_region || copy.region || '';
                                    const edDist = copy.edition_distributor || '';
                                    const edDiscs = copy.edition_disc_count || 1;
                                    const edBarcode = copy.edition_barcode || '';

                                    const avTags = [edVideo, edRegion, edCopyProt ? '🔒 Copy Protected' : ''].filter(Boolean);
                                    const pkgTags = [edType, copy.package_type && copy.package_type !== 'Standard Amaray' ? copy.package_type : ''].filter(Boolean);

                                    const edCover = copy.edition_cover_url || '';
                                    return `
                                    <div class="edition-panel">
                                        <div class="edition-panel-header">
                                            ${edCover ? `
                                            <a href="${edCover}" target="_blank" title="View full cover image" class="edition-cover-thumb-link">
                                                <img class="edition-cover-thumb" src="${edCover}"
                                                     alt="Cover" onerror="this.parentElement.style.display='none'">
                                            </a>` : ''}
                                            <div style="flex:1;min-width:0;">
                                                <span class="edition-panel-name">${copy.edition_name || 'Linked Edition'}</span>
                                                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.2rem;">
                                                    ${hasUmdb ? `<span class="umdb-link-badge" title="${copy.edition_umdb_release_id}">UMDB</span>` : ''}
                                                    ${copy.components_total > 0 ? `<span class="edition-badge-count">${copy.components_present}/${copy.components_total} components</span>` : ''}
                                                </div>
                                            </div>
                                        </div>

                                        ${(edLangs || avTags.length > 0 || pkgTags.length > 0 || edAudio || edSubs || edAsin || edDiscColor || edDist || edBarcode) ? `
                                        <div class="edition-umdb-details">
                                            ${edLangs ? `<div class="eud-row"><span class="eud-label">Languages</span><span class="eud-value">${edLangs}</span></div>` : ''}
                                            ${avTags.length > 0 ? `<div class="eud-row"><span class="eud-label">Video</span><span class="eud-value eud-tags">${avTags.map(t => `<span class="eud-tag">${t}</span>`).join('')}</span></div>` : ''}
                                            ${pkgTags.length > 0 ? `<div class="eud-row"><span class="eud-label">Edition</span><span class="eud-value eud-tags">${pkgTags.map(t => `<span class="eud-tag">${t}</span>`).join('')}</span></div>` : ''}
                                            ${edAudio ? `<div class="eud-row"><span class="eud-label">Audio</span><span class="eud-value">${edAudio}</span></div>` : ''}
                                            ${edSubs ? `<div class="eud-row"><span class="eud-label">Subtitles</span><span class="eud-value">${edSubs}</span></div>` : ''}
                                            ${(edDiscs > 1) ? `<div class="eud-row"><span class="eud-label">Discs</span><span class="eud-value">${edDiscs}</span></div>` : ''}
                                            ${edDist ? `<div class="eud-row"><span class="eud-label">Distributor</span><span class="eud-value">${edDist}</span></div>` : ''}
                                            ${edDiscColor ? `<div class="eud-row"><span class="eud-label">Disc Colour</span><span class="eud-value">${edDiscColor}</span></div>` : ''}
                                            ${edAsin ? `<div class="eud-row"><span class="eud-label">ASIN</span><span class="eud-value eud-mono">${edAsin}</span></div>` : ''}
                                            ${edBarcode ? `<div class="eud-row"><span class="eud-label">Barcode</span><span class="eud-value eud-mono">${edBarcode}</span></div>` : ''}
                                        </div>` : ''}

                                        <div class="edition-actions">
                                            <button class="btn-sm" onclick="App.openComponentChecklist(${copy.id}, ${movieId})">Checklist</button>
                                            ${hasUmdb
                                                ? `<button class="btn-sm btn-umdb-sm" onclick="App.syncEditionFromUmdb(${copy.edition_id}, ${movieId})" title="Re-pull latest data from UMDB">Sync ↓</button>
                                                   <button class="btn-sm btn-umdb-sm" onclick="App.updateUmdbRelease(${copy.edition_id}, ${movieId})" title="Push local changes up to UMDB">Update ↑</button>
                                                   <button class="btn-sm btn-sm-muted" onclick="App.unlinkEditionFromUmdb(${copy.edition_id}, ${movieId})" title="Remove UMDB link">Unlink UMDB</button>`
                                                : `<button class="btn-sm btn-umdb-sm" onclick="App.pushEditionToUmdb(${copy.edition_id}, ${movieId})" title="Push to UMDB">Push to UMDB</button>
                                                   <button class="btn-sm btn-sm-muted" onclick="App.linkEditionToUmdb(${copy.edition_id}, ${movieId})" title="Link to existing UMDB release">Link UMDB</button>`
                                            }
                                            <button class="btn-sm btn-sm-muted" onclick="App.unlinkCopyEdition(${copy.id}, ${movieId})">Unlink Edition</button>
                                        </div>
                                    </div>`;
                                })() : `
                                    <button class="btn-sm btn-sm-outline" onclick="App.openEditionPicker(${copy.id}, ${movieId})">+ Link Physical Edition</button>
                                `}
                            </div>
                        </div>

                        <!-- Edit Mode (Hidden by default) -->
                        <div id="copy-edit-${copy.id}" class="copy-edit-form" style="display: none;">
                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>Format *</label>
                                    <select id="edit-format-${copy.id}" class="form-control">
                                        <option value="DVD" ${copy.format === 'DVD' ? 'selected' : ''}>DVD</option>
                                        <option value="Blu-ray" ${copy.format === 'Blu-ray' ? 'selected' : ''}>Blu-ray</option>
                                        <option value="4K UHD" ${copy.format === '4K UHD' ? 'selected' : ''}>4K UHD</option>
                                        <option value="4K Ultra HD" ${copy.format === '4K Ultra HD' ? 'selected' : ''}>4K Ultra HD</option>
                                        <option value="Digital" ${copy.format === 'Digital' ? 'selected' : ''}>Digital</option>
                                        <option value="VHS" ${copy.format === 'VHS' ? 'selected' : ''}>VHS</option>
                                        <option value="LaserDisc" ${copy.format === 'LaserDisc' ? 'selected' : ''}>LaserDisc</option>
                                    </select>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>Aspect Ratio</label>
                                    <select id="edit-aspect-ratio-${copy.id}" class="form-control">
                                        <option value="" ${!copy.aspect_ratio ? 'selected' : ''}>Not Specified</option>
                                        <option value="Widescreen" ${copy.aspect_ratio === 'Widescreen' ? 'selected' : ''}>Widescreen</option>
                                        <option value="Full Screen" ${copy.aspect_ratio === 'Full Screen' ? 'selected' : ''}>Full Screen</option>
                                        <option value="Letterbox" ${copy.aspect_ratio === 'Letterbox' ? 'selected' : ''}>Letterbox</option>
                                        <option value="Pan & Scan" ${copy.aspect_ratio === 'Pan & Scan' ? 'selected' : ''}>Pan & Scan</option>
                                        <option value="IMAX" ${copy.aspect_ratio === 'IMAX' ? 'selected' : ''}>IMAX</option>
                                    </select>
                                </div>
                            </div>

                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>Edition</label>
                                    <input type="text" id="edit-edition-${copy.id}"
                                           class="form-control"
                                           value="${copy.edition || ''}"
                                           placeholder="e.g., Director's Cut">
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>Package Type</label>
                                    <select id="edit-package-type-${copy.id}" class="form-control">
                                        <option value="" ${!copy.package_type ? 'selected' : ''}>Standard Amaray</option>
                                        <option value="Steelbook" ${copy.package_type === 'Steelbook' ? 'selected' : ''}>Steelbook</option>
                                        <option value="Digibook" ${copy.package_type === 'Digibook' ? 'selected' : ''}>Digibook</option>
                                        <option value="Digipack" ${copy.package_type === 'Digipack' ? 'selected' : ''}>Digipack</option>
                                        <option value="Slipcase" ${copy.package_type === 'Slipcase' ? 'selected' : ''}>Slipcase</option>
                                        <option value="Mediabook" ${copy.package_type === 'Mediabook' ? 'selected' : ''}>Mediabook</option>
                                        <option value="Snap Case" ${copy.package_type === 'Snap Case' ? 'selected' : ''}>Snap Case</option>
                                        <option value="Eco Case" ${copy.package_type === 'Eco Case' ? 'selected' : ''}>Eco Case</option>
                                        <option value="Keep Case" ${copy.package_type === 'Keep Case' ? 'selected' : ''}>Keep Case</option>
                                        <option value="Tin Case" ${copy.package_type === 'Tin Case' ? 'selected' : ''}>Tin Case</option>
                                    </select>
                                </div>
                            </div>

                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>Feature Count</label>
                                    <select id="edit-feature-count-${copy.id}" class="form-control">
                                        <option value="Single" ${(copy.feature_count || 'Single') === 'Single' ? 'selected' : ''}>Single Feature</option>
                                        <option value="Single + Bonus" ${copy.feature_count === 'Single + Bonus' ? 'selected' : ''}>Single + Bonus Disc</option>
                                        <option value="Double Feature" ${copy.feature_count === 'Double Feature' ? 'selected' : ''}>Double Feature</option>
                                        <option value="Triple Feature" ${copy.feature_count === 'Triple Feature' ? 'selected' : ''}>Triple Feature</option>
                                        <option value="Quadruple Feature" ${copy.feature_count === 'Quadruple Feature' ? 'selected' : ''}>Quadruple Feature</option>
                                        <option value="Collection" ${copy.feature_count === 'Collection' ? 'selected' : ''}>Collection</option>
                                        <option value="Complete Series" ${copy.feature_count === 'Complete Series' ? 'selected' : ''}>Complete Series</option>
                                        <option value="Full Saga" ${copy.feature_count === 'Full Saga' ? 'selected' : ''}>Full Saga</option>
                                    </select>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>Condition</label>
                                    <select id="edit-condition-${copy.id}" class="form-control">
                                        <option value="">Not specified</option>
                                        <option value="Mint" ${copy.condition === 'Mint' ? 'selected' : ''}>Mint</option>
                                        <option value="Excellent" ${copy.condition === 'Excellent' ? 'selected' : ''}>Excellent</option>
                                        <option value="Good" ${copy.condition === 'Good' ? 'selected' : ''}>Good</option>
                                        <option value="Fair" ${copy.condition === 'Fair' ? 'selected' : ''}>Fair</option>
                                        <option value="Poor" ${copy.condition === 'Poor' ? 'selected' : ''}>Poor</option>
                                    </select>
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Region</label>
                                <input type="text" id="edit-region-${copy.id}"
                                       class="form-control"
                                       value="${copy.region || ''}"
                                       placeholder="e.g., Region 1">
                            </div>

                            <!-- Packaging Extras -->
                            <div class="form-group">
                                <label>Packaging Extras</label>
                                <div class="packaging-extras-grid">
                                    <label class="toggle-chip"><input type="checkbox" id="edit-slipcover-${copy.id}" ${copy.has_slipcover ? 'checked' : ''}><span>Slipcover</span></label>
                                    <label class="toggle-chip"><input type="checkbox" id="edit-booklet-${copy.id}" ${copy.has_booklet ? 'checked' : ''}><span>Booklet</span></label>
                                    <label class="toggle-chip"><input type="checkbox" id="edit-bonus-disc-${copy.id}" ${copy.has_bonus_disc ? 'checked' : ''}><span>Bonus Disc</span></label>
                                    <label class="toggle-chip"><input type="checkbox" id="edit-digital-copy-${copy.id}" ${copy.has_digital_copy ? 'checked' : ''}><span>Digital Copy</span></label>
                                    <label class="toggle-chip"><input type="checkbox" id="edit-3d-${copy.id}" ${copy.has_3d ? 'checked' : ''}><span>3D</span></label>
                                </div>
                                <div style="margin-top:0.5rem; ${copy.has_bonus_disc ? '' : 'display:none;'}">
                                    <label style="font-size:0.85rem;">Bonus Disc Count</label>
                                    <input type="number" id="edit-bonus-disc-count-${copy.id}" class="form-control" min="1" max="10" value="${copy.bonus_disc_count || 1}" style="width:80px;">
                                </div>
                            </div>

                            ${isTV ? `
                            <div class="form-group">
                                <label>📺 Seasons Owned</label>
                                <input type="text" id="edit-seasons-${copy.id}"
                                       class="form-control"
                                       value="${copy.seasons_owned || ''}"
                                       placeholder="e.g., 1, 2, 3">
                            </div>
                            ` : ''}

                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>Edition Publisher</label>
                                    <input type="text" id="edit-edition-publisher-${copy.id}" class="form-control" value="${copy.edition_publisher || ''}" placeholder="e.g., Criterion, Arrow">
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>Studio / Distributor</label>
                                    <input type="text" id="edit-studio-${copy.id}" class="form-control" value="${copy.studio || ''}" placeholder="e.g., Warner Bros.">
                                </div>
                            </div>
                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>Country</label>
                                    <input type="text" id="edit-country-${copy.id}" class="form-control" value="${copy.country || ''}" placeholder="e.g., US, CA, UK">
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>Language(s)</label>
                                    <input type="text" id="edit-language-${copy.id}" class="form-control" value="${copy.language || ''}" placeholder="e.g., English, French">
                                </div>
                            </div>
                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>Video Standard</label>
                                    <select id="edit-video-standard-${copy.id}" class="form-control">
                                        <option value="" ${!copy.video_standard ? 'selected' : ''}>Not Specified</option>
                                        <option value="NTSC" ${copy.video_standard === 'NTSC' ? 'selected' : ''}>NTSC</option>
                                        <option value="PAL" ${copy.video_standard === 'PAL' ? 'selected' : ''}>PAL</option>
                                        <option value="SECAM" ${copy.video_standard === 'SECAM' ? 'selected' : ''}>SECAM</option>
                                    </select>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>Barcode (UPC)</label>
                                    <input type="text" id="edit-barcode-${copy.id}" class="form-control" value="${copy.barcode || ''}" placeholder="12-digit UPC">
                                </div>
                            </div>
                            <div class="form-row" style="display:flex; gap:0.5rem;">
                                <div class="form-group" style="flex:1;">
                                    <label>EAN</label>
                                    <input type="text" id="edit-ean-${copy.id}" class="form-control" value="${copy.ean || ''}" placeholder="13-digit EAN">
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label>ASIN</label>
                                    <input type="text" id="edit-asin-${copy.id}" class="form-control" value="${copy.asin || ''}" placeholder="Amazon ASIN">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Bonus Content</label>
                                <input type="text" id="edit-bonus-content-${copy.id}" class="form-control" value="${copy.bonus_content || ''}" placeholder="e.g., Director's commentary, featurettes">
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea id="edit-notes-${copy.id}"
                                          class="form-control"
                                          rows="3"
                                          placeholder="Any additional notes...">${copy.notes || ''}</textarea>
                            </div>

                            <div class="form-actions">
                                <button class="btn" onclick="App.saveCopyEdit(${copy.id}, ${movieId})">💾 Save</button>
                                <button class="btn-secondary" onclick="App.cancelCopyEdit(${copy.id})">Cancel</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Add Copy Button & Inline Form -->
            <button class="btn" id="addCopyBtn" onclick="App.showAddCopyForm(${movieId})" style="margin-top: 1rem; width: 100%;">+ Add Another Copy</button>

            <div id="addCopyFormInline" style="display: none; margin-top: 1rem;" class="copy-item">
                <div class="copy-header"><strong>New Copy</strong></div>
                <div class="copy-edit-form" style="display: block;">
                    <!-- Barcode lookup -->
                    <div class="form-group">
                        <label>Barcode (UPC / EAN / ASIN)</label>
                        <div style="display:flex; gap:0.5rem;">
                            <input type="text" id="new-copy-barcode" class="form-control" placeholder="Scan or type barcode…" style="flex:1;">
                            <button class="btn-secondary" style="white-space:nowrap;" onclick="App.lookupBarcode('new-copy', ${movieId})">🔍 Look Up</button>
                        </div>
                        <div id="new-copy-barcode-result" style="font-size:0.8rem; margin-top:0.25rem; color:var(--text-muted);"></div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>Format *</label>
                            <select id="new-copy-format" class="form-control">
                                <option value="DVD">DVD</option>
                                <option value="Blu-ray" selected>Blu-ray</option>
                                <option value="4K UHD">4K UHD</option>
                                <option value="4K Ultra HD">4K Ultra HD</option>
                                <option value="Digital">Digital</option>
                                <option value="VHS">VHS</option>
                                <option value="LaserDisc">LaserDisc</option>
                                <option value="Betamax">Betamax</option>
                                <option value="HD-DVD">HD-DVD</option>
                                <option value="8mm Film">8mm Film</option>
                                <option value="16mm Film">16mm Film</option>
                                <option value="35mm Film">35mm Film</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Aspect Ratio</label>
                            <select id="new-copy-aspect-ratio" class="form-control">
                                <option value="">Not Specified</option>
                                <option value="Widescreen">Widescreen</option>
                                <option value="Full Screen">Full Screen</option>
                                <option value="Letterbox">Letterbox</option>
                                <option value="Pan & Scan">Pan & Scan</option>
                                <option value="IMAX">IMAX</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>Edition</label>
                            <input type="text" id="new-copy-edition" class="form-control" placeholder="e.g., Director's Cut">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Edition Publisher</label>
                            <input type="text" id="new-copy-edition-publisher" class="form-control" placeholder="e.g., Criterion, Arrow">
                        </div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>Studio / Distributor</label>
                            <input type="text" id="new-copy-studio" class="form-control" placeholder="e.g., Warner Bros.">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Country of Release</label>
                            <input type="text" id="new-copy-country" class="form-control" placeholder="e.g., US, CA, UK">
                        </div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>Package Type</label>
                            <select id="new-copy-package-type" class="form-control">
                                <option value="">Standard Amaray</option>
                                <option value="Steelbook">Steelbook</option>
                                <option value="Digibook">Digibook</option>
                                <option value="Digipack">Digipack</option>
                                <option value="Slipcase">Slipcase</option>
                                <option value="Mediabook">Mediabook</option>
                                <option value="Snap Case">Snap Case</option>
                                <option value="Eco Case">Eco Case</option>
                                <option value="Keep Case">Keep Case</option>
                                <option value="Tin Case">Tin Case</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Video Standard</label>
                            <select id="new-copy-video-standard" class="form-control">
                                <option value="">Not Specified</option>
                                <option value="NTSC">NTSC</option>
                                <option value="PAL">PAL</option>
                                <option value="SECAM">SECAM</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>Feature Count</label>
                            <select id="new-copy-feature-count" class="form-control">
                                <option value="Single" selected>Single Feature</option>
                                <option value="Single + Bonus">Single + Bonus Disc</option>
                                <option value="Double Feature">Double Feature</option>
                                <option value="Triple Feature">Triple Feature</option>
                                <option value="Quadruple Feature">Quadruple Feature</option>
                                <option value="Collection">Collection</option>
                                <option value="Complete Series">Complete Series</option>
                                <option value="Full Saga">Full Saga</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Condition</label>
                            <select id="new-copy-condition" class="form-control">
                                <option value="">Not specified</option>
                                <option value="Mint">Mint</option>
                                <option value="Excellent">Excellent</option>
                                <option value="Good" selected>Good</option>
                                <option value="Fair">Fair</option>
                                <option value="Poor">Poor</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>Region</label>
                            <input type="text" id="new-copy-region" class="form-control" value="${settings.defaultPhysicalRegion || ''}" placeholder="e.g., Region 1">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Language(s)</label>
                            <input type="text" id="new-copy-language" class="form-control" placeholder="e.g., English, French">
                        </div>
                    </div>
                    <div class="form-row" style="display:flex; gap:0.5rem;">
                        <div class="form-group" style="flex:1;">
                            <label>EAN</label>
                            <input type="text" id="new-copy-ean" class="form-control" placeholder="13-digit barcode">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>ASIN</label>
                            <input type="text" id="new-copy-asin" class="form-control" placeholder="Amazon ASIN">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Packaging Extras</label>
                        <div class="packaging-extras-grid">
                            <label class="toggle-chip"><input type="checkbox" id="new-copy-slipcover"><span>Slipcover</span></label>
                            <label class="toggle-chip"><input type="checkbox" id="new-copy-booklet"><span>Booklet</span></label>
                            <label class="toggle-chip"><input type="checkbox" id="new-copy-bonus-disc"><span>Bonus Disc</span></label>
                            <label class="toggle-chip"><input type="checkbox" id="new-copy-digital-copy"><span>Digital Copy</span></label>
                            <label class="toggle-chip"><input type="checkbox" id="new-copy-3d"><span>3D</span></label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Bonus Content</label>
                        <input type="text" id="new-copy-bonus-content" class="form-control" placeholder="e.g., Director's commentary, featurettes">
                    </div>
                    ${isTV ? `
                    <div class="form-group">
                        <label>Seasons Owned</label>
                        <input type="text" id="new-copy-seasons" class="form-control" placeholder="e.g., 1, 2, 3">
                    </div>
                    ` : ''}
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea id="new-copy-notes" class="form-control" rows="2" placeholder="Any additional notes..."></textarea>
                    </div>
                    <div class="form-actions">
                        <button class="btn" onclick="App.saveNewCopy(${movieId})">Add Copy</button>
                        <button class="btn-secondary" onclick="App.hideAddCopyForm()">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('copyManagerModal').classList.add('active');

    } catch (error) {
        console.error('Failed to load copies:', error);
        showToast('Failed to load copies. Try again.', 'error');
    }
}

function closeCopyManager() {
    document.getElementById('copyManagerModal').classList.remove('active');

    // Refresh the movie detail modal behind it so the copies list updates
    if (copyManagerMovieId && document.getElementById('movieDetailModal')?.classList.contains('active')) {
        viewMovieDetails(copyManagerMovieId);
    }
    copyManagerMovieId = null;
}

function showAddCopyForm(movieId) {
    document.getElementById('addCopyBtn').style.display = 'none';
    document.getElementById('addCopyFormInline').style.display = 'block';
    // Scroll the form into view
    document.getElementById('addCopyFormInline').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAddCopyForm() {
    document.getElementById('addCopyFormInline').style.display = 'none';
    document.getElementById('addCopyBtn').style.display = 'block';
}

async function lookupBarcode(prefix, movieId) {
    const barcodeEl = document.getElementById(`${prefix}-barcode`);
    const resultEl = document.getElementById(`${prefix}-barcode-result`);
    const barcode = barcodeEl?.value.trim();
    if (!barcode) { showToast('Enter a barcode first', 'error'); return; }

    if (resultEl) resultEl.textContent = 'Looking up…';
    try {
        const data = await apiCall('barcode_lookup', { barcode });
        if (!data.found) {
            if (resultEl) resultEl.textContent = 'No results found for this barcode.';
            return;
        }
        if (resultEl) resultEl.textContent = `Found via ${data.source || 'UMDB'} (confidence: ${data.confidence ?? '?'})`;

        // Prefill form fields with lookup data
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set(`${prefix}-edition-publisher`, data.edition_publisher || data.distributor);
        set(`${prefix}-studio`, data.studio);
        set(`${prefix}-country`, data.country);
        set(`${prefix}-language`, data.language);
        set(`${prefix}-ean`, data.ean || (barcode.length === 13 ? barcode : ''));
        set(`${prefix}-asin`, data.asin);
        if (data.edition_name) set(`${prefix}-edition`, data.edition_name);

        // Auto-select format if detected
        if (data.format) {
            const fmtEl = document.getElementById(`${prefix}-format`);
            if (fmtEl) {
                const opts = Array.from(fmtEl.options);
                const match = opts.find(o => o.value.toLowerCase() === data.format.toLowerCase());
                if (match) fmtEl.value = match.value;
            }
        }

        if (data.cover_image_url) {
            const img = document.querySelector(`#copyManagerModal .movie-poster-img`);
            if (img) img.src = data.cover_image_url;
        }

        showToast('Form prefilled from barcode lookup!', 'success');
    } catch (err) {
        if (resultEl) resultEl.textContent = 'Lookup failed — check your connection.';
        showToast(err.message || 'Barcode lookup failed', 'error');
    }
}

async function saveNewCopy(movieId) {
    const format = document.getElementById('new-copy-format').value;
    const aspectRatio = document.getElementById('new-copy-aspect-ratio')?.value || '';
    const edition = document.getElementById('new-copy-edition').value.trim();
    const packageType = document.getElementById('new-copy-package-type')?.value || '';
    const featureCount = document.getElementById('new-copy-feature-count')?.value || 'Single';
    const condition = document.getElementById('new-copy-condition').value;
    const region = document.getElementById('new-copy-region').value.trim();
    const hasSlipcover = document.getElementById('new-copy-slipcover')?.checked ? 1 : 0;
    const hasBooklet = document.getElementById('new-copy-booklet')?.checked ? 1 : 0;
    const hasBonusDisc = document.getElementById('new-copy-bonus-disc')?.checked ? 1 : 0;
    const hasDigitalCopy = document.getElementById('new-copy-digital-copy')?.checked ? 1 : 0;
    const has3d = document.getElementById('new-copy-3d')?.checked ? 1 : 0;
    const seasonsEl = document.getElementById('new-copy-seasons');
    const seasonsOwned = seasonsEl ? seasonsEl.value.trim() : '';
    const notes = document.getElementById('new-copy-notes').value.trim();
    const barcode = document.getElementById('new-copy-barcode')?.value.trim() || '';
    const ean = document.getElementById('new-copy-ean')?.value.trim() || '';
    const asin = document.getElementById('new-copy-asin')?.value.trim() || '';
    const editionPublisher = document.getElementById('new-copy-edition-publisher')?.value.trim() || '';
    const studio = document.getElementById('new-copy-studio')?.value.trim() || '';
    const country = document.getElementById('new-copy-country')?.value.trim() || '';
    const language = document.getElementById('new-copy-language')?.value.trim() || '';
    const videoStandard = document.getElementById('new-copy-video-standard')?.value || '';
    const bonusContent = document.getElementById('new-copy-bonus-content')?.value.trim() || '';

    try {
        await apiCall('add_copy', {
            movie_id: movieId,
            format,
            edition,
            region,
            condition,
            notes,
            barcode,
            seasons_owned: seasonsOwned,
            cert_region: settings.certRegion || 'US',
            aspect_ratio: aspectRatio,
            package_type: packageType,
            feature_count: featureCount,
            has_slipcover: hasSlipcover,
            has_booklet: hasBooklet,
            has_bonus_disc: hasBonusDisc,
            bonus_disc_count: hasBonusDisc ? 1 : 0,
            has_digital_copy: hasDigitalCopy,
            has_3d: has3d,
            ean,
            asin,
            edition_publisher: editionPublisher,
            studio,
            country,
            language,
            video_standard: videoStandard,
            bonus_content: bonusContent
        });

        showToast('Copy added!', 'success');
        loadCollection();
        // Refresh the copy manager to show the new copy
        await openCopyManager(movieId);
    } catch (error) {
        console.error('Failed to add copy:', error);
        showToast(error.message || 'Failed to add copy', 'error');
    }
}

function editCopy(copyId) {
    // Hide view mode, show edit mode
    document.getElementById(`copy-view-${copyId}`).style.display = 'none';
    document.getElementById(`copy-edit-${copyId}`).style.display = 'block';
}

function cancelCopyEdit(copyId) {
    // Hide edit mode, show view mode
    document.getElementById(`copy-edit-${copyId}`).style.display = 'none';
    document.getElementById(`copy-view-${copyId}`).style.display = 'block';
}

async function saveCopyEdit(copyId, movieId) {
    const format = document.getElementById(`edit-format-${copyId}`).value;
    const edition = document.getElementById(`edit-edition-${copyId}`).value.trim();
    const region = document.getElementById(`edit-region-${copyId}`).value.trim();
    const condition = document.getElementById(`edit-condition-${copyId}`).value;
    const notes = document.getElementById(`edit-notes-${copyId}`).value.trim();
    const seasonsEl = document.getElementById(`edit-seasons-${copyId}`);
    const seasonsOwned = seasonsEl ? seasonsEl.value.trim() : '';
    // Physical media attributes (v3.0.0)
    const aspectRatio = document.getElementById(`edit-aspect-ratio-${copyId}`)?.value || '';
    const packageType = document.getElementById(`edit-package-type-${copyId}`)?.value || '';
    const featureCount = document.getElementById(`edit-feature-count-${copyId}`)?.value || 'Single';
    const hasSlipcover = document.getElementById(`edit-slipcover-${copyId}`)?.checked ? 1 : 0;
    const hasBooklet = document.getElementById(`edit-booklet-${copyId}`)?.checked ? 1 : 0;
    const hasBonusDisc = document.getElementById(`edit-bonus-disc-${copyId}`)?.checked ? 1 : 0;
    const bonusDiscCount = hasBonusDisc ? parseInt(document.getElementById(`edit-bonus-disc-count-${copyId}`)?.value || '1') : 0;
    const hasDigitalCopy = document.getElementById(`edit-digital-copy-${copyId}`)?.checked ? 1 : 0;
    const has3d = document.getElementById(`edit-3d-${copyId}`)?.checked ? 1 : 0;
    // UMDB-compatible fields (v8.0.0)
    const barcode = document.getElementById(`edit-barcode-${copyId}`)?.value.trim() || '';
    const ean = document.getElementById(`edit-ean-${copyId}`)?.value.trim() || '';
    const asin = document.getElementById(`edit-asin-${copyId}`)?.value.trim() || '';
    const editionPublisher = document.getElementById(`edit-edition-publisher-${copyId}`)?.value.trim() || '';
    const studio = document.getElementById(`edit-studio-${copyId}`)?.value.trim() || '';
    const country = document.getElementById(`edit-country-${copyId}`)?.value.trim() || '';
    const language = document.getElementById(`edit-language-${copyId}`)?.value.trim() || '';
    const videoStandard = document.getElementById(`edit-video-standard-${copyId}`)?.value || '';
    const bonusContent = document.getElementById(`edit-bonus-content-${copyId}`)?.value.trim() || '';

    if (!format) {
        showToast('Format is required', 'error');
        return;
    }

    try {
        await apiCall('update_copy', {
            copy_id: copyId,
            format,
            edition,
            region,
            condition,
            notes,
            barcode,
            seasons_owned: seasonsOwned,
            aspect_ratio: aspectRatio,
            package_type: packageType,
            feature_count: featureCount,
            has_slipcover: hasSlipcover,
            has_booklet: hasBooklet,
            has_bonus_disc: hasBonusDisc,
            bonus_disc_count: bonusDiscCount,
            has_digital_copy: hasDigitalCopy,
            has_3d: has3d,
            ean,
            asin,
            edition_publisher: editionPublisher,
            studio,
            country,
            language,
            video_standard: videoStandard,
            bonus_content: bonusContent
        });
        
        showToast('Copy updated successfully!', 'success');

        // Reload the copy manager to show updated values
        await openCopyManager(movieId);

        // Silently reload collection data without re-rendering
        try {
            const data = await apiCall('list_collection');
            const grouped = {};
            (data || []).forEach(item => {
                if (!grouped[item.movie_id]) {
                    grouped[item.movie_id] = { movie: item, copies: [] };
                }
                grouped[item.movie_id].copies.push(item);
            });
            collection = Object.values(grouped);
            originalCollection = [...collection];
            collectionDirty = true;
        } catch (e) {
            console.error('Failed to refresh collection data:', e);
        }

    } catch (error) {
        console.error('Failed to update copy:', error);
        showToast('Failed to update copy', 'error');
    }
}

async function deleteCopy(copyId, movieId) {
    if (!confirm('Delete this copy?')) return;

    const copyManagerOpen = document.getElementById('copyManagerModal')?.classList.contains('active');

    try {
        await apiCall('delete_copy', { copy_id: copyId });
        showToast('Copy deleted', 'success');

        // Refresh the copy manager list in-place if it's open
        if (copyManagerOpen && movieId) {
            await openCopyManager(movieId);
        }

        // Reload collection data
        try {
            const data = await apiCall('list_collection');
            const grouped = {};
            (data || []).forEach(item => {
                if (!grouped[item.movie_id]) {
                    grouped[item.movie_id] = { movie: item, copies: [] };
                }
                grouped[item.movie_id].copies.push(item);
            });
            collection = Object.values(grouped);
            originalCollection = [...collection];
        } catch (e) {
            console.error('Failed to refresh collection data:', e);
        }

        // If no modal is covering the grid, re-render immediately
        if (!copyManagerOpen && !document.getElementById('movieDetailModal')?.classList.contains('active')) {
            const sortBy = document.getElementById('sortBy')?.value || 'title';
            sortMovies('collection', sortBy);
        } else {
            collectionDirty = true;
        }
    } catch (error) {
        console.error('Failed to delete copy:', error);
    }
}
    
    // ========================================
    // PHYSICAL MEDIA EDITIONS & COMPONENT TRACKING
    // ========================================

    async function openEditionPicker(copyId, movieId) {
        try {
            const editions = await apiCall('get_editions', { movie_id: movieId });
            const modal = document.getElementById('copyManagerContent');

            // Build picker UI
            let html = `
                <div class="edition-picker" id="edition-picker-${copyId}">
                    <h4>Select Physical Edition</h4>
                    <p class="text-muted" style="font-size:0.85rem; margin-bottom:1rem;">
                        Link this copy to a specific physical release to track individual components (booklet, insert, discs, etc.)
                    </p>
            `;

            if (editions && editions.length > 0) {
                html += `<div class="edition-list">`;
                for (const ed of editions) {
                    const umdbBadge = ed.umdb_release_id
                        ? `<span class="umdb-link-badge" title="Linked: ${ed.umdb_release_id}">UMDB</span>`
                        : '';
                    const edPickerRawLangs = ed.languages || '';
                    const edPickerLangs = Array.isArray(edPickerRawLangs) ? edPickerRawLangs.join(', ') : edPickerRawLangs;
                    const edPickerTags = [ed.format, ed.edition_type, ed.video_system, ed.region, ed.copy_protected == 1 ? '🔒' : ''].filter(Boolean);
                    html += `
                        <div class="edition-option" onclick="App.linkCopyToEdition(${copyId}, ${ed.id}, ${movieId})">
                            <div class="edition-option-name">${ed.name} ${umdbBadge}</div>
                            <div class="edition-option-meta">
                                ${edPickerTags.map(t => `<span>${t}</span>`).join('')}
                                ${ed.distributor ? `<span>${ed.distributor}</span>` : ''}
                                ${ed.component_count ? `<span>${ed.component_count} components</span>` : ''}
                            </div>
                            ${edPickerLangs ? `<div class="edition-option-meta" style="color:rgba(255,255,255,0.5); margin-top:0.2rem;"><span>${edPickerLangs}</span></div>` : ''}
                        </div>
                    `;
                }
                html += `</div>`;
            } else {
                html += `<p class="text-muted" style="font-size:0.9rem;">No editions defined for this title yet.</p>`;
            }

            html += `
                    <div style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <button class="btn" onclick="App.showCreateEdition(${copyId}, ${movieId})">+ Create New Edition</button>
                        <button class="btn btn-umdb" onclick="App.showImportFromUmdb(${copyId}, ${movieId})">Import from UMDB</button>
                        <button class="btn btn-amazon" onclick="App.showImportFromAmazon(${copyId}, ${movieId})">🛒 Import from Amazon</button>
                        <button class="btn-secondary" onclick="App.openCopyManager(${movieId})">Cancel</button>
                    </div>
                </div>
            `;

            modal.innerHTML = html;
        } catch (error) {
            console.error('Failed to load editions:', error);
            showToast('Failed to load editions', 'error');
        }
    }

    async function linkCopyToEdition(copyId, editionId, movieId) {
        try {
            await apiCall('initialize_copy_components', { copy_id: copyId, edition_id: editionId });
            showToast('Edition linked! Component tracking enabled.', 'success');
            await openCopyManager(movieId);
        } catch (error) {
            console.error('Failed to link edition:', error);
            showToast('Failed to link edition', 'error');
        }
    }

    async function unlinkCopyEdition(copyId, movieId) {
        if (!confirm('Unlink this edition? Component tracking data will be removed.')) return;
        try {
            await apiCall('unlink_copy_edition', { copy_id: copyId });
            showToast('Edition unlinked', 'info');
            await openCopyManager(movieId);
        } catch (error) {
            console.error('Failed to unlink edition:', error);
            showToast('Failed to unlink edition', 'error');
        }
    }

    function showCreateEdition(copyId, movieId) {
        const modal = document.getElementById('copyManagerContent');

        const componentTypes = [
            { value: 'disc', label: 'Disc' },
            { value: 'booklet', label: 'Booklet' },
            { value: 'insert', label: 'Insert / Inlet' },
            { value: 'slipcover', label: 'Slipcover' },
            { value: 'poster', label: 'Poster' },
            { value: 'art_cards', label: 'Art Cards' },
            { value: 'digital_code', label: 'Digital Code' },
            { value: 'case', label: 'Case' },
            { value: 'outer_case', label: 'Outer Case / O-Ring' },
            { value: 'stickers', label: 'Stickers' },
            { value: 'other', label: 'Other' }
        ];

        modal.innerHTML = `
            <div class="create-edition-form">
                <h4>Create Physical Edition</h4>
                <p class="text-muted" style="font-size:0.85rem; margin-bottom:1rem;">
                    Define what this physical release includes. Other users will see this edition too.
                </p>

                <div class="form-row" style="display:flex; gap:0.5rem;">
                    <div class="form-group" style="flex:2;">
                        <label>Edition Name *</label>
                        <input type="text" id="edition-name" class="form-control"
                               placeholder='e.g., "Arrow Video Limited Edition" or "Criterion #456"'>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Format</label>
                        <select id="edition-format" class="form-control">
                            <option value="">Not Specified</option>
                            <option value="DVD">DVD</option>
                            <option value="Blu-ray">Blu-ray</option>
                            <option value="4K UHD">4K UHD</option>
                            <option value="4K Ultra HD">4K Ultra HD</option>
                            <option value="VHS">VHS</option>
                            <option value="LaserDisc">LaserDisc</option>
                        </select>
                    </div>
                </div>

                <div class="form-row" style="display:flex; gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Distributor / Label</label>
                        <input type="text" id="edition-distributor" class="form-control"
                               placeholder="e.g., Arrow Video, Criterion, Shout Factory">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Package Type</label>
                        <select id="edition-package-type" class="form-control">
                            <option value="">Standard</option>
                            <option value="Steelbook">Steelbook</option>
                            <option value="Digibook">Digibook</option>
                            <option value="Digipack">Digipack</option>
                            <option value="Slipcase">Slipcase</option>
                            <option value="Mediabook">Mediabook</option>
                            <option value="Keep Case">Keep Case</option>
                            <option value="Snap Case">Snap Case</option>
                            <option value="Tin Case">Tin Case</option>
                        </select>
                    </div>
                </div>

                <div class="form-row" style="display:flex; gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Region</label>
                        <input type="text" id="edition-region" class="form-control" placeholder="e.g., Region A, Region 1">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Country</label>
                        <input type="text" id="edition-country" class="form-control" placeholder="e.g., USA, UK">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Barcode</label>
                        <input type="text" id="edition-barcode" class="form-control" placeholder="UPC / EAN">
                    </div>
                </div>

                <div class="form-row" style="display:flex; gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Release Date</label>
                        <input type="date" id="edition-release-date" class="form-control">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Disc Count</label>
                        <input type="number" id="edition-disc-count" class="form-control" min="1" max="20" value="1">
                    </div>
                </div>

                <div class="form-group">
                    <label>Components (what's in the box)</label>
                    <div id="edition-components-list" class="edition-components-builder">
                    </div>
                    <button class="btn-secondary" style="margin-top:0.5rem; font-size:0.85rem;" onclick="App.addEditionComponentRow()">+ Add Component</button>
                </div>

                <div class="form-group">
                    <label>Notes</label>
                    <textarea id="edition-notes" class="form-control" rows="2" placeholder="Any additional details..."></textarea>
                </div>

                <div class="form-actions" style="display:flex; gap:0.5rem; margin-top:1rem;">
                    <button class="btn" onclick="App.saveNewEdition(${copyId}, ${movieId})">Save Edition</button>
                    <button class="btn-secondary" onclick="App.openEditionPicker(${copyId}, ${movieId})">Back</button>
                </div>
            </div>
        `;

        // Add a few default component rows
        addEditionComponentRow('disc', 'Feature Film Disc');
        addEditionComponentRow('case', 'Case');
    }

    function addEditionComponentRow(defaultType, defaultName) {
        const list = document.getElementById('edition-components-list');
        if (!list) return;
        const index = list.children.length;

        const componentTypes = [
            { value: 'disc', label: 'Disc' },
            { value: 'booklet', label: 'Booklet' },
            { value: 'insert', label: 'Insert / Inlet' },
            { value: 'slipcover', label: 'Slipcover' },
            { value: 'poster', label: 'Poster' },
            { value: 'art_cards', label: 'Art Cards' },
            { value: 'digital_code', label: 'Digital Code' },
            { value: 'case', label: 'Case' },
            { value: 'outer_case', label: 'Outer Case / O-Ring' },
            { value: 'stickers', label: 'Stickers' },
            { value: 'other', label: 'Other' }
        ];

        const row = document.createElement('div');
        row.className = 'component-row';
        row.innerHTML = `
            <select class="form-control comp-type" style="flex:1;">
                ${componentTypes.map(t => `<option value="${t.value}" ${t.value === (defaultType || '') ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            <input type="text" class="form-control comp-name" placeholder="Component name" value="${defaultName || ''}" style="flex:2;">
            <button class="btn-icon" onclick="this.parentElement.remove()" title="Remove" style="flex-shrink:0;">x</button>
        `;
        list.appendChild(row);
    }

    async function saveNewEdition(copyId, movieId) {
        const name = document.getElementById('edition-name')?.value.trim();
        if (!name) {
            showToast('Edition name is required', 'error');
            return;
        }

        const components = [];
        const rows = document.querySelectorAll('#edition-components-list .component-row');
        rows.forEach((row, i) => {
            const type = row.querySelector('.comp-type')?.value;
            const compName = row.querySelector('.comp-name')?.value.trim();
            if (type && compName) {
                components.push({
                    component_type: type,
                    component_name: compName,
                    position: i
                });
            }
        });

        try {
            const result = await apiCall('create_edition', {
                movie_id: movieId,
                name: name,
                format: document.getElementById('edition-format')?.value || '',
                package_type: document.getElementById('edition-package-type')?.value || '',
                region: document.getElementById('edition-region')?.value.trim() || '',
                barcode: document.getElementById('edition-barcode')?.value.trim() || '',
                release_date: document.getElementById('edition-release-date')?.value || '',
                distributor: document.getElementById('edition-distributor')?.value.trim() || '',
                country: document.getElementById('edition-country')?.value.trim() || '',
                disc_count: parseInt(document.getElementById('edition-disc-count')?.value || '1'),
                notes: document.getElementById('edition-notes')?.value.trim() || '',
                components: components
            });

            if (result && result.edition_id) {
                showToast('Edition created!', 'success');
                // Auto-link this copy to the new edition
                if (copyId) {
                    await linkCopyToEdition(copyId, result.edition_id, movieId);
                } else {
                    await openCopyManager(movieId);
                }
            }
        } catch (error) {
            console.error('Failed to create edition:', error);
            showToast('Failed to create edition', 'error');
        }
    }

    async function openComponentChecklist(copyId, movieId) {
        try {
            const data = await apiCall('get_copy_components', { copy_id: copyId });
            const modal = document.getElementById('copyManagerContent');

            const edition    = data?.edition || null;
            const components = data?.components || [];
            const editionId  = edition?.id || null;
            const format     = edition?.format || 'DVD';
            const discCount  = parseInt(edition?.disc_count || 1) || 1;

            const conditionOptions = ['Mint', 'Near Mint', 'Good', 'Fair', 'Poor', 'Missing'];
            const typeIcons = {
                disc: '💿', booklet: '📖', insert: '📄', slipcover: '🖼️', poster: '🖼️',
                art_cards: '🎨', digital_code: '🔑', case: '📦', outer_case: '📦',
                stickers: '⭐', other: '📌'
            };
            const typeLabels = {
                disc: 'Disc', booklet: 'Booklet / Book', insert: 'Insert / Paper',
                slipcover: 'Slipcover', poster: 'Poster', art_cards: 'Art Cards',
                digital_code: 'Digital Code', case: 'Case', outer_case: 'Outer Case / Slipbox',
                stickers: 'Stickers', other: 'Other'
            };
            const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            let html = `
                <div class="component-checklist">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <div>
                            <h4 style="margin:0;">Component Checklist</h4>
                            <p class="text-muted" style="font-size:0.82rem; margin:0.25rem 0 0;">
                                ${edition ? esc(edition.name||'') + (edition.distributor ? ' &mdash; ' + esc(edition.distributor) : '') : 'No edition linked'}
                            </p>
                        </div>
                        <button class="btn-secondary" style="font-size:0.85rem;" onclick="App.openCopyManager(${movieId})">Back</button>
                    </div>
            `;

            if (!editionId) {
                html += `<p style="color:#aaa;font-size:0.9rem;margin:1rem 0;">Link a physical edition to this copy first, then you can track its components here.</p>`;
            } else if (components.length === 0) {
                html += `
                    <div style="text-align:center;padding:1.5rem 0.5rem;">
                        <p style="color:#aaa;font-size:0.9rem;margin-bottom:1rem;">No components defined for this edition yet.</p>
                        <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
                            <button class="btn btn-sm" onclick="App.addStandardComponents(${editionId},${copyId},${movieId},'${esc(format)}',${discCount})">
                                📋 Add Standard Items (${esc(format)})
                            </button>
                            <button class="btn-secondary btn-sm" onclick="App._showAddComponentForm(${editionId},${copyId},${movieId})">
                                ➕ Custom Item
                            </button>
                        </div>
                    </div>
                `;
            } else {
                const presentCount = components.filter(c => c.is_present == 1).length;
                html += `<div class="component-items">`;
                for (const comp of components) {
                    const icon    = typeIcons[comp.component_type] || '📌';
                    const present = comp.is_present == 1;
                    const condition = comp.user_condition || 'Good';
                    html += `
                        <div class="component-item ${present ? 'component-present' : 'component-missing'}" id="comp-item-${comp.edition_component_id}">
                            <div class="component-item-header">
                                <label class="component-toggle">
                                    <input type="checkbox" ${present ? 'checked' : ''}
                                        onchange="App.toggleComponent(${copyId}, ${comp.edition_component_id}, this.checked, ${movieId})">
                                    <span class="component-toggle-label">
                                        <span class="component-icon">${icon}</span>
                                        ${esc(comp.component_name)}
                                    </span>
                                </label>
                            </div>
                            <div class="component-item-details" style="${present ? '' : 'opacity:0.4;'}">
                                <select class="form-control component-condition"
                                        data-copy-id="${copyId}"
                                        data-comp-id="${comp.edition_component_id}"
                                        onchange="App.updateComponentCondition(${copyId}, ${comp.edition_component_id}, this.value)">
                                    ${conditionOptions.map(c => `<option value="${c}" ${condition === c ? 'selected' : ''}>${c}</option>`).join('')}
                                </select>
                                ${comp.description ? `<span class="component-desc">${esc(comp.description)}</span>` : ''}
                            </div>
                        </div>
                    `;
                }
                html += `</div>
                    <div class="component-summary">
                        <span id="comp-summary-count">${presentCount} of ${components.length}</span> components present
                    </div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
                        <button class="btn-secondary btn-sm" style="font-size:0.8rem;"
                                onclick="App._showAddComponentForm(${editionId},${copyId},${movieId})">➕ Add Item</button>
                    </div>
                `;
            }

            html += `<div id="add-component-form-slot" style="margin-top:0.75rem;"></div></div>`;
            modal.innerHTML = html;
        } catch (error) {
            console.error('Failed to load components:', error);
            showToast('Failed to load component checklist', 'error');
        }
    }

    function _showAddComponentForm(editionId, copyId, movieId) {
        const slot = document.getElementById('add-component-form-slot');
        if (!slot) return;
        const opts = {
            disc: '💿 Disc', booklet: '📖 Booklet / Book', insert: '📄 Insert / Paper',
            slipcover: '🖼️ Slipcover', poster: '🖼️ Poster', art_cards: '🎨 Art Cards',
            digital_code: '🔑 Digital Code', case: '📦 Case', outer_case: '📦 Outer Case / Slipbox',
            stickers: '⭐ Stickers', other: '📌 Other'
        };
        slot.innerHTML = `
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:0.75rem;border:1px solid rgba(255,255,255,0.12);">
                <h5 style="margin:0 0 0.6rem;font-size:0.85rem;color:#a8b8ff;">Add New Item</h5>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;">
                    <div style="flex:2;min-width:120px;">
                        <input type="text" id="new-comp-name" class="form-control" style="font-size:0.85rem;"
                               placeholder="e.g. Booklet, Slipcase, Bonus Disc…"
                               onkeydown="if(event.key==='Enter') App.saveAddedComponent(${editionId},${copyId},${movieId})">
                    </div>
                    <div style="flex:1;min-width:110px;">
                        <select id="new-comp-type" class="form-control" style="font-size:0.85rem;">
                            ${Object.entries(opts).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
                        </select>
                    </div>
                    <button class="btn btn-sm" style="font-size:0.82rem;"
                            onclick="App.saveAddedComponent(${editionId},${copyId},${movieId})">Add →</button>
                    <button class="btn-secondary btn-sm" style="font-size:0.82rem;"
                            onclick="document.getElementById('add-component-form-slot').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
        document.getElementById('new-comp-name')?.focus();
    }

    async function saveAddedComponent(editionId, copyId, movieId) {
        const name = document.getElementById('new-comp-name')?.value.trim();
        const type = document.getElementById('new-comp-type')?.value || 'other';
        if (!name) { showToast('Please enter an item name', 'error'); return; }
        try {
            await apiCall('add_edition_component', {
                edition_id: editionId,
                component_type: type,
                component_name: name,
                position: 99
            });
            await openComponentChecklist(copyId, movieId);
        } catch (e) {
            showToast(e.message || 'Failed to add item', 'error');
        }
    }

    async function addStandardComponents(editionId, copyId, movieId, format, discCount) {
        const discLabel =
            format === 'Blu-ray'                         ? 'Blu-ray Disc'      :
            (format === '4K UHD' || format === '4K Ultra HD') ? '4K Ultra HD Disc' :
            format === 'VHS'                             ? 'VHS Cassette'       :
            format === 'LaserDisc'                       ? 'LaserDisc'          : 'DVD Disc';
        const count = parseInt(discCount) || 1;
        const comps = [{ type: 'case', name: 'Case', pos: 0 }];
        for (let i = 1; i <= Math.min(count, 6); i++) {
            comps.push({ type: 'disc', name: count > 1 ? `${discLabel} ${i}` : discLabel, pos: i });
        }
        if (format === '4K UHD' || format === '4K Ultra HD') {
            comps.push({ type: 'disc', name: 'Blu-ray Disc', pos: count + 1 });
        }
        try {
            for (const c of comps) {
                await apiCall('add_edition_component', {
                    edition_id: editionId, component_type: c.type,
                    component_name: c.name, position: c.pos
                });
            }
            showToast(`${comps.length} standard items added`, 'success');
            await openComponentChecklist(copyId, movieId);
        } catch (e) {
            showToast(e.message || 'Failed to add standard items', 'error');
        }
    }

    async function toggleComponent(copyId, editionComponentId, isPresent, movieId) {
        try {
            const item        = document.getElementById(`comp-item-${editionComponentId}`);
            const details     = item?.querySelector('.component-item-details');
            const conditionSel = item?.querySelector('.component-condition');
            let condition     = conditionSel?.value || 'Good';

            if (isPresent) {
                item?.classList.remove('component-missing');
                item?.classList.add('component-present');
                if (details) details.style.opacity = '';
                // Reset from Missing → Good when re-checking
                if (conditionSel && conditionSel.value === 'Missing') {
                    conditionSel.value = 'Good';
                    condition = 'Good';
                }
            } else {
                item?.classList.remove('component-present');
                item?.classList.add('component-missing');
                if (details) details.style.opacity = '0.4';
                // Auto-mark as Missing when unchecked
                if (conditionSel) conditionSel.value = 'Missing';
                condition = 'Missing';
            }

            // Update summary count
            const checkboxes = document.querySelectorAll('.component-toggle input[type="checkbox"]');
            const presentCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            const summaryEl = document.getElementById('comp-summary-count');
            if (summaryEl) summaryEl.textContent = `${presentCount} of ${checkboxes.length}`;

            await apiCall('update_copy_component', {
                copy_id: copyId,
                edition_component_id: editionComponentId,
                is_present: isPresent ? 1 : 0,
                condition: condition
            });
        } catch (error) {
            console.error('Failed to update component:', error);
            showToast('Failed to update component', 'error');
        }
    }

    async function updateComponentCondition(copyId, editionComponentId, condition) {
        try {
            const item = document.getElementById(`comp-item-${editionComponentId}`);
            const isPresent = item?.querySelector('.component-toggle input')?.checked ? 1 : 0;

            await apiCall('update_copy_component', {
                copy_id: copyId,
                edition_component_id: editionComponentId,
                is_present: isPresent,
                condition: condition
            });
        } catch (error) {
            console.error('Failed to update condition:', error);
            showToast('Failed to update condition', 'error');
        }
    }

    // ========================================
    // UMDB TWO-WAY SYNC (v4.1.0)
    // Import from UMDB, push to UMDB, sync, link/unlink
    // ========================================

    async function showImportFromUmdb(copyId, movieId) {
        const modal = document.getElementById('copyManagerContent');

        // Get the movie's tmdb_id or imdb_id for UMDB lookup
        const group = collection.find(c => c.movie.movie_id === movieId);
        if (!group) {
            showToast('Movie not found in collection', 'error');
            return;
        }

        const tmdbId = group.movie.tmdb_id;
        const imdbId = group.movie.imdb_id;

        modal.innerHTML = `
            <div class="edition-picker">
                <h4>Import from UMDB</h4>
                <p class="text-muted" style="font-size:0.85rem; margin-bottom:1rem;">
                    Search UMDB for physical releases to import as a local edition.
                </p>
                <div class="form-group">
                    <label>Search by title or barcode</label>
                    <div style="display:flex; gap:0.5rem;">
                        <input type="text" id="umdb-import-query" class="form-control" placeholder="Search releases..."
                               value="${group.movie.title || ''}" style="flex:1;">
                        <button class="btn" onclick="App.searchUmdbReleases(${copyId}, ${movieId})">Search</button>
                    </div>
                </div>
                ${imdbId ? `<button class="btn-secondary" style="margin-bottom:1rem; font-size:0.85rem;"
                    onclick="App.searchUmdbByExternalId(${copyId}, ${movieId}, '${imdbId}')">
                    Find by IMDb ID (${imdbId})</button>` : ''}
                <div id="umdb-import-results" style="margin-top:0.5rem;">
                    <p class="text-muted" style="font-size:0.85rem;">Enter a search term and click Search to find UMDB releases.</p>
                </div>
                <div style="margin-top:1rem;">
                    <button class="btn-secondary" onclick="App.openEditionPicker(${copyId}, ${movieId})">Back</button>
                </div>
            </div>
        `;

        // Auto-search if we have a title
        if (group.movie.title) {
            searchUmdbReleases(copyId, movieId);
        }
    }

    // Render a single UMDB release as a selectable card.
    // Box-set releases (is_box_set:true) get a special multi-film card with "Add Full Box Set".
    function renderUmdbReleaseCard(rel, copyId, movieId) {
        const relId  = rel.id || rel.release_id || '';
        const name   = rel.name || rel.title || 'Unnamed Release';
        const format = rel.format || '';

        if (rel.is_box_set && rel.box_set_id) {
            // --- Box Set Release Card ---
            const bsMovies = rel.box_set_movies || [];
            const filmList = bsMovies.map(m =>
                `<span style="display:inline-block;margin-right:0.5rem;color:rgba(255,255,255,0.7);">` +
                `${m.disc_label ? m.disc_label + ': ' : ''}${m.title}</span>`
            ).join('');
            return `
                <div class="edition-option" style="border-left:3px solid #a78bfa;">
                    <div class="edition-option-name">
                        ${name}
                        <span class="umdb-link-badge">UMDB</span>
                        <span style="background:#7c3aed;color:#fff;font-size:0.7rem;padding:1px 6px;border-radius:4px;margin-left:4px;">BOX SET</span>
                    </div>
                    ${format ? `<div class="edition-option-meta"><span>${format}</span><span style="color:rgba(255,255,255,0.5);">${bsMovies.length} films</span></div>` : ''}
                    ${filmList ? `<div style="margin-top:0.3rem;font-size:0.8rem;">${filmList}</div>` : ''}
                    <div style="margin-top:0.5rem;">
                        <button class="btn" style="font-size:0.8rem;padding:4px 12px;"
                            onclick="App.importUmdbBoxset(${movieId}, '${relId}', ${JSON.stringify(name)})">
                            Add Full Box Set
                        </button>
                    </div>
                </div>
            `;
        }

        // --- Standard Release Card ---
        const distributor = rel.distributor || rel.label || '';
        const barcode     = rel.barcode || rel.upc || '';
        const rawLangs    = rel.languages || rel.language || '';
        const langs       = Array.isArray(rawLangs) ? rawLangs.join(', ') : rawLangs;
        const videoSys    = rel.video_system || rel.system || rel.standard || '';
        const region      = rel.region || '';
        const edType      = rel.edition_type || rel.type || '';
        const copyProt    = rel.copy_protected || rel.is_copy_protected ? '🔒' : '';
        const rawAudio    = rel.audio_formats || rel.audio || '';
        const audio       = Array.isArray(rawAudio) ? rawAudio.join(', ') : rawAudio;
        const asin        = rel.asin || '';
        const metaTags    = [format, edType, videoSys, region, copyProt].filter(Boolean);
        return `
            <div class="edition-option" onclick="App.importUmdbRelease(${copyId}, ${movieId}, '${relId}')">
                <div class="edition-option-name">${name} <span class="umdb-link-badge">UMDB</span></div>
                <div class="edition-option-meta">
                    ${metaTags.map(t => `<span>${t}</span>`).join('')}
                    ${distributor ? `<span style="color:rgba(255,255,255,0.6);">${distributor}</span>` : ''}
                </div>
                ${(langs || audio || asin) ? `<div class="edition-option-meta" style="margin-top:0.2rem;">
                    ${langs ? `<span style="color:rgba(255,255,255,0.6);">${langs}</span>` : ''}
                    ${audio ? `<span style="color:rgba(255,255,255,0.5);">${audio}</span>` : ''}
                    ${asin ? `<span style="color:rgba(255,255,255,0.4); font-family:monospace; font-size:0.75rem;">ASIN: ${asin}</span>` : ''}
                </div>` : ''}
                ${barcode ? `<div class="edition-option-meta" style="color:rgba(255,255,255,0.35); font-family:monospace; font-size:0.75rem;">UPC: ${barcode}</div>` : ''}
            </div>
        `;
    }

    async function importUmdbBoxset(movieId, releaseId, boxSetName) {
        if (!releaseId) { showToast('No release ID', 'error'); return; }
        if (!confirm(`Add the full box set "${boxSetName}" to your collection?\n\nAll included films will be added and grouped together.`)) return;
        try {
            const result = await apiCall('import_umdb_boxset', { release_id: releaseId, movie_id: movieId });
            if (result && result.container_id) {
                const msg = `Box set added! ${result.movies_added} film${result.movies_added !== 1 ? 's' : ''} added to your collection.`;
                showToast(msg, 'success');
                if (result.errors && result.errors.length > 0) {
                    console.warn('Box set import warnings:', result.errors);
                }
                await loadCollection();
                switchTab('collection');
            }
        } catch (error) {
            console.error('Failed to import box set:', error);
            showToast(error.message || 'Failed to import box set from UMDB', 'error');
        }
    }

    async function searchUmdbReleases(copyId, movieId) {
        const query = document.getElementById('umdb-import-query')?.value.trim();
        const resultsDiv = document.getElementById('umdb-import-results');
        if (!query || !resultsDiv) return;

        resultsDiv.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Searching UMDB...</p>';

        try {
            const data = await apiCall('search_releases', { query });
            const releases = data?.results || data || [];

            if (!Array.isArray(releases) || releases.length === 0) {
                resultsDiv.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No releases found on UMDB.</p>';
                return;
            }

            let html = '<div class="edition-list">';
            for (const rel of releases) {
                html += renderUmdbReleaseCard(rel, copyId, movieId);
            }
            html += '</div>';
            resultsDiv.innerHTML = html;
        } catch (error) {
            console.error('UMDB search failed:', error);
            resultsDiv.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">UMDB search failed. The service may be unavailable.</p>';
        }
    }

    async function searchUmdbByExternalId(copyId, movieId, externalId) {
        const resultsDiv = document.getElementById('umdb-import-results');
        if (!resultsDiv) return;

        resultsDiv.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Looking up UMDB by external ID...</p>';

        try {
            const data = await apiCall('find_by_external_id', { external_id: externalId, external_source: 'imdb_id' });

            // Try to get releases from the found movie
            const movieResults = data?.movie_results || [];
            if (movieResults.length > 0) {
                const umdbMovieId = movieResults[0].id || movieResults[0].tmdb_id;
                if (umdbMovieId) {
                    const relData = await apiCall('get_releases', { umdb_id: umdbMovieId });
                    const releases = relData?.results || relData || [];

                    if (Array.isArray(releases) && releases.length > 0) {
                        let html = '<div class="edition-list">';
                        for (const rel of releases) {
                            html += renderUmdbReleaseCard(rel, copyId, movieId);
                        }
                        html += '</div>';
                        resultsDiv.innerHTML = html;
                        return;
                    }
                }
            }
            resultsDiv.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No UMDB releases found for this external ID.</p>';
        } catch (error) {
            console.error('UMDB lookup failed:', error);
            resultsDiv.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">UMDB lookup failed.</p>';
        }
    }

    async function importUmdbRelease(copyId, movieId, releaseId) {
        if (!releaseId) {
            showToast('No release ID', 'error');
            return;
        }
        try {
            const result = await apiCall('import_umdb_release', {
                release_id: releaseId,
                movie_id: movieId
            });

            if (result && result.edition_id) {
                showToast(`Imported from UMDB (${result.components_imported} components)`, 'success');
                // Auto-link if we have a copy context
                if (copyId) {
                    await linkCopyToEdition(copyId, result.edition_id, movieId);
                } else {
                    await openCopyManager(movieId);
                }
            }
        } catch (error) {
            console.error('Failed to import UMDB release:', error);
            showToast(error.message || 'Failed to import UMDB release', 'error');
        }
    }

    // ── Amazon Import ─────────────────────────────────────────────────────
    function showImportFromAmazon(copyId, movieId, defaultTab) {
        // Check if there's pre-loaded text from the URL Reader tool
        const savedText = sessionStorage.getItem('cineshelf_amazon_paste_text') || '';
        const activeTab = defaultTab || (savedText ? 'paste' : 'url');

        const modal = document.getElementById('copyManagerContent');
        modal.innerHTML = `
            <div class="amazon-import-view">
                <h4>🛒 Import from Amazon</h4>
                <div class="amazon-tabs" style="display:flex;gap:0;margin-bottom:1rem;border-bottom:2px solid #2a2a4a;">
                    <button id="az-tab-url" class="az-tab-btn ${activeTab==='url'?'az-tab-active':''}"
                            onclick="App.switchAmazonTab('url',${copyId},${movieId})"
                            style="padding:0.5rem 1rem;background:${activeTab==='url'?'#667eea':'transparent'};color:${activeTab==='url'?'#fff':'#aaa'};border:none;border-radius:6px 6px 0 0;cursor:pointer;font-size:0.85rem;font-weight:600;">
                        🔗 URL Fetch
                    </button>
                    <button id="az-tab-paste" class="az-tab-btn ${activeTab==='paste'?'az-tab-active':''}"
                            onclick="App.switchAmazonTab('paste',${copyId},${movieId})"
                            style="padding:0.5rem 1rem;background:${activeTab==='paste'?'#667eea':'transparent'};color:${activeTab==='paste'?'#fff':'#aaa'};border:none;border-radius:6px 6px 0 0;cursor:pointer;font-size:0.85rem;font-weight:600;">
                        📋 Paste Text
                    </button>
                </div>

                <div id="az-panel-url" style="display:${activeTab==='url'?'block':'none'};">
                    <p class="text-muted" style="font-size:0.85rem; margin-bottom:1rem;">
                        Paste an Amazon product URL to automatically extract cover images, languages,
                        disc count, ASIN, and more. <em>Note: Amazon often blocks server-side requests —
                        use the Paste Text tab if this fails.</em>
                    </p>
                    <div class="form-group">
                        <label>Amazon Product URL</label>
                        <div style="display:flex; gap:0.5rem;">
                            <input type="url" id="amazon-url-input" class="form-control"
                                   placeholder="https://www.amazon.com/dp/XXXXXXXXXX"
                                   style="flex:1;" onkeydown="if(event.key==='Enter') App.fetchAmazonProduct(${copyId},${movieId})">
                            <button class="btn btn-amazon" id="amazon-fetch-btn"
                                    onclick="App.fetchAmazonProduct(${copyId},${movieId})">Fetch →</button>
                        </div>
                    </div>
                    <p style="font-size:0.8rem;color:#888;margin-top:0.25rem;">
                        If Amazon blocks the fetch, open the product page in your browser →
                        <a href="/admin/url-reader.php" target="_blank" style="color:#a8b8ff;">URL Text Reader</a>
                        → then use the Paste Text tab.
                    </p>
                </div>

                <div id="az-panel-paste" style="display:${activeTab==='paste'?'block':'none'};">
                    <p class="text-muted" style="font-size:0.85rem; margin-bottom:0.75rem;">
                        Open the Amazon page in your browser → press <kbd style="background:#333;padding:1px 5px;border-radius:3px;font-size:0.8rem;">Ctrl+A</kbd>
                        then <kbd style="background:#333;padding:1px 5px;border-radius:3px;font-size:0.8rem;">Ctrl+C</kbd>
                        → paste below. Or use the
                        <a href="/admin/url-reader.php" target="_blank" style="color:#a8b8ff;">URL Text Reader</a>
                        and click "Use in Amazon Import".
                    </p>
                    <div class="form-group">
                        <label>Paste Amazon page text here:</label>
                        <textarea id="amazon-paste-text" class="form-control"
                                  style="width:100%;height:140px;font-family:monospace;font-size:0.78rem;resize:vertical;"
                                  placeholder="Paste the full Amazon product page text here (Ctrl+A → Ctrl+C on the Amazon page)…">${savedText ? savedText.replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''}</textarea>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <button class="btn btn-amazon" onclick="App.parseAmazonText(${copyId},${movieId})">Parse →</button>
                        ${savedText ? `<span style="color:#7ec8a0;font-size:0.82rem;">✓ Text loaded from URL Reader</span>` : ''}
                    </div>
                </div>

                <div id="amazon-import-result"></div>
                <div style="margin-top:1rem;">
                    <button class="btn-secondary" onclick="App.openEditionPicker(${copyId},${movieId})">← Back</button>
                </div>
            </div>
        `;

        // If there's saved text from URL Reader, auto-parse it
        if (savedText && activeTab === 'paste') {
            sessionStorage.removeItem('cineshelf_amazon_paste_text');
            sessionStorage.removeItem('cineshelf_amazon_paste_url');
            // Small delay so DOM is ready
            setTimeout(() => parseAmazonText(copyId, movieId), 80);
        }
    }

    function switchAmazonTab(tab, copyId, movieId) {
        document.getElementById('az-panel-url').style.display   = tab === 'url'   ? 'block' : 'none';
        document.getElementById('az-panel-paste').style.display = tab === 'paste' ? 'block' : 'none';
        document.querySelectorAll('.az-tab-btn').forEach(btn => {
            const isActive = btn.id === `az-tab-${tab}`;
            btn.style.background = isActive ? '#667eea' : 'transparent';
            btn.style.color      = isActive ? '#fff' : '#aaa';
        });
    }

    // Parse Amazon product page text (pasted by user) into structured data
    function _parseAmazonTextToData(raw) {
        // Normalize Unicode whitespace characters Amazon injects (LTR mark, RTL mark, NBSP)
        const clean = s => s.replace(/[\u200E\u200F\u00A0\u202A\u202C]+/g, ' ').replace(/\s+/g, ' ').trim();

        const lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
        const details = {};

        // Parse "Label : Value" patterns (Amazon uses ‏ : ‎ separators too)
        for (const line of lines) {
            const m = line.match(/^([^:]{2,50}?)\s*[:]\s*(.+)$/);
            if (m) {
                const label = clean(m[1]).toLowerCase().replace(/^[•·\-–—*]+\s*/, '');
                const value = clean(m[2]);
                if (label && value && value.length < 300) {
                    details[label] = value;
                }
            }
        }

        const find = (...keys) => {
            for (const k of keys) {
                const kl = k.toLowerCase();
                for (const [label, val] of Object.entries(details)) {
                    if (label.includes(kl)) return val;
                }
            }
            return '';
        };

        // Title: look for a line before the first key:value that looks like a product title
        let title = '';
        for (const line of lines) {
            if (line.length > 10 && line.length < 250 && !line.includes(':')) {
                // Skip obvious navigation/UI text
                if (/^(skip|back|visit|shop|see|add|buy|gift|share|sign|read|by |sold|have|deliver|choose|select|in stock|free|prime|qty|quantity|4[.]|5[.]|[0-9]+ star|customer|review|question|answer|filter|page|loading|product)/i.test(line)) continue;
                title = line;
                break;
            }
        }

        // ASIN — explicit or extract from Amazon URL in text
        let asin = find('asin') || '';
        if (!asin) {
            const asinMatch = raw.match(/\/dp\/([A-Z0-9]{10})/i);
            if (asinMatch) asin = asinMatch[1].toUpperCase();
        }

        // Format detection
        const formatHint = (find('media format', 'format') + ' ' + title + ' ' + raw.substring(0, 500)).toLowerCase();
        let format = 'DVD';
        if (/4k|ultra hd|uhd/.test(formatHint))     format = '4K UHD';
        else if (/blu.?ray|bluray/.test(formatHint)) format = 'Blu-ray';
        else if (/vhs/.test(formatHint))             format = 'VHS';
        else if (/laserdisc/.test(formatHint))       format = 'LaserDisc';

        // Disc count
        const discRaw = find('number of discs', 'disc count', 'discs');
        const discCount = parseInt((discRaw || '1').replace(/\D/g, '')) || 1;

        // Release date
        let releaseDate = '';
        const rdRaw = find('release date', 'date first available', 'date first');
        if (rdRaw) {
            const ts = Date.parse(rdRaw);
            if (!isNaN(ts)) {
                const d = new Date(ts);
                releaseDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            }
        }

        // Edition name suggestion
        let editionName = title;
        if (format && editionName && !editionName.toLowerCase().includes(format.toLowerCase())) {
            editionName = editionName + ' — ' + format;
        }
        if (discCount > 1) editionName += ` — ${discCount} Discs`;

        return {
            title,
            edition_name: editionName,
            format,
            asin,
            disc_count: discCount,
            languages:    find('language', 'audio'),
            dubbed:       find('dubbed'),
            subtitles:    find('subtitles', 'subtitle'),
            audio_formats: find('audio format', 'sound format', 'audio mix'),
            distributor:  find('studio', 'label', 'manufacturer', 'brand', 'publisher', 'distributor'),
            country:      find('country of origin', 'country'),
            region:       find('region'),
            barcode:      find('model number', 'item model', 'upc', 'ean', 'barcode'),
            release_date: releaseDate,
            aspect_ratio: find('aspect ratio'),
            images:       [],
            raw_details:  details,
        };
    }

    function parseAmazonText(copyId, movieId) {
        const textarea = document.getElementById('amazon-paste-text');
        const text = textarea?.value.trim();
        if (!text) { showToast('Please paste some Amazon page text first', 'error'); return; }

        const data = _parseAmazonTextToData(text);
        const resultDiv = document.getElementById('amazon-import-result');
        if (resultDiv) {
            resultDiv.innerHTML = buildAmazonForm(copyId, movieId, data);
        }
    }

    async function fetchAmazonProduct(copyId, movieId) {
        const urlInput = document.getElementById('amazon-url-input');
        const url = urlInput?.value.trim();
        if (!url) { showToast('Please enter an Amazon URL', 'error'); return; }

        const btn = document.getElementById('amazon-fetch-btn');
        const resultDiv = document.getElementById('amazon-import-result');
        if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
        if (resultDiv) resultDiv.innerHTML = '<p style="color:#aaa;font-size:0.9rem;margin-top:1rem;">Fetching Amazon page…</p>';

        try {
            const resp = await fetch(`/api/amazon-import.php?url=${encodeURIComponent(url)}`);
            const json = await resp.json();

            if (!json.ok) {
                resultDiv.innerHTML = `
                    <div class="amazon-error">
                        <strong>⚠️ ${escHtml(json.error)}</strong>
                        ${json.asin ? `<p style="margin-top:0.5rem;font-size:0.85rem;color:#aaa;">ASIN detected: <code>${json.asin}</code> — you can still fill in the form manually below.</p>` : ''}
                    </div>
                    ${buildAmazonForm(copyId, movieId, {asin: json.asin||''})}
                `;
            } else {
                resultDiv.innerHTML = buildAmazonForm(copyId, movieId, json.data);
                if (json.data.images && json.data.images.length > 0) {
                    // Auto-select first image
                    selectAmazonImage(json.data.images[0]);
                }
            }
        } catch (e) {
            resultDiv.innerHTML = `<div class="amazon-error">Failed to reach the server. Check your connection.</div>
                                   ${buildAmazonForm(copyId, movieId, {})}`;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Fetch →'; }
        }
    }

    function buildAmazonForm(copyId, movieId, d) {
        const imgs = d.images || [];
        const esc = s => String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const val = s => s ? `value="${esc(s)}"` : '';

        const imgGallery = imgs.length > 0 ? `
            <div class="amazon-img-gallery">
                <label style="display:block;margin-bottom:0.4rem;font-size:0.8rem;color:#aaa;">
                    Select cover image (click to choose):
                </label>
                <div class="amazon-img-strip" id="amazon-img-strip">
                    ${imgs.map((src, i) => `
                        <div class="amazon-img-thumb ${i===0?'selected':''}" onclick="App.selectAmazonImage('${esc(src)}')" data-src="${esc(src)}">
                            <img src="${esc(src)}" alt="Image ${i+1}" onerror="this.parentElement.style.display='none'">
                            <span>${i===0?'Front':i===1?'Back':i===2?'Spine':'Alt '+(i+1)}</span>
                        </div>
                    `).join('')}
                </div>
                <input type="hidden" id="amazon-selected-image" value="${esc(imgs[0]||'')}">
            </div>
        ` : '<p style="color:#888;font-size:0.85rem;margin-bottom:0.5rem;">No images found — you can paste an image URL manually below.</p><div class="form-group"><label>Cover Image URL</label><input type="url" id="amazon-selected-image" class="form-control" placeholder="https://..."></div>';

        // Determine friendly edition name from title
        const titleSuggest = d.edition_name || d.title || '';
        const format = d.format || 'DVD';
        const discCount = d.disc_count || 1;

        return `
            <div class="amazon-form-section">
                <h5 style="margin:1rem 0 0.5rem;color:#a8b8ff;">📀 Edition Details</h5>
                ${imgGallery}
                <div class="form-row" style="display:flex;gap:0.5rem;margin-top:0.75rem;">
                    <div class="form-group" style="flex:3;">
                        <label>Edition Name *</label>
                        <input type="text" id="az-edition-name" class="form-control" ${val(titleSuggest)}
                               placeholder="e.g., Special Edition — DVD">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Format</label>
                        <select id="az-format" class="form-control">
                            ${['DVD','Blu-ray','4K UHD','VHS','LaserDisc'].map(f=>`<option ${f===format?'selected':''}>${f}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row" style="display:flex;gap:0.5rem;">
                    <div class="form-group" style="flex:2;">
                        <label>Distributor / Studio</label>
                        <input type="text" id="az-distributor" class="form-control" ${val(d.distributor)} placeholder="e.g., Sony Pictures">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Disc Count</label>
                        <input type="number" id="az-disc-count" class="form-control" value="${discCount}" min="1" max="20">
                    </div>
                </div>
                <div class="form-row" style="display:flex;gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Audio Languages</label>
                        <input type="text" id="az-languages" class="form-control" ${val(d.languages)} placeholder="e.g., English, French">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Dubbed</label>
                        <input type="text" id="az-dubbed" class="form-control" ${val(d.dubbed)} placeholder="e.g., French, Spanish">
                    </div>
                </div>
                <div class="form-row" style="display:flex;gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Subtitles</label>
                        <input type="text" id="az-subtitles" class="form-control" ${val(d.subtitles)} placeholder="e.g., English, French">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Audio Formats</label>
                        <input type="text" id="az-audio-formats" class="form-control" ${val(d.audio_formats)} placeholder="e.g., Dolby Digital 5.1">
                    </div>
                </div>
                <div class="form-row" style="display:flex;gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Region</label>
                        <input type="text" id="az-region" class="form-control" ${val(d.region)} placeholder="e.g., Region 1 (US/CA)">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Country</label>
                        <input type="text" id="az-country" class="form-control" ${val(d.country)} placeholder="e.g., USA">
                    </div>
                </div>
                <div class="form-row" style="display:flex;gap:0.5rem;">
                    <div class="form-group" style="flex:1;">
                        <label>Release Date</label>
                        <input type="date" id="az-release-date" class="form-control" ${val(d.release_date)}>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Barcode / UPC</label>
                        <input type="text" id="az-barcode" class="form-control" ${val(d.barcode)} placeholder="Model number / UPC">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>ASIN</label>
                        <input type="text" id="az-asin" class="form-control" ${val(d.asin)} placeholder="e.g., B00005O3VC">
                    </div>
                </div>
                ${d.aspect_ratio ? `<div class="form-group"><label>Aspect Ratio (applied to copy)</label>
                    <input type="text" id="az-aspect-ratio" class="form-control" value="${esc(d.aspect_ratio)}"></div>` : ''}
                <div class="form-actions" style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;">
                    <button class="btn btn-amazon" onclick="App.saveAmazonEdition(${copyId},${movieId})">
                        💾 Save Edition &amp; Link to Copy
                    </button>
                    <button class="btn-secondary" onclick="App.openEditionPicker(${copyId},${movieId})">Cancel</button>
                </div>
            </div>
        `;
    }

    function selectAmazonImage(src) {
        // Highlight selected thumbnail
        document.querySelectorAll('.amazon-img-thumb').forEach(el => {
            el.classList.toggle('selected', el.dataset.src === src);
        });
        const hidden = document.getElementById('amazon-selected-image');
        if (hidden) hidden.value = src;
    }

    async function saveAmazonEdition(copyId, movieId) {
        const name = document.getElementById('az-edition-name')?.value.trim();
        if (!name) { showToast('Edition name is required', 'error'); return; }

        const format = document.getElementById('az-format')?.value || 'DVD';
        const coverUrl = document.getElementById('amazon-selected-image')?.value.trim() || '';
        const languages = [
            document.getElementById('az-languages')?.value.trim(),
            document.getElementById('az-dubbed')?.value.trim() ? `Dubbed: ${document.getElementById('az-dubbed').value.trim()}` : ''
        ].filter(Boolean).join('; ');
        const aspectRatio = document.getElementById('az-aspect-ratio')?.value.trim() || '';

        try {
            const result = await apiCall('create_edition', {
                movie_id:        movieId,
                name:            name,
                format:          format,
                distributor:     document.getElementById('az-distributor')?.value.trim() || '',
                disc_count:      parseInt(document.getElementById('az-disc-count')?.value || '1'),
                languages:       languages,
                audio_formats:   document.getElementById('az-audio-formats')?.value.trim() || '',
                subtitles:       document.getElementById('az-subtitles')?.value.trim() || '',
                region:          document.getElementById('az-region')?.value.trim() || '',
                country:         document.getElementById('az-country')?.value.trim() || '',
                release_date:    document.getElementById('az-release-date')?.value || '',
                barcode:         document.getElementById('az-barcode')?.value.trim() || '',
                asin:            document.getElementById('az-asin')?.value.trim() || '',
                cover_image_url: coverUrl,
            });

            if (result && result.edition_id) {
                // Also update the copy's aspect_ratio and format if we have them
                const updatePayload = { copy_id: copyId, format: format };
                if (aspectRatio) updatePayload.aspect_ratio = aspectRatio;
                const regionVal = document.getElementById('az-region')?.value.trim();
                if (regionVal) updatePayload.region = regionVal;
                await apiCall('update_copy', { ...updatePayload });

                showToast('Edition created from Amazon data!', 'success');
                await linkCopyToEdition(copyId, result.edition_id, movieId);
            }
        } catch (e) {
            console.error('saveAmazonEdition error:', e);
            showToast(e.message || 'Failed to save edition', 'error');
        }
    }

    // ── End Amazon Import ──────────────────────────────────────────────────

    async function pushEditionToUmdb(editionId, movieId) {
        if (!confirm('Push this edition to UMDB? It will be shared with the universal database.')) return;
        try {
            const result = await apiCall('push_edition_to_umdb', { edition_id: editionId });
            if (result && result.umdb_release_id) {
                if (result.duplicate) {
                    // Offer the user a chance to correct wrong data on the existing UMDB release
                    const doUpdate = confirm(
                        `⚠️ UMDB already has a release with this barcode:\n${result.umdb_release_id}\n\n` +
                        `Your edition has been linked to it, but the existing UMDB release may have different data ` +
                        `(e.g. wrong format like Blu-ray instead of DVD).\n\n` +
                        `Would you like to UPDATE the UMDB release with this edition's current data (format, name, distributor, etc.)?`
                    );
                    if (doUpdate) {
                        await _doUpdateUmdbRelease(editionId, movieId);
                        return;
                    }
                    showToast(`Linked to existing UMDB release (duplicate barcode): ${result.umdb_release_id}`, 'info');
                } else {
                    const msg = result.movie_auto_created
                        ? `Movie added to UMDB and edition pushed: ${result.umdb_release_id}`
                        : `Pushed to UMDB: ${result.umdb_release_id}`;
                    showToast(msg, 'success');
                }
                await openCopyManager(movieId);
            }
        } catch (error) {
            console.error('Failed to push to UMDB:', error);
            showToast(error.message || 'Failed to push edition to UMDB', 'error');
        }
    }

    async function pushCopyToUmdb(copyId, movieId) {
        if (!confirm('Push this copy to UMDB as a release record?\n\nThis will sync your physical copy details (format, barcode, edition, publisher, etc.) to the Universal Media Database.')) return;
        try {
            const result = await apiCall('push_copy_to_umdb', { copy_id: copyId });
            if (result && result.umdb_physical_copy_id) {
                const msg = result.duplicate
                    ? `Linked to existing UMDB release (duplicate): ${result.umdb_physical_copy_id}`
                    : `Pushed to UMDB: ${result.umdb_physical_copy_id}`;
                showToast(msg, 'success');
                await openCopyManager(movieId);
            }
        } catch (error) {
            console.error('Failed to push copy to UMDB:', error);
            showToast(error.message || 'Failed to push copy to UMDB', 'error');
        }
    }

    async function updateUmdbRelease(editionId, movieId) {
        if (!confirm('Update the UMDB release with this edition\'s current data?\n\nThis will overwrite the format, name, distributor, barcode and other fields on UMDB.')) return;
        await _doUpdateUmdbRelease(editionId, movieId);
    }

    async function _doUpdateUmdbRelease(editionId, movieId) {
        try {
            const result = await apiCall('update_umdb_release', { edition_id: editionId });
            if (result) {
                showToast('UMDB release updated with your edition data!', 'success');
                await openCopyManager(movieId);
            }
        } catch (error) {
            console.error('Failed to update UMDB release:', error);
            showToast(error.message || 'Failed to update UMDB release', 'error');
        }
    }

    async function syncEditionFromUmdb(editionId, movieId) {
        try {
            const result = await apiCall('sync_edition_from_umdb', { edition_id: editionId });
            if (result) {
                const msg = result.components_added > 0
                    ? `Synced from UMDB (+${result.components_added} new components)`
                    : 'Synced from UMDB (up to date)';
                showToast(msg, 'success');
                await openCopyManager(movieId);
            }
        } catch (error) {
            console.error('Failed to sync from UMDB:', error);
            showToast(error.message || 'Failed to sync from UMDB', 'error');
        }
    }

    async function linkEditionToUmdb(editionId, movieId) {
        const releaseId = prompt('Enter the UMDB release ID (e.g., rel-abc123):');
        if (!releaseId || !releaseId.trim()) return;
        try {
            const result = await apiCall('link_edition_to_umdb', {
                edition_id: editionId,
                release_id: releaseId.trim()
            });
            if (result) {
                const compMsg = result.components_added > 0
                    ? ` (+${result.components_added} components imported)`
                    : '';
                showToast(`Linked to UMDB: ${result.umdb_release_id}${compMsg}`, 'success');
                await openCopyManager(movieId);
            }
        } catch (error) {
            console.error('Failed to link to UMDB:', error);
            showToast(error.message || 'Failed to link edition to UMDB', 'error');
        }
    }

    async function unlinkEditionFromUmdb(editionId, movieId) {
        if (!confirm('Unlink this edition from UMDB? Local data will be kept.')) return;
        try {
            await apiCall('unlink_edition_from_umdb', { edition_id: editionId });
            showToast('Unlinked from UMDB', 'info');
            await openCopyManager(movieId);
        } catch (error) {
            console.error('Failed to unlink from UMDB:', error);
            showToast(error.message || 'Failed to unlink from UMDB', 'error');
        }
    }

    // ========================================
    // UMDB BOX SET INTEGRATION
    // ========================================

    async function pushBoxSetToUmdb(containerId) {
        if (!confirm('Push this box set to UMDB? It will be shared with the universal database.')) return;
        try {
            const result = await apiCall('push_boxset_to_umdb', { container_id: containerId });
            showToast(`Pushed to UMDB: ${result.umdb_boxset_id}`, 'success');
            await showBoxSetDetails(containerId);
        } catch (error) {
            console.error('Failed to push box set to UMDB:', error);
            showToast(error.message || 'Failed to push to UMDB', 'error');
        }
    }

    async function syncBoxSetFromUmdb(containerId) {
        try {
            const result = await apiCall('sync_boxset_from_umdb', { container_id: containerId });
            const msg = result.components_added > 0
                ? `Synced from UMDB (+${result.components_added} components)`
                : 'Synced from UMDB';
            showToast(msg, 'success');
            await showBoxSetDetails(containerId);
        } catch (error) {
            console.error('Failed to sync box set from UMDB:', error);
            showToast(error.message || 'Failed to sync from UMDB', 'error');
        }
    }

    async function backfillBoxSetReleases(containerId) {
        try {
            showToast('Creating UMDB release records...', 'info');
            const result = await apiCall('backfill_boxset_releases', { container_id: containerId });
            const created = result.result?.releases_created ?? result.result?.created ?? '?';
            showToast(`Releases created: ${created}`, 'success');
            await showBoxSetDetails(containerId);
        } catch (error) {
            console.error('Failed to backfill releases:', error);
            showToast(error.message || 'Failed to create releases on UMDB', 'error');
        }
    }

    async function pushBoxSetCoverToUmdb(containerId) {
        try {
            showToast('Uploading cover to UMDB...', 'info');
            await apiCall('push_boxset_cover_to_umdb', { container_id: containerId });
            showToast('Cover uploaded to UMDB', 'success');
            await showBoxSetDetails(containerId);
        } catch (error) {
            console.error('Failed to upload cover to UMDB:', error);
            showToast(error.message || 'Failed to upload cover', 'error');
        }
    }

    async function unlinkBoxSetFromUmdb(containerId) {
        if (!confirm('Remove UMDB link? Local data and cover will be cleared.')) return;
        try {
            await apiCall('unlink_boxset_from_umdb', { container_id: containerId });
            showToast('Unlinked from UMDB', 'info');
            await showBoxSetDetails(containerId);
        } catch (error) {
            showToast(error.message || 'Failed to unlink', 'error');
        }
    }

    // ========================================
    // UMDB COLLECTION SYNC
    // ========================================

    async function syncCollectionToUmdb() {
        const btn      = document.getElementById('syncCollectionBtn');
        const progress = document.getElementById('umdbSyncProgress');
        if (!btn || !progress) return;

        if (!confirm('Sync your CineShelf collection to UMDB?\n\nPhase 1: Physical editions\nPhase 2: Box sets\nPhase 3: Individual films (not in box sets)\n\nAlready-synced items are skipped. Safe to run multiple times.')) return;

        btn.disabled = true;
        btn.textContent = 'Syncing…';
        progress.style.display = 'block';
        progress.innerHTML = '<em>Contacting UMDB — this may take a moment for large collections…</em>';

        try {
            const result = await apiCall('sync_collection_to_umdb', {});

            // ── Rich console audit report ────────────────────────────────
            console.group('%c🎬 UMDB Sync Report', 'font-size:14px;font-weight:bold;color:#a78bfa');

            // Phase 1 — Editions
            console.group(`%c📀 Phase 1: Physical Editions  (synced ${result.editions_synced} | skipped ${result.editions_skipped} | failed ${result.editions_failed})`, 'color:#60a5fa');
            if (result.editions_synced_list?.length) {
                console.group('✅ Newly synced editions:');
                result.editions_synced_list.forEach(e => console.log(`  ${e.label}  →  ${e.umdb_id}${e.note ? ' [' + e.note + ']' : ''}`));
                console.groupEnd();
            }
            if (result.editions_skipped_list?.length) {
                console.group('⏭️ Already synced (skipped):');
                result.editions_skipped_list.forEach(e => console.log(`  ${e.label}  →  ${e.umdb_id}`));
                console.groupEnd();
            }
            if (result.editions_failed_list?.length) {
                console.group('%c❌ Failed editions:', 'color:#f87171');
                result.editions_failed_list.forEach(e => console.error(`  ${e.label}: ${e.reason}`));
                console.groupEnd();
            }
            console.groupEnd();

            // Phase 2 — Box sets
            console.group(`%c📦 Phase 2: Box Sets  (synced ${result.boxsets_synced} | skipped ${result.boxsets_skipped} | failed ${result.boxsets_failed})`, 'color:#34d399');
            if (result.boxsets_synced_list?.length) {
                console.group('✅ Newly synced box sets:');
                result.boxsets_synced_list.forEach(b => console.log(`  "${b.name}"  (${b.film_count} films: ${b.films})  →  ${b.umdb_id}${b.cover_url ? '  📷 cover: ' + b.cover_url : (b.cover_error ? '  ❌ cover: ' + b.cover_error : b.cover_note ? '  ⚠️ ' + b.cover_note : '  (no cover)')}`));
                console.groupEnd();
            }
            if (result.boxsets_skipped_list?.length) {
                console.group('⏭️ Already synced (skipped):');
                result.boxsets_skipped_list.forEach(b => console.log(`  "${b.name}"  (${b.film_count} films)  →  ${b.umdb_id}`));
                console.groupEnd();
            }
            if (result.boxsets_failed_list?.length) {
                console.group('%c❌ Failed box sets:', 'color:#f87171');
                result.boxsets_failed_list.forEach(b => console.error(`  "${b.name}" (${b.films}): ${b.reason}`));
                console.groupEnd();
            }
            console.groupEnd();

            // Phase 3 — Individual films
            console.group(`%c🎞️ Phase 3: Individual Films  (synced ${result.movies_synced} | skipped ${result.movies_skipped} | failed ${result.movies_failed})`, 'color:#fbbf24');
            if (result.movies_synced_list?.length) {
                console.group('✅ Newly synced films:');
                result.movies_synced_list.forEach(m => console.log(`  ${m.label}  →  ${m.umdb_id}${m.note ? ' [' + m.note + ']' : ''}`));
                console.groupEnd();
            }
            if (result.movies_skipped_list?.length) {
                console.group('⏭️ Already synced (skipped):');
                result.movies_skipped_list.forEach(m => console.log(`  ${m.label}  →  ${m.umdb_id}`));
                console.groupEnd();
            }
            if (result.movies_failed_list?.length) {
                console.group('%c❌ Failed films:', 'color:#f87171');
                result.movies_failed_list.forEach(m => console.error(`  ${m.label}: ${m.reason}`));
                console.groupEnd();
            }
            console.groupEnd();

            // Errors summary
            if (result.errors?.length) {
                console.group('%c⚠️ All errors:', 'color:#f87171;font-weight:bold');
                result.errors.forEach(e => console.error(e));
                console.groupEnd();
            }

            console.log('%c💡 Tip: Expand the groups above to see every item synced, skipped, or failed with its UMDB ID.', 'color:#9ca3af;font-style:italic');
            console.groupEnd();
            // ────────────────────────────────────────────────────────────

            const totalSynced = (result.editions_synced || 0) + (result.boxsets_synced || 0) + (result.movies_synced || 0);
            const totalSkipped = (result.editions_skipped || 0) + (result.boxsets_skipped || 0) + (result.movies_skipped || 0);
            const totalFailed  = (result.editions_failed || 0) + (result.boxsets_failed || 0) + (result.movies_failed || 0);

            const lines = [
                `<strong>Phase 1 — Editions:</strong> synced ${result.editions_synced}, skipped ${result.editions_skipped}, failed ${result.editions_failed}`,
                `<strong>Phase 2 — Box sets:</strong> synced ${result.boxsets_synced}, skipped ${result.boxsets_skipped}, failed ${result.boxsets_failed}`,
                `<strong>Phase 3 — Films:</strong> synced ${result.movies_synced}, skipped ${result.movies_skipped}, failed ${result.movies_failed}`,
                `<span style="color:rgba(255,255,255,0.45);font-size:0.8em;">Open browser console (F12) for full item-by-item audit report.</span>`,
            ];
            if (result.errors?.length) {
                lines.push('');
                lines.push('<span style="color:#f87171;font-weight:bold;">Errors:</span>');
                result.errors.forEach(e => lines.push('<span style="color:#f87171;">• ' + e + '</span>'));
            }

            progress.innerHTML = lines.map(l => l === '' ? '<br>' : `${l}<br>`).join('');

            if (totalFailed === 0) {
                showToast(`Sync complete: ${totalSynced} pushed, ${totalSkipped} already synced`, 'success');
            } else {
                showToast(`Sync done with ${totalFailed} error(s) — check console for details`, 'warning');
            }
        } catch (error) {
            console.error('[UMDB Sync] Error:', error);
            progress.innerHTML = `<span style="color:#f87171;">Error: ${error.message || 'Sync failed'}</span>`;
            showToast(error.message || 'Sync failed', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sync Collection to UMDB';
        }
    }

    async function forceResyncToUmdb() {
        const btn      = document.getElementById('forceResyncBtn');
        const progress = document.getElementById('umdbSyncProgress');
        if (!btn || !progress) return;

        if (!confirm('Force Resync will clear all stored UMDB IDs and re-push EVERYTHING — all box sets AND all individual films — to UMDB.\n\nUse this after clearing the UMDB database.\n\nContinue?')) return;

        btn.disabled = true;
        const syncBtn = document.getElementById('syncCollectionBtn');
        if (syncBtn) syncBtn.disabled = true;
        btn.textContent = 'Resyncing…';
        progress.style.display = 'block';
        progress.innerHTML = '<em>Clearing local UMDB IDs and re-pushing everything — this may take a moment…</em>';

        try {
            const result = await apiCall('sync_collection_to_umdb', { force: true });

            console.group('%c🔄 UMDB Force Resync Report', 'font-size:14px;font-weight:bold;color:#f97316');

            console.group(`%c📀 Phase 1: Physical Editions  (synced ${result.editions_synced} | skipped ${result.editions_skipped} | failed ${result.editions_failed})`, 'color:#60a5fa');
            if (result.editions_synced_list?.length) {
                console.group('✅ Synced editions:');
                result.editions_synced_list.forEach(e => console.log(`  ${e.label}  →  ${e.umdb_id}${e.note ? ' [' + e.note + ']' : ''}`));
                console.groupEnd();
            }
            if (result.editions_failed_list?.length) {
                console.group('%c❌ Failed editions:', 'color:#f87171');
                result.editions_failed_list.forEach(e => console.error(`  ${e.label}: ${e.reason}`));
                console.groupEnd();
            }
            console.groupEnd();

            console.group(`%c📦 Phase 2: Box Sets  (synced ${result.boxsets_synced} | skipped ${result.boxsets_skipped} | failed ${result.boxsets_failed})`, 'color:#34d399');
            if (result.boxsets_synced_list?.length) {
                console.group('✅ Synced box sets:');
                result.boxsets_synced_list.forEach(b => console.log(`  "${b.name}"  (${b.film_count} films: ${b.films})  →  ${b.umdb_id}${b.cover_url ? '  📷 cover: ' + b.cover_url : (b.cover_error ? '  ❌ cover: ' + b.cover_error : b.cover_note ? '  ⚠️ ' + b.cover_note : '  (no cover)')}`));
                console.groupEnd();
            }
            if (result.boxsets_failed_list?.length) {
                console.group('%c❌ Failed box sets:', 'color:#f87171');
                result.boxsets_failed_list.forEach(b => console.error(`  "${b.name}" (${b.films}): ${b.reason}`));
                console.groupEnd();
            }
            console.groupEnd();

            console.group(`%c🎞️ Phase 3: Individual Films  (synced ${result.movies_synced} | skipped ${result.movies_skipped} | failed ${result.movies_failed})`, 'color:#fbbf24');
            if (result.movies_synced_list?.length) {
                console.group('✅ Synced films:');
                result.movies_synced_list.forEach(m => console.log(`  ${m.label}  →  ${m.umdb_id}${m.note ? ' [' + m.note + ']' : ''}`));
                console.groupEnd();
            }
            if (result.movies_failed_list?.length) {
                console.group('%c❌ Failed films:', 'color:#f87171');
                result.movies_failed_list.forEach(m => console.error(`  ${m.label}: ${m.reason}`));
                console.groupEnd();
            }
            console.groupEnd();

            if (result.errors?.length) {
                console.group('%c⚠️ All errors:', 'color:#f87171;font-weight:bold');
                result.errors.forEach(e => console.error(e));
                console.groupEnd();
            }
            console.log('%c💡 Tip: Expand the groups above to see every item synced or failed with its UMDB ID.', 'color:#9ca3af;font-style:italic');
            console.groupEnd();

            const totalSynced  = (result.editions_synced  || 0) + (result.boxsets_synced  || 0) + (result.movies_synced  || 0);
            const totalFailed  = (result.editions_failed  || 0) + (result.boxsets_failed  || 0) + (result.movies_failed  || 0);

            const lines = [
                `<strong>Phase 1 — Editions:</strong> synced ${result.editions_synced}, failed ${result.editions_failed}`,
                `<strong>Phase 2 — Box sets:</strong> synced ${result.boxsets_synced}, failed ${result.boxsets_failed}`,
                `<strong>Phase 3 — Films:</strong> synced ${result.movies_synced}, failed ${result.movies_failed}`,
                `<span style="color:rgba(255,255,255,0.45);font-size:0.8em;">Open browser console (F12) for full item-by-item audit report.</span>`,
            ];
            if (result.errors?.length) {
                lines.push('');
                lines.push('<span style="color:#f87171;font-weight:bold;">Errors:</span>');
                result.errors.forEach(e => lines.push('<span style="color:#f87171;">• ' + e + '</span>'));
            }
            progress.innerHTML = lines.map(l => l === '' ? '<br>' : `${l}<br>`).join('');

            if (totalFailed === 0) {
                showToast(`Force resync complete: ${totalSynced} pushed`, 'success');
            } else {
                showToast(`Force resync done with ${totalFailed} error(s) — check console for details`, 'warning');
            }
        } catch (error) {
            console.error('[UMDB Force Resync] Error:', error);
            progress.innerHTML = `<span style="color:#f87171;">Error: ${error.message || 'Force resync failed'}</span>`;
            showToast(error.message || 'Force resync failed', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Force Resync (Reset & Re-push All)';
            const syncBtn2 = document.getElementById('syncCollectionBtn');
            if (syncBtn2) syncBtn2.disabled = false;
        }
    }

    // ========================================
    // MOVIE DETAILS
    // ========================================

/**
 * REPLACE viewMovieDetails() function in app.js
 * Location: Around line 950-1000
 *
 * This adds a "Manage Copies" button to the movie detail view
 */
async function editDisplayTitle(movieId) {
    const group = collection.find(c => c.movie.movie_id === movieId);
    if (!group) return;
    
    const movie = group.movie;
    const currentDisplay = movie.display_title || movie.title || '';
    
    const newTitle = prompt(
        'Enter custom display name:\n(Leave empty to use original title)',
        currentDisplay
    );
    
    if (newTitle === null) return;
    
    try {
        await apiCall('update_display_title', {
            movie_id: movieId,
            display_title: newTitle.trim()
        });
        
        showToast('Display title updated!', 'success');
        loadCollection();
        
    } catch (error) {
        showToast('Failed to update title', 'error');
    }
}

async function changePoster(movieId) {
    try {
        // Get movie data
        const group = collection.find(c => c.movie.movie_id === movieId);
        if (!group) return;
        
        const movie = group.movie;
        
        if (!movie.tmdb_id || movie.tmdb_id.startsWith('unresolved_')) {
            showToast('Cannot change poster for unresolved movies', 'error');
            return;
        }
        
        showToast('Fetching available posters...', 'info');
        
        // Fetch available posters
        const posters = await apiCall('get_movie_posters', {
            tmdb_id: movie.tmdb_id,
            media_type: movie.media_type || 'movie'
        });
        
        if (!posters || posters.length === 0) {
            showToast('No alternative posters found', 'error');
            return;
        }
        
        // Show poster selection modal
        showPosterSelector(movieId, movie, posters);
        
    } catch (error) {
        console.error('Failed to fetch posters:', error);
        showToast('Failed to load posters', 'error');
    }
}

function showPosterSelector(movieId, movie, posters) {
    const modal = document.getElementById('posterSelectorModal');
    const grid = document.getElementById('posterSelectorGrid');
    const title = document.getElementById('posterSelectorTitle');

    title.textContent = `Cover Art — "${movie.display_title || movie.title}"`;

    // Build TMDB poster cards
    const tmdbCards = posters.map(poster => {
        const posterUrl = 'https://image.tmdb.org/t/p/w342' + poster.file_path;
        const isCurrent = movie.poster_url && movie.poster_url.includes(poster.file_path);
        return `
            <div class="poster-option ${isCurrent ? 'current-poster' : ''}"
                 onclick="App.selectPoster(${movieId}, '${poster.file_path}')"
                 style="cursor:pointer;position:relative;">
                <img src="${posterUrl}" alt="Poster" style="width:100%;border-radius:8px;transition:transform 0.15s;"
                     onmouseover="this.style.transform='scale(1.05)'"
                     onmouseout="this.style.transform='scale(1)'">
                ${isCurrent ? '<div style="position:absolute;top:5px;right:5px;background:#4caf50;color:white;padding:3px 7px;border-radius:4px;font-size:0.7rem;font-weight:bold;">CURRENT</div>' : ''}
                <div style="text-align:center;margin-top:0.4rem;font-size:0.78rem;color:rgba(255,255,255,0.6);">
                    ${poster.width}×${poster.height}${poster.vote_average ? ' · ⭐' + poster.vote_average.toFixed(1) : ''}
                    <br><span style="color:rgba(255,255,255,0.35);">TMDB</span>
                </div>
            </div>`;
    }).join('');

    // Custom URL + file upload section
    const customSection = `
        <div style="grid-column:1/-1;margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,0.1);">
            <h4 style="color:rgba(255,255,255,0.8);margin-bottom:1rem;">🔗 Use a custom cover image</h4>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                <input type="text" id="customPosterUrl" placeholder="Paste an image URL (jpg, png, webp…)"
                    style="flex:1;min-width:200px;padding:0.55rem 0.75rem;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;font-size:0.85rem;">
                <button class="btn btn-sm" onclick="App.applyCustomPosterUrl(${movieId})">Apply URL</button>
            </div>
            <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
                <label style="cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem;padding:0.4rem 0.75rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:0.85rem;">
                    📁 Upload local file
                    <input type="file" id="coverFileInput" accept="image/*" style="display:none;" onchange="App.uploadCoverFile(${movieId}, this)">
                </label>
                <span style="color:rgba(255,255,255,0.4);font-size:0.8rem;">JPG, PNG, WEBP</span>
            </div>
        </div>`;

    grid.innerHTML = tmdbCards + customSection;
    modal.classList.add('active');
}

async function applyCustomPosterUrl(movieId) {
    const url = document.getElementById('customPosterUrl').value.trim();
    if (!url) { showToast('Enter an image URL first', 'error'); return; }
    try {
        await apiCall('update_movie_poster', { movie_id: movieId, poster_url: url });
        showToast('✅ Cover art updated!', 'success');
        closePosterSelector();
        loadCollection();
        if (document.getElementById('movieDetailModal').classList.contains('active')) viewMovieDetails(movieId);
    } catch (e) { showToast('Failed to update cover art', 'error'); }
}

async function uploadCoverFile(movieId, input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('cover', file);
    formData.append('movie_id', movieId);
    try {
        showToast('Uploading cover…', 'info');
        const resp = await fetch('/api/upload-cover.php', { method: 'POST', credentials: 'include', body: formData });
        const result = await resp.json();
        if (!result.success && !result.ok) throw new Error(result.error || 'Upload failed');
        await apiCall('update_movie_poster', { movie_id: movieId, poster_url: result.url });
        showToast('✅ Cover uploaded!', 'success');
        closePosterSelector();
        loadCollection();
        if (document.getElementById('movieDetailModal').classList.contains('active')) viewMovieDetails(movieId);
    } catch (e) { showToast('Upload failed: ' + e.message, 'error'); }
}

function closePosterSelector() {
    document.getElementById('posterSelectorModal').classList.remove('active');
}

async function selectPoster(movieId, posterPath) {
    try {
        showToast('Updating poster...', 'info');
        
        await apiCall('update_movie_poster', {
            movie_id: movieId,
            poster_path: posterPath
        });
        
        showToast('✅ Poster updated!', 'success');
        
        closePosterSelector();
        loadCollection(); // Reload to show new poster
        
        // If movie detail modal is open, refresh it
        const detailModal = document.getElementById('movieDetailModal');
        if (detailModal.classList.contains('active')) {
            viewMovieDetails(movieId);
        }
        
    } catch (error) {
        console.error('Failed to update poster:', error);
        showToast('Failed to update poster', 'error');
    }
}

async function viewMovieDetails(movieId, activeCopyId = null) {
    try {
        const group = collection.find(c => c.movie.movie_id === movieId);

        let movie, copies = [], isWishlistOnly = false;

        if (group) {
            movie = group.movie;
            copies = await apiCall('get_movie_copies', { movie_id: movieId });
        } else {
            // Fall back to wishlist data (movie not yet in collection)
            const wItem = wishlist.find(w => w.movie_id === movieId);
            if (!wItem) return;
            movie = wItem;
            isWishlistOnly = true;
        }

        const content = document.getElementById('movieDetailContent');
        const fallbackPoster = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\'%3E%3Crect fill=\'%23333\' width=\'300\' height=\'450\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'20\'%3ENo Poster%3C/text%3E%3C/svg%3E';

        // In Shelf / Physical views, prefer the active copy's edition cover
        let posterUrl = movie.poster_url || fallbackPoster;
        if (activeCopyId && copies.length) {
            const activeCopy = copies.find(c => c.id === activeCopyId);
            if (activeCopy && activeCopy.edition_cover_url) {
                posterUrl = activeCopy.edition_cover_url;
            }
        }

        // Build clickable genre tags
        const genreTags = movie.genre ? movie.genre.split(',').map(g => g.trim()).filter(Boolean).map(g =>
            `<span class="detail-tag" onclick="event.stopPropagation(); App.showRelatedMovies('genre', '${g.replace(/'/g, "\\'")}');">${GENRE_EMOJIS[g] || '🎭'} ${g}</span>`
        ).join('') : '';

        // Build clickable cast tags
        const castTags = movie.actors ? movie.actors.split(',').map(a => a.trim()).filter(Boolean).map(a =>
            `<span class="detail-tag" onclick="event.stopPropagation(); App.showRelatedMovies('actor', '${a.replace(/'/g, "\\'")}');">🎭 ${a}</span>`
        ).join('') : '';

        // Build clickable director
        const directorTag = movie.director
            ? `<span class="detail-tag detail-tag-highlight" onclick="event.stopPropagation(); App.showRelatedMovies('director', '${movie.director.replace(/'/g, "\\'")}');">🎬 ${movie.director}</span>`
            : '';

        // Build clickable studio
        const studioTag = movie.studio
            ? `<span class="detail-tag" onclick="event.stopPropagation(); App.showRelatedMovies('studio', '${movie.studio.replace(/'/g, "\\'")}');">🏢 ${movie.studio}</span>`
            : '';

        const isTV = movie.media_type === 'tv';
        const tvIcon = isTV ? '📺 ' : '';
        const displayTitle = movie.display_title || movie.title;

        // Build season summary for TV shows
        let seasonSummary = '';
        if (isTV && copies.length > 0) {
            const allSeasons = new Set();
            copies.forEach(copy => {
                if (copy.seasons_owned) {
                    copy.seasons_owned.split(',').map(s => s.trim()).filter(Boolean).forEach(s => allSeasons.add(parseInt(s)));
                }
            });
            if (allSeasons.size > 0) {
                const sorted = Array.from(allSeasons).sort((a, b) => a - b);
                const totalSeasons = movie.number_of_seasons;
                seasonSummary = `<div class="season-info" style="margin-top:0.5rem;">
                    <strong>📺 Seasons owned: ${sorted.join(', ')}</strong>
                    ${totalSeasons ? ` <span style="color:rgba(255,255,255,0.5);">of ${totalSeasons} total</span>` : ''}
                </div>`;
            }
        } else if (isTV && movie.number_of_seasons) {
            seasonSummary = `<div class="season-info" style="margin-top:0.5rem;">
                📺 ${movie.number_of_seasons} season${movie.number_of_seasons !== 1 ? 's' : ''}
            </div>`;
        }

        content.innerHTML = `
            <div class="movie-detail-layout">
                <div class="movie-detail-poster">
                    <img src="${posterUrl}" alt="${movie.title}">
                </div>
                <div class="movie-detail-info">
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                        <h2 style="margin:0; flex:1 1 auto; min-width:0; word-wrap:break-word;">${tvIcon}${displayTitle}</h2>
                        ${!isWishlistOnly ? `<div style="display:flex; gap:0.4rem; flex-shrink:0;">
                            <button class="btn-icon" onclick="App.editDisplayTitle(${movieId})" title="Edit Display Name">✏️</button>
                            <button class="btn-icon" onclick="App.changePoster(${movieId})" title="Change Poster">🖼️</button>
                        </div>` : ''}
                    </div>
                    ${movie.display_title ? `<div style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">Original: ${movie.title}</div>` : ''}
                    ${isTV ? `<div style="color: #a8b8ff; font-size: 0.8rem; margin-top: 0.25rem;"><span class="tv-badge">TV Series</span></div>` : ''}

                    <div class="movie-detail-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.runtime ? `<span>${formatRuntime(movie.runtime)}</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${Number(movie.rating).toFixed(1)}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge" style="--cert-color: ${getCertColor(movie.certification)};">${movie.certification}</span>` : ''}
                    </div>

                    ${seasonSummary}

                    ${genreTags ? `<div class="detail-tags-row">${genreTags}</div>` : ''}

                    ${directorTag || studioTag ? `<div class="detail-tags-row">${directorTag}${studioTag}</div>` : ''}

                    ${movie.overview ? `<p class="movie-detail-overview">${movie.overview}</p>` : ''}

                    ${castTags ? `<div class="movie-detail-section"><h3>Cast</h3><div class="detail-tags-row">${castTags}</div></div>` : ''}

                    ${isWishlistOnly ? `
                    <div class="movie-detail-section">
                        <h3>📋 On your wishlist</h3>
                        ${movie.target_format ? `<p style="color:rgba(255,255,255,0.7);">Wanted format: <strong>${movie.target_format}</strong></p>` : ''}
                        ${movie.notes ? `<p style="color:rgba(255,255,255,0.6); font-size:0.9rem;">${movie.notes}</p>` : ''}
                        <button class="btn" onclick="App.closeMovieDetail(); App.moveToCollection(${movieId});" style="margin-top: 0.75rem;">
                            ➕ Add to Collection
                        </button>
                    </div>
                    ` : `
                    <div class="movie-detail-section">
                        <h3>Your Copies (${copies.length})</h3>
                        ${copies.length > 0 ? `
                            <div class="copies-summary">
                                ${copies.map((copy, i) => {
                                    const isActive = activeCopyId != null && copy.id === activeCopyId;
                                    const isOther  = activeCopyId != null && !isActive;
                                    const edName = copy.edition_name || copy.edition || '';
                                    const edType = copy.edition_edition_type || '';
                                    const pkgType = (copy.package_type && copy.package_type !== 'Standard Amaray') ? copy.package_type : '';
                                    const videoSys = copy.edition_video_system || '';
                                    const region = copy.region || copy.edition_region || '';
                                    const langs = copy.edition_languages || '';
                                    const umdbLinked = !!copy.edition_umdb_release_id;
                                    const discCount = copy.edition_disc_count;
                                    const distributor = copy.edition_distributor || '';
                                    const tags = [edType, pkgType, videoSys, region].filter(Boolean);
                                    const thumb = copy.edition_cover_url || '';
                                    const itemClass = `copy-summary-item${isActive ? ' copy-active' : isOther ? ' copy-other' : ''}`;
                                    const clickAttr = isOther ? `onclick="App.jumpToCopy(${copy.id})" title="Switch to this copy"` : '';
                                    return `
                                    <div class="${itemClass}" ${clickAttr}>
                                        <div class="copy-layout">
                                            ${thumb ? `<img class="copy-thumb" src="${thumb}" alt="${edName || 'Copy ' + (i+1)}" onerror="this.style.display='none'">` : ''}
                                            <div style="flex:1;min-width:0;">
                                                <div class="copy-number">
                                                    Copy ${i + 1}
                                                    ${umdbLinked ? '<span class="umdb-link-badge">UMDB</span>' : ''}
                                                    ${isActive ? '<span class="copy-current-badge">Viewing</span>' : ''}
                                                    ${isOther ? '<span class="copy-view-btn">Switch →</span>' : ''}
                                                </div>
                                                <div class="copy-details">
                                                    <div class="copy-summary-format">${copy.format}${copy.condition ? ` <span class="copy-summary-condition">${copy.condition}</span>` : ''}</div>
                                                    ${edName ? `<div class="copy-summary-edition">${edName}</div>` : ''}
                                                    ${langs ? `<div class="copy-summary-langs">${langs}</div>` : ''}
                                                    ${tags.length > 0 ? `<div class="copy-summary-tags">${tags.map(t => `<span class="copy-summary-tag">${t}</span>`).join('')}</div>` : ''}
                                                    ${distributor ? `<div class="copy-summary-dist">${distributor}${discCount > 1 ? ` &bull; ${discCount} discs` : ''}</div>` : (discCount > 1 ? `<div class="copy-summary-dist">${discCount} discs</div>` : '')}
                                                    ${copy.seasons_owned ? `<div class="season-info">Seasons: ${copy.seasons_owned}</div>` : ''}
                                                    ${copy.notes ? `<div class="copy-summary-notes" title="${(copy.notes||'').replace(/"/g,'&quot;')}">💬 ${(copy.notes||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').substring(0,80)}${copy.notes.length>80?'…':''}</div>` : ''}
                                                    ${copy.container_id ? `<div style="margin-top:0.3rem;"><button class="btn-sm btn-sm-muted" style="font-size:0.72rem;padding:2px 7px;" onclick="event.stopPropagation();App.showBoxSetDetails(${copy.container_id})" title="View box set">📦 ${(copy.container_name||'Box Set').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</button></div>` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                            <button class="btn" onclick="App.openCopyManager(${movieId})" style="margin-top: 1rem;">
                                ✏️ Manage Copies
                            </button>
                        ` : `
                            <p style="color: rgba(255,255,255,0.6);">No copies in your collection</p>
                        `}
                    </div>
                    `}

                    <!-- CineShelf Rating section — loaded async below -->
                    <div class="movie-detail-section" id="cineRatingSection_${movieId}">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
                            <h3>⭐ CineShelf Ratings</h3>
                            <button class="btn btn-sm" onclick="App.openCineRatingModal(${movieId})">+ Log Viewing</button>
                        </div>
                        <div id="cineRatingContent_${movieId}"><p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Loading ratings…</p></div>
                    </div>

                    <!-- Add to calendar shortcut -->
                    <div style="margin-top:0.5rem;">
                        <button class="btn btn-secondary btn-sm" onclick="App.quickAddToCalendar(${movieId}, '${(movie.display_title || movie.title).replace(/'/g, "\\'")}')">📅 Plan to Watch</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('movieDetailModal').classList.add('active');

        // Load ratings asynchronously
        loadCineRatingsForMovie(movieId);

    } catch (error) {
        console.error('Failed to load movie details:', error);
        showToast('Failed to load movie details', 'error');
    }
}

// ========================================
// RELATED MOVIES - Clickable tags in movie detail
// ========================================

function showRelatedMovies(type, value) {
    const labels = { genre: '🎭 Genre', actor: '🎭 Actor', director: '🎬 Director', studio: '🏢 Studio' };
    const label = labels[type] || type;

    // Search through entire collection for matches
    const matches = collection.filter(item => {
        const m = item.movie;
        switch (type) {
            case 'genre':    return m.genre && m.genre.split(',').map(g => g.trim()).includes(value);
            case 'actor':    return m.actors && m.actors.split(',').map(a => a.trim()).includes(value);
            case 'director': return m.director && m.director === value;
            case 'studio':   return m.studio && m.studio === value;
            default: return false;
        }
    });

    const navIds = JSON.stringify(matches.map(item => item.movie.movie_id));

    const content = document.getElementById('relatedMoviesContent');
    const titleEl = document.getElementById('relatedMoviesTitle');
    if (!content || !titleEl) return;

    titleEl.textContent = `${label}: ${value}`;

    if (matches.length === 0) {
        content.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:2rem;">No other movies found for this filter.</p>';
    } else {
        content.innerHTML = `<div class="related-grid">` + matches.map(item => {
            const m = item.movie;
            const posterUrl = m.poster_url || '';
            const title = m.display_title || m.title || 'Unknown';
            return `<div class="related-card" onclick="App.closeRelatedMovies(); App.viewMovieDetailsWithNav(${m.movie_id}, ${navIds});">
                <div class="related-poster">
                    ${posterUrl ? `<img src="${posterUrl}" alt="${title.replace(/"/g,'')}" onerror="this.style.display='none'">` : ''}
                    <div class="related-poster-fallback" style="${posterUrl?'display:none':''}">🎬</div>
                </div>
                <div class="related-info">
                    <div class="related-title">${title}</div>
                    <div class="related-meta">${m.year || ''} ${m.rating ? `· ⭐ ${m.rating.toFixed(1)}` : ''}</div>
                </div>
            </div>`;
        }).join('') + `</div>`;
    }

    document.getElementById('relatedMoviesModal').classList.add('active');
}

function closeRelatedMovies() {
    document.getElementById('relatedMoviesModal').classList.remove('active');
}

// Helper function for certification badge colors
function getCertColor(cert) {
    const colors = {
        'G': '#4caf50',
        'PG': '#8bc34a',
        'PG-13': '#ffc107',
        'R': '#ff9800',
        'NC-17': '#f44336',
        'NR': '#9e9e9e',
        'Unrated': '#9e9e9e'
    };
    return colors[cert] || '#666';
}
    
    function closeMovieDetail() {
        // If collection data changed while modal was open, re-render the grid
        // but preserve scroll position
        if (collectionDirty) {
            collectionDirty = false;
            const savedScroll = document.body._scrollY;
            // Sort then render (sortMovies calls renderCollection internally)
            const sortBy = document.getElementById('sortBy')?.value || 'title';
            sortMovies('collection', sortBy);
            // Restore the saved scroll position (the observer will use this)
            document.body._scrollY = savedScroll;
        }

        document.getElementById('movieDetailModal').classList.remove('active');
        // Clear shelf/copy nav context when closing
        shelfNavMovieList = [];
        shelfNavIndex = -1;
        shelfNavCopyList = [];
        shelfNavCopyIndex = -1;
        const nav = document.getElementById('movieDetailNav');
        if (nav) nav.style.display = 'none';
    }

    // ========================================
    // SHELF VIEW MOVIE NAVIGATION
    // Prev / next through movies while in shelf view modal
    // ========================================

    let shelfNavMovieList = []; // array of movie_ids in current shelf level
    let shelfNavIndex = -1;     // current position in that list
    // Copy-aware navigation (Shelf / Physical Media views)
    let shelfNavCopyList  = []; // [{c: copyId, m: movieId}, ...] one entry per physical copy
    let shelfNavCopyIndex = -1;

    // Ordered movie_id lists captured at render time for collection and wishlist
    let collectionNavList = [];
    let wishlistNavList = [];

    // Universal entry point from collection/wishlist card clicks
    function openMovieWithNav(movieId, source) {
        const list = source === 'wishlist' ? wishlistNavList : collectionNavList;
        viewMovieDetailsWithNav(movieId, list);
    }

    // Called from spine / poster clicks inside shelf view
    function viewMovieDetailsWithNav(movieId, movieList) {
        // Clear box set nav so keyboard/swipe routes to movie nav
        boxSetNavList = [];
        boxSetNavIndex = -1;
        currentContainerId = null;
        shelfNavCopyList = [];
        shelfNavCopyIndex = -1;
        shelfNavMovieList = movieList;
        shelfNavIndex = movieList.indexOf(movieId);
        viewMovieDetails(movieId);
        _updateShelfNavUI();
    }

    // Called from Shelf / Physical Media views where each physical copy is a nav item
    // copyNavStr is a comma-separated "copyId:movieId" string (no quotes = safe in onclick attrs)
    function viewCopyDetailsWithNav(copyId, movieId, copyNavStr) {
        boxSetNavList = [];
        boxSetNavIndex = -1;
        currentContainerId = null;
        shelfNavMovieList = [];
        shelfNavIndex = -1;
        // Parse "c:m,c:m,..." into [{c,m},...]
        shelfNavCopyList = (typeof copyNavStr === 'string' && copyNavStr)
            ? copyNavStr.split(',').map(pair => { const [c,m] = pair.split(':').map(Number); return {c,m}; })
            : [];
        shelfNavCopyIndex = shelfNavCopyList.findIndex(n => n.c === copyId);
        viewMovieDetails(movieId, copyId);
        _updateCopyNavUI();
    }

    function shelfCopyNav(direction) {
        if (!shelfNavCopyList.length) return;
        const next = shelfNavCopyIndex + direction;
        if (next < 0 || next >= shelfNavCopyList.length) return;
        shelfNavCopyIndex = next;
        const entry = shelfNavCopyList[shelfNavCopyIndex];
        viewMovieDetails(entry.m, entry.c);
        _updateCopyNavUI();
    }

    function _updateCopyNavUI() {
        const nav = document.getElementById('movieDetailNav');
        const label = document.getElementById('movieDetailNavLabel');
        const prev = document.getElementById('movieDetailPrev');
        const next = document.getElementById('movieDetailNext');
        if (!nav) return;
        if (shelfNavCopyList.length > 1) {
            nav.style.display = 'flex';
            label.textContent = `${shelfNavCopyIndex + 1} / ${shelfNavCopyList.length}`;
            prev.disabled = shelfNavCopyIndex <= 0;
            next.disabled = shelfNavCopyIndex >= shelfNavCopyList.length - 1;
            prev.onclick = () => shelfCopyNav(-1);
            next.onclick = () => shelfCopyNav(1);
        } else {
            nav.style.display = 'none';
        }
    }

    // Called from the "Other copies" links in the modal when copy-nav is active
    function jumpToCopy(copyId) {
        const idx = shelfNavCopyList.findIndex(n => n.c === copyId);
        if (idx !== -1) {
            shelfNavCopyIndex = idx;
            const entry = shelfNavCopyList[shelfNavCopyIndex];
            viewMovieDetails(entry.m, entry.c);
            _updateCopyNavUI();
        }
    }

    function shelfMovieNav(direction) {
        if (!shelfNavMovieList.length) return;
        const next = shelfNavIndex + direction;
        if (next < 0 || next >= shelfNavMovieList.length) return;
        shelfNavIndex = next;
        viewMovieDetails(shelfNavMovieList[shelfNavIndex]);
        _updateShelfNavUI();
    }

    function _updateShelfNavUI() {
        const nav = document.getElementById('movieDetailNav');
        const label = document.getElementById('movieDetailNavLabel');
        const prev = document.getElementById('movieDetailPrev');
        const next = document.getElementById('movieDetailNext');
        if (!nav) return;

        if (shelfNavMovieList.length > 1) {
            nav.style.display = 'flex';
            label.textContent = `${shelfNavIndex + 1} / ${shelfNavMovieList.length}`;
            prev.disabled = shelfNavIndex <= 0;
            next.disabled = shelfNavIndex >= shelfNavMovieList.length - 1;
            // Restore movie nav onclick handlers
            prev.onclick = () => shelfMovieNav(-1);
            next.onclick = () => shelfMovieNav(1);
        } else {
            nav.style.display = 'none';
        }
    }

    // ========================================
    // BOX SET NAVIGATION
    // Prev / next through box sets in the detail modal
    // ========================================

    let boxSetNavList = [];  // array of container IDs
    let boxSetNavIndex = -1;

    function showBoxSetDetailsWithNav(containerId, containerList) {
        boxSetNavList = containerList || [];
        boxSetNavIndex = boxSetNavList.indexOf(containerId);
        showBoxSetDetails(containerId);
    }

    function boxSetNav(direction) {
        if (!boxSetNavList.length) return;
        const next = boxSetNavIndex + direction;
        if (next < 0 || next >= boxSetNavList.length) return;
        boxSetNavIndex = next;
        showBoxSetDetails(boxSetNavList[boxSetNavIndex]);
    }

    function _updateBoxSetNavUI() {
        const nav = document.getElementById('movieDetailNav');
        const label = document.getElementById('movieDetailNavLabel');
        const prev = document.getElementById('movieDetailPrev');
        const next = document.getElementById('movieDetailNext');
        if (!nav) return;

        if (boxSetNavList.length > 1 && boxSetNavIndex >= 0) {
            nav.style.display = 'flex';
            label.textContent = `${boxSetNavIndex + 1} / ${boxSetNavList.length}`;
            prev.disabled = boxSetNavIndex <= 0;
            next.disabled = boxSetNavIndex >= boxSetNavList.length - 1;
            // Override nav button handlers for box sets
            prev.onclick = () => boxSetNav(-1);
            next.onclick = () => boxSetNav(1);
        } else {
            nav.style.display = 'none';
        }
    }

    // Keyboard arrow navigation (only when modal is open and nav is active)
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('movieDetailModal');
        if (!modal || !modal.classList.contains('active')) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const dir = e.key === 'ArrowLeft' ? -1 : 1;
            // If viewing a box set detail, navigate box sets
            if (boxSetNavList.length > 1 && currentContainerId) {
                boxSetNav(dir);
            } else if (shelfNavCopyList.length) {
                shelfCopyNav(dir);
            } else if (shelfNavMovieList.length) {
                shelfMovieNav(dir);
            }
        }
    });

    // ESC key: close topmost modal first (cloud picker → wizard → others)
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        const picker = document.getElementById('cloudPickerModal');
        if (picker && picker.style.display === 'flex') {
            e.stopPropagation();
            closeCloudPicker();
            return;
        }
        const wizard = document.getElementById('aiWizardModal');
        if (wizard && wizard.style.display === 'flex') {
            closeAIWizardModal();
            return;
        }
        const newLayoutModal = document.getElementById('newEmptyLayoutModal');
        if (newLayoutModal && newLayoutModal.style.display === 'flex') {
            closeNewEmptyLayoutModal();
        }
    });

    // Touch swipe support (iOS + Android)
    (function() {
        let touchStartX = 0;
        let touchStartY = 0;
        document.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        document.addEventListener('touchend', function(e) {
            const modal = document.getElementById('movieDetailModal');
            if (!modal || !modal.classList.contains('active')) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            // Only trigger if horizontal swipe is dominant and > 60px
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                const dir = dx < 0 ? 1 : -1;
                if (boxSetNavList.length > 1 && currentContainerId) {
                    boxSetNav(dir);
                } else if (shelfNavCopyList.length) {
                    shelfCopyNav(dir);
                } else if (shelfNavMovieList.length) {
                    shelfMovieNav(dir);
                }
            }
        }, { passive: true });
    })();

    // ========================================
    // UI HELPERS
    // ========================================
    
    function switchTab(tabName) {
        // Redirect legacy wishlist/boxsets tabs to collection sub-views
        if (tabName === 'wishlist') {
            switchTab('collection');
            switchCollectionView('wishlist');
            _syncBottomNavActive('wishlist');
            return;
        }
        if (tabName === 'boxsets') {
            switchTab('collection');
            switchCollectionView('boxsets');
            return;
        }

        currentTab = tabName;

        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabName).classList.add('active');

        // Update hidden tab navigation buttons (used for active-state tracking)
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Sync bottom nav and drawer active states
        _syncBottomNavActive(tabName);
        _syncDrawerActive(tabName);

        // Load calendar when switching to calendar tab
        if (tabName === 'calendar') {
            calendarInit();
        }

        // Load unresolved movies when switching to resolve tab
        if (tabName === 'resolve') {
            loadUnresolved();
        }

        // Load shelves when switching to shelves tab
        if (tabName === 'shelves') {
            loadShelves();
            loadLayoutProfiles();
        }

        // Restore collection sub-view when switching to collection tab
        if (tabName === 'collection') {
            switchCollectionView(currentCollectionSubview);
        }

        // Show type choice when switching to add tab
        if (tabName === 'add') {
            showAddTypeChoice();
        }

        // Update PWA install UI when switching to settings tab
        if (tabName === 'settings') {
            initPWAInstallUI();
            renderNavPicker();
        }
    }

    function switchCollectionView(view) {
        currentCollectionSubview = view;

        // Update sub-nav button states
        document.querySelectorAll('.subview-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subview === view);
        });

        // Show/hide sub-panels
        const panels = {
            physical:  document.getElementById('subviewPhysical'),
            movies:    document.getElementById('subviewMovies'),
            wishlist:  document.getElementById('subviewWishlist'),
            boxsets:   document.getElementById('subviewBoxSets'),
            shelfview: document.getElementById('subviewShelf'),
            spreadsheet: document.getElementById('subviewSpreadsheet')
        };
        Object.entries(panels).forEach(([key, el]) => {
            if (el) el.style.display = key === view ? 'block' : 'none';
        });

        // Show shelf filter and main sort only for Movies sub-view
        const shelfFilter = document.getElementById('shelfFilter');
        const sortBy = document.getElementById('sortBy');
        const filterBar = document.getElementById('filterBar');
        const viewSwitcher = document.querySelector('#collection .view-switcher');
        const filterToggleBtn = document.getElementById('filterToggleBtn');
        if (shelfFilter) shelfFilter.style.display     = view === 'movies' ? '' : 'none';
        if (sortBy)      sortBy.style.display          = (view === 'movies' || view === 'wishlist') ? '' : 'none';
        if (filterBar)   filterBar.style.display        = view === 'movies' ? '' : 'none';
        if (filterToggleBtn) filterToggleBtn.style.display = view === 'movies' ? '' : 'none';
        // Show view switcher for movies, wishlist, boxsets, physical; hide for shelfview and spreadsheet
        if (viewSwitcher) viewSwitcher.style.display = (view === 'shelfview' || view === 'spreadsheet') ? 'none' : '';

        // Update floating search: close it, clear results, update placeholder
        const floatingBar = document.getElementById('floatingSearchBar');
        const searchFabBtn = document.getElementById('searchFabBtn');
        const floatingInp = document.getElementById('floatingSearchInput');
        if (floatingBar && floatingBar.classList.contains('open')) {
            floatingBar.classList.remove('open');
            floatingBar.setAttribute('aria-hidden', 'true');
            if (searchFabBtn) searchFabBtn.classList.remove('active');
            if (floatingInp) floatingInp.value = '';
            // Clear the search in whichever subview we're leaving
            onQuickSearch('');
        }
        if (floatingInp) {
            const placeholders = { movies: 'Search movies…', wishlist: 'Search wishlist…', physical: 'Search physical media…', boxsets: 'Search box sets…' };
            floatingInp.placeholder = placeholders[view] || 'Search…';
        }
        // Hide search FAB for spreadsheet and shelfview
        if (searchFabBtn) searchFabBtn.style.display = (view === 'shelfview' || view === 'spreadsheet') ? 'none' : '';

        // Update the section heading
        const header = document.getElementById('collectionHeader');
        if (header) {
            if (view === 'physical') header.textContent = 'Physical Media';
            if (view === 'movies')    header.textContent = `Your Collection (${collection.length})`;
            if (view === 'wishlist')  header.textContent = `Your Wishlist (${wishlist.length})`;
            if (view === 'boxsets')   header.textContent = 'Box Sets';
            if (view === 'shelfview') header.textContent = 'Shelf View';
            if (view === 'spreadsheet') header.textContent = 'Bulk Editor';
        }

        // Load data for the selected sub-view
        if (view === 'physical') {
            loadPhysicalMedia();
        } else if (view === 'wishlist') {
            loadWishlist();
        } else if (view === 'boxsets') {
            loadBoxSets();
        } else if (view === 'shelfview') {
            loadShelfViewBrowse();
        } else if (view === 'spreadsheet') {
            loadSpreadsheetData();
        }

        // Re-measure sticky bar height after content/controls change
        requestAnimationFrame(updateStickyBarHeight);
    }

    // ========================================
    // SHELF VIEW BROWSER (inside Collection tab)
    // Hierarchical shelf navigation with back button
    // ========================================

    let shelfViewStack = []; // [{id: null, name: 'All Shelves'}, {id:5, name:'Living Room'}, ...]
    let shelfViewMoviesCache = {}; // keyed by shelf_id → array of items
    let _layoutSections = [];     // sections for the active layout (populated by loadShelfViewBrowse)
    let _splitMoveState = null;   // state for the section split/move modal
    // Per-shelf expansion state for the nav tree; initialized from localStorage
    let _expandedShelves = (() => {
        try { return JSON.parse(localStorage.getItem('cineshelf_expandedShelves') || '{}'); }
        catch(e) { return {}; }
    })();
    // Global master switch: show/hide section rows for all shelves (v2.8.25)
    let _showSections = (() => {
        try { return localStorage.getItem('cineshelf_showSections') === 'true'; }
        catch(e) { return false; }
    })();
    // Per-shelf spine-strip expansion state (v2.9.1): empty = all collapsed by default
    let _spineExpanded = (() => {
        try { return JSON.parse(localStorage.getItem('cineshelf_spineExpanded') || '{}'); }
        catch(e) { return {}; }
    })();

    // Format → spine color mapping
    const SPINE_FORMAT_COLORS = {
        '4k': '#c0a020', 'uhd': '#c0a020', 'blu-ray': '#1a6fd4', 'bluray': '#1a6fd4',
        'blu_ray': '#1a6fd4', 'dvd': '#c0392b', 'vhs': '#27ae60', 'laserdisc': '#8e44ad',
        '16mm': '#d35400', 'digital': '#2980b9'
    };

    function spineColorForItem(item, shelfColor) {
        if (item.is_container) return null; // handled separately
        const mode = (settings.spineColorMode) || 'shelf';
        if (mode === 'shelf') return shelfColor || '#667eea';
        // 'auto' mode: per-copy color (from edition cover) takes precedence, then movie-level color
        if (mode === 'auto' && item.copy_spine_color) return item.copy_spine_color;
        if (mode === 'auto' && item.movie_spine_color) return item.movie_spine_color;
        // 'auto' and 'format' both fall back to format-based colour
        const fmt = (item.format || '').toLowerCase();
        for (const [key, val] of Object.entries(SPINE_FORMAT_COLORS)) {
            if (fmt.includes(key)) return val;
        }
        return shelfColor || '#667eea';
    }

    // Recursively collect all items from shelfId and all descendants (deduped)
    function getShelfMoviesRecursive(shelfId) {
        const direct = shelfViewMoviesCache[shelfId] || [];
        const children = shelves.filter(s => s.parent_shelf_id === shelfId);
        let all = [...direct];
        children.forEach(child => { all = all.concat(getShelfMoviesRecursive(child.id)); });
        const seen = new Set();
        return all.filter(item => {
            const key = item.is_container ? `c_${item.container_id}` : `m_${item.copy_id}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
        });
    }

    /**
     * Always-fresh sections loader (v2.8.22).
     * Re-fetches layoutProfiles unconditionally so we never use stale
     * is_active data, then fetches get_layout_sections for the active layout.
     * Collapse state is purely visual — sections are always loaded.
     */
    async function loadActiveLayoutSections() {
        try { await loadLayoutProfiles(); } catch(e) {}
        const activeLayout = layoutProfiles.find(l => l.is_active == 1);
        if (activeLayout) {
            try {
                const res = await apiCall('get_layout_sections', { layout_id: activeLayout.id });
                // apiCall returns result.data directly; guard against unexpected wrapping shapes (v2.8.25)
                const arr = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                _layoutSections = arr;
                console.log(`[CineShelf] loadActiveLayoutSections: ${arr.length} sections for layout ${activeLayout.id} (${activeLayout.name})`);
                if (arr.length > 0) {
                    showToast(`Loaded ${arr.length} sections for layout ${activeLayout.id}`, 'success');
                }
            } catch(e) {
                console.warn('[CineShelf] loadActiveLayoutSections error:', e.message || e);
                _layoutSections = [];
            }
        } else {
            _layoutSections = [];
        }
    }

    async function loadShelfViewBrowse(reset = true) {
        if (reset || shelfViewStack.length === 0) {
            shelfViewStack = [{ id: null, name: 'All Shelves' }];
        }
        if (!shelves || shelves.length === 0) {
            try { shelves = await apiCall('list_shelves'); } catch(e) {}
        }

        const content = document.getElementById('shelfViewContent');
        if (content) content.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,0.5)">Loading shelves…</div>';

        // Load active layout + sections FIRST — determines whether shelf contents are shown (v2.8.26)
        await loadActiveLayoutSections();

        const hasActiveLayout = layoutProfiles.some(l => l.is_active == 1);
        shelfViewMoviesCache = {};
        if (hasActiveLayout) {
            // Only fetch per-shelf contents when an active layout exists (Option 1 enforcement)
            await Promise.all(shelves.map(async shelf => {
                try {
                    const items = await apiCall('get_shelf_contents', { shelf_id: shelf.id });
                    shelfViewMoviesCache[shelf.id] = items || [];
                } catch(e) {
                    shelfViewMoviesCache[shelf.id] = [];
                }
            }));
        }

        await renderShelfViewLevel();
    }

    /** Refresh shelf data everywhere: list view, visual view, and shelf-view browser cache */
    async function refreshAllShelfViews() {
        await loadShelves();
        if (shelfView === 'visual') renderShelvesVisual();
        // Always refresh sections regardless of which tab is active (v2.8.22 fix)
        await loadActiveLayoutSections();
        // If the shelf-view browser is the active collection sub-view, reload its cache too
        if (currentCollectionSubview === 'shelfview') {
            await loadShelfViewBrowse(false);
        }
        // If viewing a specific shelf's contents in the manage panel, reload that too
        if (currentShelf) {
            viewShelfContents(currentShelf.id);
        }
    }

    function shelfViewDrillIn(shelfId, shelfName) {
        shelfViewStack.push({ id: shelfId, name: shelfName });
        renderShelfViewLevel();
    }

    function shelfViewBack() {
        if (shelfViewStack.length > 1) {
            shelfViewStack.pop();
            renderShelfViewLevel();
        }
    }

    // Build a JSON-safe list of movie_ids (non-containers) for nav context
    function _shelfNavIds(items) {
        return JSON.stringify(
            items.filter(i => !i.is_container).map(i => i.movie_id)
        );
    }

    // Copy-aware nav list: "copyId:movieId,copyId:movieId,..." — no JSON quotes, safe in onclick attrs
    function _shelfNavCopies(items) {
        return items.filter(i => !i.is_container).map(i => `${i.copy_id||0}:${i.movie_id}`).join(',');
    }

    function renderSpineStrip(items, shelfColor) {
        if (!items || items.length === 0) {
            return `<span class="spine-empty-msg">Empty</span>`;
        }
        const navIds = _shelfNavCopies(items);
        return items.map(item => {
            if (item.is_container) {
                const count = item.container_movie_count || 0;
                const label = item.container_spine_label || item.container_name || 'Box Set';
                const spineType = item.container_spine_type || item.spine_type || 'color';
                const spineColor = item.container_spine_color || '#667eea';
                const spineImageUrl = item.container_spine_image_url;

                // Determine spine style based on type
                let spineStyle = '';
                let spineContent = '';

                if (spineType === 'custom' && spineImageUrl) {
                    spineStyle = `background-image: url('${spineImageUrl}'); background-size: cover; background-position: center;`;
                    spineContent = `<span class="spine-title" style="text-shadow: 0 1px 4px rgba(0,0,0,0.9);">${label}</span>`;
                } else {
                    spineStyle = `--spine-color: ${spineColor};`;
                    spineContent = `<span class="spine-title">${label}</span>`;
                }

                return `<div class="spine-item spine-container"
                             title="${(item.container_name || '').replace(/"/g,'&quot;')} · ${count} films"
                             onclick="App.showBoxSetDetails(${item.container_id})"
                             style="${spineStyle}"
                             data-container-id="${item.container_id}">
                            ${spineContent}
                            ${count > 0 ? `<span class="spine-badge">${count}</span>` : ''}
                        </div>`;
            } else {
                const color = spineColorForItem(item, shelfColor);
                const title = (item.display_title || item.title || '').replace(/"/g,'&quot;');
                // Prefer edition cover (copy-specific art) for color extraction; fall back to TMDB poster
                const posterUrl = item.edition_cover_url || item.poster_url;
                // Only skip extraction if the per-source color is already stored
                const hasStoredColor = item.edition_cover_url
                    ? !!item.copy_spine_color
                    : !!item.movie_spine_color;
                return `<div class="spine-item"
                             title="${title} (${item.year || '?'}) · ${item.format || ''}"
                             onclick="App.viewCopyDetailsWithNav(${item.copy_id || 0}, ${item.movie_id}, '${navIds}')"
                             style="--spine-color:${color}"
                             data-poster-url="${posterUrl || ''}"
                             data-movie-id="${item.movie_id}"
                             data-copy-id="${item.copy_id || ''}"
                             ${hasStoredColor ? 'data-stored-color="1"' : ''}>
                            <span class="spine-title">${item.display_title || item.title}</span>
                        </div>`;
            }
        }).join('');
    }

    // Apply average poster colors to spine items after rendering; persist to DB on first extraction
    async function applyPosterSpineColors(container) {
        const spineItems = container.querySelectorAll('.spine-item[data-poster-url]:not(.spine-container)');
        for (const spine of spineItems) {
            // Skip spines that already have a DB-stored color — no need to re-extract
            if (spine.dataset.storedColor) continue;
            const posterUrl = spine.dataset.posterUrl;
            const movieId   = spine.dataset.movieId;
            const copyId = spine.dataset.copyId;
            if (posterUrl && posterUrl !== 'null' && posterUrl !== '') {
                try {
                    const color = await extractAverageColor(posterUrl);
                    spine.style.setProperty('--spine-color', color);
                    // Persist extracted colour: per-copy when a copy has its own cover, else per-movie
                    if (copyId) {
                        apiCall('save_copy_spine_color', { copy_id: parseInt(copyId), spine_color: color }).catch(() => {});
                    } else if (movieId) {
                        apiCall('save_movie_spine_color', { movie_id: parseInt(movieId), spine_color: color }).catch(() => {});
                    }
                } catch (e) { /* keep default */ }
            }
        }
    }

    function renderPosterGrid(items) {
        if (!items || items.length === 0) return '';
        const navIds = _shelfNavCopies(items);
        let html = `<div class="shelf-view-movies-grid">`;
        items.forEach(item => {
            if (item.is_container) {
                const coverUrl = item.container_umdb_cover_url || item.container_spine_image_url;
                html += `<div class="shelf-view-movie-card container-card" onclick="App.showBoxSetDetails(${item.container_id})">
                    ${coverUrl
                        ? `<img src="${coverUrl}" alt="${(item.container_name||'').replace(/"/g,'')}" class="shelf-view-poster" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                           <div class="shelf-view-poster-placeholder" style="display:none; background:${item.container_spine_color || '#764ba2'}; font-size:2rem;">📦</div>`
                        : `<div class="shelf-view-poster-placeholder" style="background:${item.container_spine_color || '#764ba2'}; font-size:2rem;">📦</div>`}
                    <div class="shelf-view-movie-title">${item.container_name}</div>
                    <div class="shelf-view-movie-meta">Box Set · ${item.container_movie_count || 0} films</div>
                </div>`;
            } else {
                const shelfPoster = item.edition_cover_url || item.poster_url;
                const shelfFallback = item.edition_cover_url && item.poster_url ? item.poster_url : null;
                html += `<div class="shelf-view-movie-card" onclick="App.viewCopyDetailsWithNav(${item.copy_id || 0}, ${item.movie_id}, '${navIds}')">
                    ${shelfPoster
                        ? `<img src="${shelfPoster}" alt="${(item.display_title||item.title||'').replace(/"/g,'')}" class="shelf-view-poster" onerror="${shelfFallback ? `this.src='${shelfFallback}'` : "this.parentElement.classList.add('no-poster');this.style.display='none'"}">`
                        : `<div class="shelf-view-poster-placeholder">🎬</div>`}
                    <div class="shelf-view-movie-title">${item.display_title || item.title}</div>
                    <div class="shelf-view-movie-meta">${item.year || ''} · ${item.format || ''}</div>
                </div>`;
            }
        });
        html += `</div>`;
        return html;
    }

    async function renderShelfViewLevel() {
        const content = document.getElementById('shelfViewContent');
        const breadcrumb = document.getElementById('shelfBreadcrumb');
        if (!content || !breadcrumb) return;

        // No active layout → shelf view is empty by design (v2.8.26: Option 1 enforcement)
        const hasActiveLayout = layoutProfiles.some(l => l.is_active == 1);
        if (!hasActiveLayout) {
            breadcrumb.innerHTML = '<span class="shelf-crumb shelf-crumb-active">🏠 All Shelves</span>';
            content.innerHTML = `<div class="empty-state" style="padding:3rem 0">
                <div class="empty-icon">🗂️</div>
                <h3>No active layout selected</h3>
                <p>Use the layout selector above to apply a saved layout, or run the ✨ AI Wizard to create one.</p>
            </div>`;
            return;
        }

        const current = shelfViewStack[shelfViewStack.length - 1];
        const parentId = current.id;

        // Render breadcrumb trail
        breadcrumb.innerHTML = shelfViewStack.map((crumb, i) => {
            const isLast = i === shelfViewStack.length - 1;
            const icon = i === 0 ? '🏠 ' : '📂 ';
            if (isLast) return `<span class="shelf-crumb shelf-crumb-active">${icon}${crumb.name}</span>`;
            return `<span class="shelf-crumb" onclick="App.shelfViewGoTo(${i})">${icon}${crumb.name}</span>` +
                   `<span class="shelf-crumb-sep">›</span>`;
        }).join('');

        if (shelfViewStack.length > 1) {
            breadcrumb.innerHTML = `<button class="shelf-view-back-btn" onclick="App.shelfViewBack()">‹ Back</button> ` + breadcrumb.innerHTML;
        }

        // Child shelves at this level
        const childShelves = shelves.filter(s =>
            parentId === null ? !s.parent_shelf_id : s.parent_shelf_id === parentId
        );

        // Movies directly on this shelf (null = root, shows nothing direct)
        const directItems = parentId !== null ? (shelfViewMoviesCache[parentId] || []) : [];

        // Leaf = no child shelves → show poster grid
        const isLeaf = childShelves.length === 0;

        let html = '';

        if (isLeaf) {
            // ── LEAF VIEW: poster grid ──────────────────────────────
            if (directItems.length === 0) {
                html = `<div class="empty-state" style="padding:3rem 0">
                    <div class="empty-icon">📂</div><h3>Empty shelf</h3>
                    <p>No movies assigned to this shelf yet.</p>
                </div>`;
            } else {
                html += `<div class="shelf-view-section-label">MOVIES ON THIS SHELF (${directItems.length})</div>`;
                html += renderPosterGrid(directItems);
            }
        } else {
            // ── PARENT VIEW: one spine row per child shelf ──────────
            // Global "Show Sections" toolbar — only when sections exist (v2.8.25)
            if (_layoutSections.length > 0) {
                html += `<div class="shelf-sections-toolbar">
                    <button class="shelf-sections-global-toggle" onclick="App.toggleShowSections()">
                        ${_showSections ? '▼ Hide Sections' : '▶ Show Sections'} (${_layoutSections.length} total)
                    </button>
                </div>`;
            }

            childShelves.forEach(shelf => {
                const shelfMovies = getShelfMoviesRecursive(shelf.id);
                const subSectionCount = shelves.filter(s => s.parent_shelf_id === shelf.id).length;
                const safeName = shelf.name.replace(/'/g, "\\'");

                // Build structural section rows for this child shelf (v2.8.21, updated v2.8.25)
                const shelfSections = _layoutSections.filter(s => Number(s.shelf_id) === shelf.id);
                // _showSections is the global master; per-shelf caret stores false to explicitly collapse
                const isExpanded = _showSections && shelfSections.length > 0 && (_expandedShelves[shelf.id] !== false);
                let caretHtml = '';
                let sectionCountPillHtml = '';
                let sectionRowsHtml = '';
                if (shelfSections.length > 0) {
                    // Only show caret when sections are globally shown (otherwise global toggle is the control)
                    if (_showSections) {
                        const caretGlyph = isExpanded ? '▼' : '▶';
                        caretHtml = `<button class="shelf-sections-caret"
                            onclick="event.stopPropagation();App.toggleShelfSections(${shelf.id})"
                            title="${isExpanded ? 'Collapse sections' : 'Expand sections'}">${caretGlyph}</button>`;
                    }
                    sectionCountPillHtml = `<span class="shelf-section-count-pill"
                        onclick="event.stopPropagation();App.toggleShowSections()"
                        style="cursor:pointer;">${shelfSections.length} section${shelfSections.length !== 1 ? 's' : ''}</span>`;
                    if (isExpanded) {
                        sectionRowsHtml = `<div class="shelf-section-rows">` +
                            shelfSections.map(sec =>
                                `<div class="shelf-section-row" id="section-row-${sec.id}">
                                    <span class="section-row-label" title="${sec.label.replace(/"/g,'&quot;')}">${sec.label.replace(/</g,'&lt;')}</span>
                                    <span class="section-row-count">${sec.item_count}</span>
                                    <button class="section-row-move-btn"
                                        onclick="App.openSectionSplitModal(${sec.id})">↗ Move</button>
                                </div>`
                            ).join('') +
                            `</div>`;
                    }
                }

                const spineIsOpen = _spineExpanded[shelf.id] !== false;
                const spineGlyph = spineIsOpen ? '▼' : '▶';
                const shelfColorVal = shelf.color || '#667eea';
                html += `
                <div class="shelf-row ${spineIsOpen ? 'spine-open' : 'spine-closed'}"
                     style="--shelf-color:${shelfColorVal}">
                    <div class="shelf-row-header"
                         onclick="App.shelfViewDrillIn(${shelf.id}, '${safeName}')"
                         title="Open ${safeName}">
                        <!-- Small ▼/▶ spine-strip toggle — stops propagation so it won't drill in -->
                        <button class="shelf-spine-toggle-btn"
                                onclick="event.stopPropagation();App.toggleShelfSpine(${shelf.id})"
                                title="${spineIsOpen ? 'Collapse' : 'Expand'} spine strip">
                            ${spineGlyph}
                        </button>
                        ${caretHtml}
                        <span class="shelf-row-icon">${shelf.icon || '📂'}</span>
                        <span class="shelf-row-name">${shelf.name}</span>
                        <span class="shelf-row-meta">
                            ${shelfMovies.length} film${shelfMovies.length !== 1 ? 's' : ''}
                            ${sectionCountPillHtml ? ' · ' + sectionCountPillHtml : (subSectionCount > 0 ? ` · ${subSectionCount} section${subSectionCount !== 1 ? 's' : ''}` : '')}
                        </span>
                        <span class="shelf-drill-arrow">›</span>
                    </div>
                    ${sectionRowsHtml}
                    <div class="shelf-spine-row" style="--shelf-color:${shelfColorVal}" ${spineIsOpen ? '' : 'hidden'}>
                        ${renderSpineStrip(shelfMovies, shelfColorVal)}
                    </div>
                </div>`;
            });

            // Direct movies on this (non-root) shelf shown as its own spine row
            if (directItems.length > 0) {
                const shelfColor = shelves.find(s => s.id === parentId)?.color || '#667eea';
                html += `
                <div class="shelf-row">
                    <div class="shelf-row-header" style="cursor:default;border-left-color:${shelfColor}">
                        <span class="shelf-row-name">Directly on this shelf</span>
                        <span class="shelf-row-meta">${directItems.length} film${directItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="shelf-spine-row">
                        ${renderSpineStrip(directItems, shelfColor)}
                    </div>
                </div>`;
            }

            if (childShelves.length === 0 && directItems.length === 0) {
                html = `<div class="empty-state" style="padding:3rem 0">
                    <div class="empty-icon">📂</div><h3>No shelves yet</h3>
                    <p>Create a shelf to start organizing.</p>
                </div>`;
            }
        }

        content.innerHTML = html;

        // Auto-color spines from cover art — only in 'auto' mode (v2.9.2)
        if ((settings.spineColorMode || 'shelf') === 'auto') {
            applyPosterSpineColors(content);
        }
    }

    function shelfViewGoTo(stackIndex) {
        shelfViewStack = shelfViewStack.slice(0, stackIndex + 1);
        renderShelfViewLevel();
    }

    /**
     * _shelfDebugSnapshot() — temporary diagnostic helper (v2.8.23)
     * Call from DevTools: App._shelfDebugSnapshot()
     * Logs a JSON snapshot of all in-memory shelf state and fires
     * debug_shelf_state for the first child shelf in view (if any).
     */
    function _shelfDebugSnapshot() {
        const activeLayout = layoutProfiles.find(l => l.is_active == 1);
        const current = shelfViewStack[shelfViewStack.length - 1];
        const parentId = current ? current.id : null;
        const childShelfIds = shelves
            .filter(s => parentId === null ? !s.parent_shelf_id : s.parent_shelf_id === parentId)
            .map(s => s.id);
        const firstChildId = childShelfIds[0] || null;

        const snap = {
            currentCollectionSubview,
            shelfViewStack: shelfViewStack.map(s => ({ id: s.id, name: s.name })),
            activeLayoutId:   activeLayout ? activeLayout.id   : null,
            activeLayoutName: activeLayout ? activeLayout.name : null,
            layoutProfilesCount:  layoutProfiles.length,
            layoutSectionsCount:  _layoutSections.length,
            shelfViewCacheEntries: Object.fromEntries(
                Object.entries(shelfViewMoviesCache).map(([k, v]) => [k, Array.isArray(v) ? v.length : '?'])
            ),
            expandedShelves:              _expandedShelves,
            localStorage_expandedShelves: (() => {
                try { return JSON.parse(localStorage.getItem('cineshelf_expandedShelves') || 'null'); }
                catch(e) { return null; }
            })(),
        };
        console.log('[CineShelf DebugSnapshot]', JSON.stringify(snap, null, 2));

        // Fire server-side debug call for the first visible child shelf
        if (firstChildId && activeLayout) {
            apiCall('debug_shelf_state', {
                shelf_id:  firstChildId,
                layout_id: activeLayout.id,
            }).then(res => {
                console.log('[CineShelf DebugSnapshot server]', JSON.stringify(res, null, 2));
            }).catch(e => {
                console.warn('[CineShelf DebugSnapshot server error]', e.message || e);
            });
        } else if (!activeLayout) {
            apiCall('debug_shelf_state', {}).then(res => {
                console.log('[CineShelf DebugSnapshot server (no active layout)]', JSON.stringify(res, null, 2));
            }).catch(() => {});
        }
        return snap;
    }

    // Move a layout section to a different child shelf (Goal D)
    async function moveSectionToShelf(sectionId, targetShelfId, layoutId) {
        sectionId    = Number(sectionId);
        targetShelfId = Number(targetShelfId);
        layoutId      = Number(layoutId);
        if (!sectionId || !targetShelfId) return;
        try {
            const res = await apiCall('move_layout_section', {
                section_id:      sectionId,
                target_shelf_id: targetShelfId,
            });
            if (res && res.sections) {
                _layoutSections = res.sections;
            }
            // Resync shelf_assignments from the updated layout entries
            if (layoutId) {
                try { await apiCall('apply_shelf_layout', { layout_id: layoutId }); } catch(e) {}
            }
            // Refresh cached shelf contents for all shelves
            await Promise.all(shelves.map(async shelf => {
                try {
                    const items = await apiCall('get_shelf_contents', { shelf_id: shelf.id });
                    shelfViewMoviesCache[shelf.id] = items || [];
                } catch(e) { shelfViewMoviesCache[shelf.id] = []; }
            }));
            renderShelfViewLevel();
            showToast('Section moved!', 'success');
        } catch(e) {
            showToast('Failed to move section: ' + (e.message || e), 'error');
        }
    }

    // ── Section nav-tree toggle (v2.8.21, updated v2.8.25) ────────────
    function toggleShelfSections(shelfId) {
        shelfId = Number(shelfId);
        // false = explicitly collapsed; undefined/missing = expanded (when _showSections is on)
        if (_expandedShelves[shelfId] === false) {
            delete _expandedShelves[shelfId];
        } else {
            _expandedShelves[shelfId] = false;
        }
        try { localStorage.setItem('cineshelf_expandedShelves', JSON.stringify(_expandedShelves)); } catch(e) {}
        renderShelfViewLevel();
    }

    // ── Global sections master switch (v2.8.25) ────────────────────────
    function toggleShowSections() {
        _showSections = !_showSections;
        try { localStorage.setItem('cineshelf_showSections', String(_showSections)); } catch(e) {}
        renderShelfViewLevel();
    }

    // ── Per-shelf spine strip toggle (v2.9.1) ─────────────────────────
    function toggleShelfSpine(shelfId) {
        if (_spineExpanded[shelfId] === false) {
            delete _spineExpanded[shelfId]; // back to default (open)
        } else {
            _spineExpanded[shelfId] = false; // explicitly close
        }
        try { localStorage.setItem('cineshelf_spineExpanded', JSON.stringify(_spineExpanded)); } catch(e) {}
        renderShelfViewLevel();
    }

    // ── Section split / move modal (v2.8.21 — Parts B + D) ────────────

    function openSectionSplitModal(sectionId) {
        const sec = _layoutSections.find(s => Number(s.id) === Number(sectionId));
        if (!sec) return;

        // Find sibling shelves (same parent as this section's shelf)
        const thisShelf = shelves.find(s => s.id === Number(sec.shelf_id));
        const parentId  = thisShelf ? thisShelf.parent_shelf_id : null;
        const siblings  = shelves.filter(s =>
            s.id !== Number(sec.shelf_id) &&
            (parentId !== null ? s.parent_shelf_id === parentId : s.parent_shelf_id === null)
        );

        const activeLayout = layoutProfiles.find(l => l.is_active == 1);
        _splitMoveState = {
            sectionId: Number(sec.id),
            itemCount: Number(sec.item_count),
            layoutId:  activeLayout ? Number(activeLayout.id) : 0,
        };

        document.getElementById('splitSectionLabel').textContent = sec.label;
        document.getElementById('splitTotalCount').textContent   = sec.item_count;
        const countInput = document.getElementById('splitMoveCount');
        countInput.max   = sec.item_count;
        countInput.value = 1;
        document.getElementById('splitFromEnd').checked = true;

        const sel = document.getElementById('splitTargetShelf');
        sel.innerHTML = '<option value="">Select shelf…</option>' +
            siblings.map(s =>
                `<option value="${s.id}">${s.name.replace(/</g,'&lt;').replace(/"/g,'&quot;')}</option>`
            ).join('');

        document.getElementById('sectionSplitModal').classList.add('active');
    }

    function closeSectionSplitModal() {
        document.getElementById('sectionSplitModal').classList.remove('active');
        _splitMoveState = null;
    }

    async function confirmSectionSplitMove() {
        if (!_splitMoveState) return;
        const targetShelfId = Number(document.getElementById('splitTargetShelf').value);
        const moveCount     = Number(document.getElementById('splitMoveCount').value);
        const fromEnd       = document.getElementById('splitFromEnd').checked;

        if (!targetShelfId) { showToast('Select a target shelf', 'error'); return; }
        if (!moveCount || moveCount < 1) { showToast('Move count must be at least 1', 'error'); return; }

        const state = _splitMoveState; // capture before close
        closeSectionSplitModal();

        try {
            const res = await apiCall('split_move_layout_section', {
                section_id:      state.sectionId,
                target_shelf_id: targetShelfId,
                move_count:      moveCount,
                from_end:        fromEnd,
            });
            if (res && res.sections) { _layoutSections = res.sections; }
            // Resync shelf_assignments from the updated layout entries
            if (state.layoutId) {
                try { await apiCall('apply_shelf_layout', { layout_id: state.layoutId }); } catch(e) {}
            }
            // Refresh cached shelf contents for all shelves
            await Promise.all(shelves.map(async shelf => {
                try {
                    const items = await apiCall('get_shelf_contents', { shelf_id: shelf.id });
                    shelfViewMoviesCache[shelf.id] = items || [];
                } catch(e) { shelfViewMoviesCache[shelf.id] = []; }
            }));
            renderShelfViewLevel();
            showToast(`Moved ${res.moved || moveCount} item${(res.moved || moveCount) !== 1 ? 's' : ''}!`, 'success');
        } catch(e) {
            showToast('Failed to move: ' + (e.message || e), 'error');
        }
    }

    function splitModalQuickAdd(n) {
        if (!_splitMoveState) return;
        const input = document.getElementById('splitMoveCount');
        input.value = Math.min(_splitMoveState.itemCount, Number(input.value || 0) + n);
    }

    function splitModalSetAll() {
        if (!_splitMoveState) return;
        document.getElementById('splitMoveCount').value = _splitMoveState.itemCount;
    }

    // ========================================
    // PHYSICAL MEDIA VIEW
    // Shows all physical copies grouped by shelf, format, or flat
    // ========================================

    let physicalMediaCache = [];
    let _physicalSearchQuery = '';

    function filterPhysicalMedia(val) {
        _physicalSearchQuery = (val || '').toLowerCase().trim();
        renderPhysicalMedia();
    }

    function setPhysicalView(mode) {
        setView(mode);
    }

    async function loadPhysicalMedia() {
        const content = document.getElementById('physicalMediaContent');
        if (!content) return;
        content.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,0.5)">Loading physical media…</div>';

        if (!shelves || shelves.length === 0) {
            try { shelves = await apiCall('list_shelves'); } catch(e) {}
        }

        const allItems = [];
        await Promise.all((shelves || []).map(async shelf => {
            try {
                const items = await apiCall('get_shelf_contents', { shelf_id: shelf.id });
                (items || []).forEach(item => {
                    allItems.push({ ...item, _shelfId: shelf.id, _shelfName: shelf.name, _shelfColor: shelf.color || '#667eea', _shelfIcon: shelf.icon || '📂' });
                });
            } catch(e) {}
        }));

        physicalMediaCache = allItems;
        renderPhysicalMedia();
    }

    function _physicalSort(items) {
        const sortBy = document.getElementById('physicalSortBy')?.value || 'title';
        const sorted = [...items];
        sorted.sort((a, b) => {
            const tA = (a.display_title || a.title || a.container_name || '').toLowerCase();
            const tB = (b.display_title || b.title || b.container_name || '').toLowerCase();
            switch (sortBy) {
                case 'title':       return tA.localeCompare(tB);
                case 'title-desc':  return tB.localeCompare(tA);
                case 'year-desc':   return (b.year || 0) - (a.year || 0);
                case 'year':        return (a.year || 9999) - (b.year || 9999);
                case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
                case 'rating':      return (a.rating || 99) - (b.rating || 99);
                case 'runtime-desc':return (b.runtime || 0) - (a.runtime || 0);
                case 'runtime':     return (a.runtime || 9999) - (b.runtime || 9999);
                case 'director':    return (a.director || 'zzz').localeCompare(b.director || 'zzz');
                case 'studio':      return (a.studio || 'zzz').localeCompare(b.studio || 'zzz');
                case 'certification': return (a.certification || 'zzz').localeCompare(b.certification || 'zzz');
                default: return tA.localeCompare(tB);
            }
        });
        return sorted;
    }

    function renderPhysicalMedia() {
        const content = document.getElementById('physicalMediaContent');
        if (!content) return;

        const groupBy = document.getElementById('physicalGroupBy')?.value || 'shelf';
        const items = physicalMediaCache;

        if (items.length === 0) {
            content.innerHTML = `<div class="empty-state" style="padding:3rem 0">
                <div class="empty-icon">💿</div><h3>No physical media found</h3>
                <p>Add movies to your shelves to see them here.</p>
            </div>`;
            return;
        }

        const seen = new Set();
        let unique = items.filter(item => {
            const key = item.is_container ? `c_${item.container_id}` : `m_${item.copy_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Apply search filter if active
        if (_physicalSearchQuery) {
            unique = unique.filter(item => {
                const t = (item.is_container
                    ? (item.container_name || '')
                    : (item.display_title || item.title || '')
                ).toLowerCase();
                return t.includes(_physicalSearchQuery);
            });
            if (unique.length === 0) {
                content.innerHTML = `<div class="empty-state" style="padding:3rem 0">
                    <div class="empty-icon">🔍</div>
                    <h3>No results for "${_physicalSearchQuery.replace(/</g,'&lt;')}"</h3>
                    <p>Try a different search term.</p></div>`;
                return;
            }
        }

        let html = '';
        const renderFn = renderPhysicalItems;

        if (groupBy === 'flat') {
            html = renderFn(_physicalSort(unique));
        } else if (groupBy === 'format') {
            const groups = {};
            unique.forEach(item => {
                const fmt = item.is_container ? 'Box Set' : (item.format || 'Unknown');
                if (!groups[fmt]) groups[fmt] = [];
                groups[fmt].push(item);
            });
            Object.keys(groups).sort().forEach(fmt => {
                html += `<div class="physical-group">
                    <div class="physical-group-header">
                        <span class="physical-group-title">${fmt}</span>
                        <span class="physical-group-count">${groups[fmt].length} item${groups[fmt].length !== 1 ? 's' : ''}</span>
                    </div>
                    ${renderFn(_physicalSort(groups[fmt]))}
                </div>`;
            });
        } else {
            const groups = {};
            unique.forEach(item => {
                const key = item._shelfId || 'unassigned';
                if (!groups[key]) groups[key] = { name: item._shelfName || 'Unassigned', icon: item._shelfIcon || '📂', color: item._shelfColor || '#667eea', items: [] };
                groups[key].items.push(item);
            });
            Object.values(groups).forEach(group => {
                html += `<div class="physical-group">
                    <div class="physical-group-header" style="border-left: 3px solid ${group.color};">
                        <span class="physical-group-title">${group.icon} ${group.name}</span>
                        <span class="physical-group-count">${group.items.length} item${group.items.length !== 1 ? 's' : ''}</span>
                    </div>
                    ${renderFn(_physicalSort(group.items))}
                </div>`;
            });
        }

        content.innerHTML = html;
    }

    function _physicalNavIds(items) {
        return JSON.stringify(items.filter(i => !i.is_container).map(i => i.movie_id));
    }

    function _physicalItemClick(item, copyNavIds) {
        if (item.is_container) return `onclick="App.showBoxSetDetails(${item.container_id})"`;
        return `onclick="App.viewCopyDetailsWithNav(${item.copy_id || 0}, ${item.movie_id}, '${copyNavIds}')"`;
    }

    // ── Unified physical media renderer (matches Movies card structure) ──
    function renderPhysicalItems(items) {
        const navIds = items.filter(i => !i.is_container).map(i => `${i.copy_id||0}:${i.movie_id}`).join(',');
        const viewClass = currentView === 'list' ? 'list-view' : currentView === 'compact' ? 'compact-view' : currentView === 'gallery' ? 'gallery-view' : 'grid-view';
        return `<div class="movie-grid ${viewClass}">` + items.map(item => {
            // Box set containers
            if (item.is_container) {
                const cover = item.container_umdb_cover_url || item.container_spine_image_url;
                const safeTitle = (item.container_name || 'Box Set').replace(/"/g, '&quot;');
                const posterUrl = cover || '';
                const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23764ba2\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'40\'%3E📦%3C/text%3E%3C/svg%3E';

                if (currentView === 'list') {
                    return `<div class="movie-card collection-card" ${_physicalItemClick(item, navIds)} style="cursor:pointer;">
                        <div class="movie-poster-container">
                            <img src="${posterUrl || placeholderSvg}" alt="${safeTitle}" class="movie-poster">
                        </div>
                        <div class="movie-info">
                            <h3 class="movie-title">📦 ${safeTitle}</h3>
                            <div class="movie-meta">
                                <span>Box Set</span>
                                <span>${item.container_movie_count || 0} films</span>
                            </div>
                        </div>
                        <div class="movie-actions">
                            <button class="btn-icon" ${_physicalItemClick(item, navIds)} title="Details">👁️</button>
                        </div>
                    </div>`;
                } else {
                    return `<div class="movie-card" ${_physicalItemClick(item, navIds)} style="cursor:pointer;">
                        <div class="movie-poster-container">
                            <img src="${posterUrl || placeholderSvg}" alt="${safeTitle}" class="movie-poster">
                        </div>
                        <div class="hover-overlay">
                            <div class="hover-title">${safeTitle}</div>
                            <div class="hover-meta"><span>Box Set · ${item.container_movie_count || 0} films</span></div>
                        </div>
                        <div class="movie-info">
                            <h3 class="movie-title">📦 ${safeTitle}</h3>
                        </div>
                    </div>`;
                }
            }

            // Regular movie items
            const title = item.display_title || item.title || 'Unknown';
            const safeTitle = title.replace(/"/g, '&quot;');
            const certColor = item.certification ? getCertColor(item.certification) : '#666';
            const isTV = item.media_type === 'tv';
            const mediaIcon = isTV ? '📺' : '🎬';
            const posterUrl = item.edition_cover_url || item.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
            const runtimeFormatted = formatRuntime(item.runtime);

            if (currentView === 'list') {
                return `<div class="movie-card collection-card" ${_physicalItemClick(item, navIds)} style="cursor:pointer;">
                    <div class="movie-poster-container">
                        <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    </div>
                    <div class="movie-info">
                        <h3 class="movie-title">${mediaIcon} ${safeTitle}</h3>
                        <div class="movie-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.certification ? `<span class="cert-badge" style="--cert-color: ${certColor};">${item.certification}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${Number(item.rating).toFixed(1)}</span>` : ''}
                            ${runtimeFormatted ? `<span>${runtimeFormatted}</span>` : ''}
                            ${item.format ? `<span>${item.format}</span>` : ''}
                        </div>
                    </div>
                    <div class="movie-actions">
                        <button class="btn-icon" ${_physicalItemClick(item, navIds)} title="Details">👁️</button>
                    </div>
                </div>`;
            } else {
                const genreEmojis = getGenreEmojis(item.genre);
                return `<div class="movie-card" ${_physicalItemClick(item, navIds)} style="cursor:pointer;">
                    <div class="movie-poster-container">
                        <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    </div>
                    <div class="hover-overlay">
                        <div class="hover-title">${safeTitle}</div>
                        <div class="hover-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.certification ? `<span class="cert-badge-hover" style="--cert-color: ${certColor};">${item.certification}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${Number(item.rating).toFixed(1)}</span>` : ''}
                            ${runtimeFormatted ? `<span>${runtimeFormatted}</span>` : ''}
                        </div>
                        ${genreEmojis ? `<div class="genre-emojis">${genreEmojis}</div>` : ''}
                        ${item.director ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">🎬 ${item.director}</div>` : ''}
                    </div>
                    <div class="movie-info">
                        <h3 class="movie-title">${mediaIcon} ${safeTitle}</h3>
                    </div>
                </div>`;
            }
        }).join('') + `</div>`;
    }

    function setView(viewType) {
        currentView = viewType;

        // Update buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === viewType) {
                btn.classList.add('active');
            }
        });

        // Update all four grids
        const collectionGrid = document.getElementById('collectionGrid');
        const wishlistGrid = document.getElementById('wishlistGrid');
        const familyCollectionGrid = document.getElementById('familyCollectionGrid');
        const groupWishlistGrid = document.getElementById('groupWishlistGrid');

        [collectionGrid, wishlistGrid, familyCollectionGrid, groupWishlistGrid].forEach(grid => {
            if (!grid) return;

            // Remove all view classes
            grid.classList.remove('grid-view', 'compact-view', 'list-view', 'gallery-view');

            // Add the selected view class
            if (viewType === 'list') {
                grid.classList.add('list-view');
            } else if (viewType === 'compact') {
                grid.classList.add('compact-view');
            } else if (viewType === 'gallery') {
                grid.classList.add('gallery-view');
            } else {
                grid.classList.add('grid-view');
            }
        });

        // Update box sets grid view class
        const boxSetsGrid = document.getElementById('boxSetsList');
        if (boxSetsGrid) {
            const cls = viewType === 'list' ? 'list-view' : viewType === 'compact' ? 'compact-view' : viewType === 'gallery' ? 'gallery-view' : 'grid-view';
            boxSetsGrid.className = 'movie-grid ' + cls;
        }

        // Trigger re-renders to update HTML structure based on view
        renderCollection();
        renderWishlist();

        // Re-render physical media if cached
        if (physicalMediaCache.length > 0) {
            renderPhysicalMedia();
        }

        // Re-render box sets
        if (currentCollectionSubview === 'boxsets') {
            loadBoxSets();
        }

        // Re-render family collection if a group is selected
        if (currentGroupId && window.familyCollectionData) {
            renderFamilyCollection(window.familyCollectionData);
        }

        // Re-render group wishlist if data exists
        if (window.currentGroupWishlist) {
            renderGroupWishlist(window.currentGroupWishlist);
        }

        // Save preference
        settings.defaultView = viewType;
        saveSettings();
    }
    
        function updateBadges() {
    const collectionCount = collection.length;
    const wishlistCount = wishlist.length;

    // Update section header based on active sub-view
    const collectionHeader = document.getElementById('collectionHeader');
    if (collectionHeader) {
        if (currentCollectionSubview === 'physical') {
            collectionHeader.textContent = 'Physical Media';
        } else if (currentCollectionSubview === 'wishlist') {
            collectionHeader.textContent = `Your Wishlist (${wishlistCount})`;
        } else if (currentCollectionSubview === 'boxsets') {
            collectionHeader.textContent = 'Box Sets';
        } else if (currentCollectionSubview === 'shelfview') {
            collectionHeader.textContent = 'Shelf View';
        } else {
            collectionHeader.textContent = `Your Collection (${collectionCount})`;
        }
    }
}
    
    function showToast(message, type = 'info') {
        const toast = document.getElementById('statusToast');
        if (!toast) return;

        toast.className = `toast toast-${type} active`;
        toast.textContent = message;

        if (toast._timer) clearTimeout(toast._timer);

        // Scale timeout with message length: min 3 s, max 8 s
        const timeout = Math.min(8000, Math.max(3000, message.length * 65));
        toast._timer = setTimeout(() => {
            toast.classList.remove('active');
        }, timeout);
    }
    
    // ========================================
    // SETTINGS
    // ========================================
    
    function loadSettings() {
        try {
            const saved = localStorage.getItem('cineshelf_settings');
            settings = saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Failed to load settings:', error);
            settings = {};
        }
        // OpenAI key is now configured server-side in config/secrets.php
    }

    function saveSettings() {
        try {
            localStorage.setItem('cineshelf_settings', JSON.stringify(settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    
    // ── Theme system ────────────────────────────────────────────────
    // ── Bottom nav & drawer ─────────────────────────────────────────────

    // All available nav items. 'wishlist' maps to collection+subview switch.
    const NAV_ITEMS = {
        collection: { icon: '📚', label: 'Collection',   tab: 'collection' },
        wishlist:   { icon: '❤️',  label: 'Wishlist',     tab: 'wishlist'   },
        add:        { icon: '➕',  label: 'Add',          tab: 'add', center: true },
        shelves:    { icon: '🗂️', label: 'Shelves',      tab: 'shelves'    },
        groups:     { icon: '👥',  label: 'Groups',       tab: 'groups'     },
        calendar:   { icon: '📅',  label: 'Calendar',     tab: 'calendar'   },
        trivia:     { icon: '🎮',  label: 'Trivia',       tab: 'trivia'     },
        settings:   { icon: '⚙️',  label: 'Settings',     tab: 'settings'   },
    };

    const DEFAULT_BOTTOM_NAV = ['collection', 'add', 'wishlist', 'shelves'];

    function buildBottomNav() {
        const nav = document.getElementById('bottomNav');
        if (!nav) return;
        const items = settings.bottomNavItems || DEFAULT_BOTTOM_NAV;
        nav.innerHTML = '';

        items.forEach(key => {
            const def = NAV_ITEMS[key];
            if (!def) return;
            const btn = document.createElement('button');
            btn.className = 'bottom-nav-item' + (def.center ? ' bottom-nav-center' : '');
            btn.dataset.navTab = key;
            btn.onclick = () => switchTab(def.tab);
            btn.innerHTML = `<span class="bnav-icon">${def.icon}</span><span class="bnav-label">${def.label}</span>`;
            nav.appendChild(btn);
        });

        // Always-present More button
        const moreBtn = document.createElement('button');
        moreBtn.className = 'bottom-nav-item bottom-nav-more';
        moreBtn.setAttribute('aria-label', 'More');
        moreBtn.onclick = openDrawer;
        moreBtn.innerHTML = '<span class="bnav-icon">☰</span><span class="bnav-label">More</span>';
        nav.appendChild(moreBtn);

        _syncBottomNavActive(currentTab || 'collection');
    }

    function _syncBottomNavActive(tabName) {
        document.querySelectorAll('.bottom-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.navTab === tabName);
        });
    }

    function _syncDrawerActive(tabName) {
        document.querySelectorAll('.drawer-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.drawerTab === tabName);
        });
    }

    function openDrawer() {
        document.getElementById('sideDrawer').classList.add('open');
        document.getElementById('drawerBackdrop').classList.add('open');
        document.body.classList.add('drawer-open');
    }

    function closeDrawer() {
        document.getElementById('sideDrawer').classList.remove('open');
        document.getElementById('drawerBackdrop').classList.remove('open');
        document.body.classList.remove('drawer-open');
    }

    function renderNavPicker() {
        const container = document.getElementById('navPicker');
        if (!container) return;
        const current = settings.bottomNavItems || DEFAULT_BOTTOM_NAV;
        container.innerHTML = Object.entries(NAV_ITEMS).map(([key, def]) => {
            const active = current.includes(key);
            return `<button class="nav-picker-chip ${active ? 'active' : ''}"
                        data-nav-key="${key}"
                        onclick="App.toggleNavPickerItem('${key}')">
                        ${def.icon} ${def.label}
                    </button>`;
        }).join('');
        const count = document.getElementById('navPickerCount');
        if (count) count.textContent = current.length;
    }

    function toggleNavPickerItem(key) {
        const current = [...(settings.bottomNavItems || DEFAULT_BOTTOM_NAV)];
        const idx = current.indexOf(key);
        if (idx >= 0) {
            if (current.length <= 1) return; // always keep at least 1
            current.splice(idx, 1);
        } else {
            if (current.length >= 4) {
                showToast('Maximum 4 items in the bottom bar', 'error');
                return;
            }
            current.push(key);
        }
        settings.bottomNavItems = current;
        saveSettings();
        buildBottomNav();
        renderNavPicker();
    }

    function applyTheme(name) {
        const theme = name || 'midnight';
        document.documentElement.setAttribute('data-theme', theme === 'midnight' ? '' : theme);
        settings.theme = theme;
        saveSettings();
        // Update swatch active state
        document.querySelectorAll('.theme-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.theme === theme);
        });
        showToast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, 'info');
    }

    function toggleThemeMode() {
        const isLight = document.documentElement.getAttribute('data-theme-mode') === 'light';
        const nextMode = isLight ? 'dark' : 'light';
        if (nextMode === 'light') {
            document.documentElement.setAttribute('data-theme-mode', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme-mode');
        }
        settings.themeMode = nextMode;
        saveSettings();
        const btn = document.getElementById('themeModeToggle');
        if (btn) btn.textContent = nextMode === 'light' ? '☀️' : '🌙';
        showToast(`${nextMode === 'light' ? 'Light' : 'Dark'} mode`, 'info');
    }

    // ── Sticky header + sticky bar height measurement ──────────────
    function updateHeaderHeight() {
        const h = document.querySelector('.header');
        if (h) {
            document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
        }
    }

    function updateStickyBarHeight() {
        const bar = document.querySelector('.collection-sticky-bar');
        if (bar) {
            document.documentElement.style.setProperty('--sticky-bar-h', bar.offsetHeight + 'px');
        }
    }

    // ── Toolbar quick-search ─────────────────────────────────────────
    function onQuickSearch(val) {
        // Sync with the filter drawer's search field
        const fs = document.getElementById('filterSearch');
        if (fs) fs.value = val;
        onFilterChange('search', val);
    }

    // ── Floating search bubble ────────────────────────────────────────
    const _searchPlaceholders = {
        movies:      'Search movies…',
        wishlist:    'Search wishlist…',
        physical:    'Search physical media…',
        boxsets:     'Search box sets…',
    };

    function toggleFloatingSearch() {
        const bar = document.getElementById('floatingSearchBar');
        const btn = document.getElementById('searchFabBtn');
        if (!bar) return;
        const opening = !bar.classList.contains('open');
        if (opening) {
            bar.classList.add('open');
            bar.setAttribute('aria-hidden', 'false');
            if (btn) btn.classList.add('active');
            const inp = document.getElementById('floatingSearchInput');
            if (inp) {
                inp.placeholder = _searchPlaceholders[currentCollectionSubview] || 'Search…';
                requestAnimationFrame(() => inp.focus());
            }
        } else {
            closeFloatingSearch();
        }
    }

    function closeFloatingSearch() {
        const bar = document.getElementById('floatingSearchBar');
        const btn = document.getElementById('searchFabBtn');
        if (bar) { bar.classList.remove('open'); bar.setAttribute('aria-hidden', 'true'); }
        if (btn) btn.classList.remove('active');
        const inp = document.getElementById('floatingSearchInput');
        if (inp) inp.value = '';
        // Clear active search in current subview
        onFloatingSearch('');
    }

    function onFloatingSearch(val) {
        const subview = currentCollectionSubview;
        if (subview === 'movies') {
            onQuickSearch(val);
        } else if (subview === 'wishlist') {
            const inp = document.getElementById('wishlistSearch');
            if (inp) inp.value = val;
            filterWishlist();
        } else if (subview === 'physical') {
            filterPhysicalMedia(val);
        } else if (subview === 'boxsets') {
            // Basic box set title filter
            const grid = document.getElementById('boxSetsList');
            if (grid) {
                const q = val.toLowerCase().trim();
                grid.querySelectorAll('.movie-card').forEach(card => {
                    const title = (card.querySelector('.movie-title')?.textContent || '').toLowerCase();
                    card.style.display = (!q || title.includes(q)) ? '' : 'none';
                });
            }
        }
    }

    function saveSetting(key, value) {
    settings[key] = value;
    saveSettings();
    showToast('Setting saved', 'success');

    // ✅ FIX: If defaultSort changed, update the Collection dropdown too
    if (key === 'defaultSort') {
        const sortDropdown = document.getElementById('sortBy');
        if (sortDropdown) {
            sortDropdown.value = value;
        }
        // Apply the new sort to current collection
        if (currentTab === 'collection') {
            sortMovies('collection', value);
        } else if (currentTab === 'wishlist') {
            sortMovies('wishlist', value);
        }
    }
}
    
    function updateBrandSize(key, value) {
        const numVal = parseInt(value, 10);
        if (key === 'logoSize') {
            document.documentElement.style.setProperty('--logo-icon-size', numVal + 'px');
            const label = document.getElementById('logoSizeValue');
            if (label) label.textContent = numVal + 'px';
            settings.logoIconSize = numVal;
        } else if (key === 'brandSize') {
            const rem = (numVal / 10).toFixed(1);
            document.documentElement.style.setProperty('--logo-text-size', rem + 'rem');
            const label = document.getElementById('brandSizeValue');
            if (label) label.textContent = rem + 'rem';
            settings.logoTextSize = numVal;
        }
        saveSettings();
    }

    function loadBrandSettings() {
        if (settings.logoIconSize) {
            document.documentElement.style.setProperty('--logo-icon-size', settings.logoIconSize + 'px');
            const slider = document.getElementById('settingLogoSize');
            const label = document.getElementById('logoSizeValue');
            if (slider) slider.value = settings.logoIconSize;
            if (label) label.textContent = settings.logoIconSize + 'px';
        }
        if (settings.logoTextSize) {
            const rem = (settings.logoTextSize / 10).toFixed(1);
            document.documentElement.style.setProperty('--logo-text-size', rem + 'rem');
            const slider = document.getElementById('settingBrandSize');
            const label = document.getElementById('brandSizeValue');
            if (slider) slider.value = settings.logoTextSize;
            if (label) label.textContent = rem + 'rem';
        }
    }

    // Legacy function - no longer needed with OAuth
    // Users should sign out and sign in with a different account
    function switchUser() {
        console.warn('switchUser() is deprecated with OAuth authentication');
        if (confirm('To switch accounts, you need to sign out and sign in again. Sign out now?')) {
            Auth.logout();
        }
    }
    
    async function updateDisplayName() {
        const displayName = document.getElementById('settingDisplayName').value.trim();

        if (!displayName) {
            showToast('Display name cannot be empty', 'error');
            return;
        }

        try {
            await apiCall('update_profile', { display_name: displayName });
            showToast('Display name updated successfully!', 'success');

            // Update the Auth module's current user (requires reload to re-verify)
            setTimeout(() => location.reload(), 1000);
        } catch (error) {
            showToast('Failed to update display name', 'error');
        }
    }

    // ================================================
    // PUBLIC COLLECTION SETTINGS
    // ================================================

    function onPublicToggleChange() {
        const enabled = document.getElementById('publicCollectionToggle')?.checked;
        const row = document.getElementById('publicHandleRow');
        if (row) row.style.display = enabled ? 'block' : 'none';
    }

    async function savePublicSettings() {
        const enabled = document.getElementById('publicCollectionToggle')?.checked ? 1 : 0;
        const handle = document.getElementById('publicHandleInput')?.value.trim();

        if (enabled && !handle) {
            showToast('Enter a handle to enable your public link', 'error');
            return;
        }

        try {
            const result = await apiCall('update_public_settings', {
                public_collection: enabled,
                public_username: handle || ''
            });
            if (result.public_username) {
                _showShareUrl(result.public_username);
                showToast('Public collection settings saved!', 'success');
            } else {
                document.getElementById('publicShareUrl').style.display = 'none';
                showToast('Public collection disabled', 'success');
            }
        } catch (e) {
            // error toast already shown by apiCall
        }
    }

    function _showShareUrl(handle) {
        const base = `${window.location.origin}/share/${handle}`;
        const urlDiv = document.getElementById('publicShareUrl');
        const link = document.getElementById('publicShareLink');
        if (urlDiv && link) {
            link.href = base;
            link.textContent = base;
            urlDiv.style.display = 'block';
        }
    }

    function copyShareUrl() {
        const link = document.getElementById('publicShareLink');
        if (!link) return;
        navigator.clipboard.writeText(link.href)
            .then(() => showToast('Link copied to clipboard!', 'success'))
            .catch(() => {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = link.href;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('Link copied!', 'success');
            });
    }

    function initPublicSettings(authUser) {
        const toggle = document.getElementById('publicCollectionToggle');
        const handleInput = document.getElementById('publicHandleInput');
        if (!toggle) return;

        toggle.checked = !!authUser.public_collection;
        if (authUser.public_username) {
            if (handleInput) handleInput.value = authUser.public_username;
        }
        onPublicToggleChange();
        if (authUser.public_collection && authUser.public_username) {
            _showShareUrl(authUser.public_username);
        }
    }

    // ================================================
    // ONBOARDING MODAL
    // ================================================

    function closeOnboarding() {
        document.getElementById('onboardingModal')?.classList.remove('active');
        apiCall('mark_welcome_seen', {}).catch(() => {});
    }

    function _maybeShowOnboarding(authUser) {
        if (!authUser.has_seen_welcome) {
            setTimeout(() => {
                document.getElementById('onboardingModal')?.classList.add('active');
            }, 1200);
        }
    }

    // ================================================
    // UMDB DEEP-LINK HANDLER
    // Handles ?action=add&tmdb_id=123&title=...&year=...
    // Linked from UMDB movie/release detail pages
    // ================================================

    function _handleDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');

        if (action === 'add') {
            const tmdbId  = params.get('tmdb_id');
            const title   = params.get('title') || '';
            const year    = params.get('year')  || '';

            // Clean up URL immediately
            history.replaceState({}, '', window.location.pathname);

            // Switch to the Add tab, pre-fill the search box, and run the search
            setTimeout(async () => {
                switchTab('add');
                const searchInput = document.getElementById('movieSearch');
                if (!searchInput) return;

                // Use tmdb_id directly if available (most precise), else fall back to title + year
                const query = tmdbId ? (title || tmdbId) : (year ? `${title} ${year}` : title);
                searchInput.value = query;

                if (query) {
                    // If we have a tmdb_id, search and auto-select the exact match
                    if (tmdbId) {
                        try {
                            // Run search, then auto-click the card whose data-movie-id matches
                            await searchMovies();
                            const card = document.querySelector(`[data-movie-id="${tmdbId}"]`);
                            if (card) { card.click(); return; }
                        } catch (_) {}
                    }
                    // Fallback: just run the search and let the user pick
                    await searchMovies();
                }
            }, 600);
        }
    }

    /**
     * PWA Install — triggered by Android/Chrome install button
     */
    async function installPWA() {
        const prompt = window._pwaInstallPrompt;
        if (!prompt) {
            showToast('Install prompt not available. Try from Chrome on Android.', 'info');
            return;
        }
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
            window._pwaInstallPrompt = null;
            showToast('CineShelf installed! 🎉', 'success');
        }
    }

    /**
     * Update the Install App section visibility based on install state
     * Called when the Settings tab is opened
     */
    function initPWAInstallUI() {
        const androidRow     = document.getElementById('pwaInstallAndroidRow');
        const installedRow   = document.getElementById('pwaAlreadyInstalledRow');
        const section        = document.getElementById('pwaInstallSection');

        if (!section) return;

        if (window._pwaIsInstalled) {
            // Already running as installed PWA — show badge, hide everything else
            if (androidRow)   androidRow.style.display   = 'none';
            if (installedRow) installedRow.style.display = '';
            return;
        }

        if (installedRow) installedRow.style.display = 'none';

        // Show Android button only if the browser fired beforeinstallprompt
        if (androidRow) {
            androidRow.style.display = window._pwaInstallPrompt ? '' : 'none';
        }
    }

    async function showStats() {
        const modal = document.getElementById('statsModal');
        const body  = document.getElementById('statsModalBody');
        if (!modal || !body) return;
        modal.classList.add('active');
        body.innerHTML = '<p style="color:#aaa;text-align:center;padding:2rem;">Loading…</p>';

        try {
            const s = await apiCall('get_stats');
            const esc = v => String(v||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const formatIcons = { 'DVD':'💿', 'Blu-ray':'🔵', '4K UHD':'✨', '4K Ultra HD':'✨', 'VHS':'📼', 'LaserDisc':'🟡', 'Digital':'☁️' };

            // ── Year chart ─────────────────────────────────────────────────
            const years = s.viewings_by_year || [];
            const maxYearCount = Math.max(...years.map(y => parseInt(y.count)), 1);
            const yearBars = years.length > 0 ? `
                <div class="stats-section">
                    <h4 class="stats-section-title">📅 Viewings by Year</h4>
                    <div class="stats-bars">
                        ${years.map(y => `
                            <div class="stats-bar-row">
                                <span class="stats-bar-label">${esc(y.year)}</span>
                                <div class="stats-bar-track">
                                    <div class="stats-bar-fill" style="width:${Math.round(parseInt(y.count)/maxYearCount*100)}%"></div>
                                </div>
                                <span class="stats-bar-count">${y.count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';

            // ── Format chart ───────────────────────────────────────────────
            const formats = s.by_format || [];
            const maxFmtCount = Math.max(...formats.map(f => parseInt(f.count)), 1);
            const fmtBars = formats.length > 0 ? `
                <div class="stats-section">
                    <h4 class="stats-section-title">📀 Collection by Format</h4>
                    <div class="stats-bars">
                        ${formats.map(f => `
                            <div class="stats-bar-row">
                                <span class="stats-bar-label">${formatIcons[f.format]||'📀'} ${esc(f.format)}</span>
                                <div class="stats-bar-track">
                                    <div class="stats-bar-fill" style="width:${Math.round(parseInt(f.count)/maxFmtCount*100)}%"></div>
                                </div>
                                <span class="stats-bar-count">${f.count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';

            // ── Top watched ────────────────────────────────────────────────
            const top = s.top_watched || [];
            const topWatched = top.length > 0 ? `
                <div class="stats-section">
                    <h4 class="stats-section-title">🔁 Most Rewatched</h4>
                    <div class="stats-top-list">
                        ${top.map((m, i) => `
                            <div class="stats-top-item">
                                <span class="stats-top-rank">${i+1}</span>
                                <span class="stats-top-title">${esc(m.display_title||m.title)}${m.year ? ` <span style="color:#666">(${m.year})</span>` : ''}</span>
                                <span class="stats-top-count">${m.views}×</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';

            body.innerHTML = `
                <div class="stats-overview">
                    <div class="stats-kpi">
                        <span class="stats-kpi-value">${s.total_copies || 0}</span>
                        <span class="stats-kpi-label">Physical Copies</span>
                    </div>
                    <div class="stats-kpi">
                        <span class="stats-kpi-value">${s.unique_movies || 0}</span>
                        <span class="stats-kpi-label">Unique Titles</span>
                    </div>
                    <div class="stats-kpi">
                        <span class="stats-kpi-value">${s.viewings_total || 0}</span>
                        <span class="stats-kpi-label">Viewings Logged</span>
                    </div>
                    <div class="stats-kpi">
                        <span class="stats-kpi-value">${s.avg_rating ? '★ ' + s.avg_rating : '—'}</span>
                        <span class="stats-kpi-label">Avg Rating</span>
                    </div>
                    <div class="stats-kpi">
                        <span class="stats-kpi-value">${s.longest_streak || 0}</span>
                        <span class="stats-kpi-label">Day Streak 🔥</span>
                    </div>
                    <div class="stats-kpi">
                        <span class="stats-kpi-value">${s.wishlist_count || 0}</span>
                        <span class="stats-kpi-label">On Wishlist</span>
                    </div>
                </div>
                ${yearBars}
                ${fmtBars}
                ${topWatched}
            `;
        } catch (error) {
            console.error('Failed to load stats:', error);
            document.getElementById('statsModalBody').innerHTML = '<p style="color:#f87;padding:1rem;">Failed to load stats.</p>';
        }
    }
    
    function exportData() {
        // Build CSV header
        const csvHeader = 'title,year,tmdb_id,status,format,edition,region,condition,notes,barcode\n';

        // Build CSV rows from collection and wishlist
        const csvRows = [];

        // Export collection items
        collection.forEach(group => {
            group.copies.forEach(copy => {
                const movie = group.movie;
                const row = [
                    escapeCsvValue(movie.title),
                    movie.year || '',
                    movie.tmdb_id || '',
                    'collection',
                    escapeCsvValue(copy.format || 'DVD'),
                    escapeCsvValue(copy.edition || ''),
                    escapeCsvValue(copy.region || ''),
                    escapeCsvValue(copy.condition || 'Good'),
                    escapeCsvValue(copy.notes || ''),
                    escapeCsvValue(copy.barcode || '')
                ];
                csvRows.push(row.join(','));
            });
        });

        // Export wishlist items
        wishlist.forEach(movie => {
            const row = [
                escapeCsvValue(movie.title),
                movie.year || '',
                movie.tmdb_id || '',
                'wishlist',
                '', // no format for wishlist
                '', // no edition
                '', // no region
                '', // no condition
                '', // no notes
                ''  // no barcode
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = csvHeader + csvRows.join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cineshelf_${currentUser}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Exported ${csvRows.length} items to CSV!`, 'success');
    }

    function escapeCsvValue(value) {
        if (!value) return '';
        // Convert to string and escape quotes
        const stringValue = String(value);
        // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    }

    // Helper function to parse CSV line respecting quoted fields
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                // Handle escaped quotes ("")
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Push last field
        result.push(current.trim());

        return result;
    }

    async function importCSV(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Reset file input
        event.target.value = '';

        if (!file.name.endsWith('.csv')) {
            showToast('Please upload a CSV file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const text = e.target.result;
                const lines = text.split('\n').filter(line => line.trim());

                if (lines.length < 2) {
                    showToast('CSV file is empty or invalid', 'error');
                    return;
                }

                // Parse header using proper CSV parser
                const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

                // Find column indices
                const titleIndex = header.findIndex(h => h === 'title' || h === 'name' || h === 'movie');
                const yearIndex = header.findIndex(h => h === 'year' || h === 'release_year');
                const tmdbIdIndex = header.findIndex(h => h === 'tmdb_id' || h === 'id');
                const statusIndex = header.findIndex(h => h === 'status' || h === 'type');
                const formatIndex = header.findIndex(h => h === 'format');
                const editionIndex = header.findIndex(h => h === 'edition');
                const regionIndex = header.findIndex(h => h === 'region');
                const conditionIndex = header.findIndex(h => h === 'condition');
                const notesIndex = header.findIndex(h => h === 'notes');
                const barcodeIndex = header.findIndex(h => h === 'barcode');

                if (titleIndex === -1) {
                    showToast('CSV must have a "title" or "name" column', 'error');
                    return;
                }

                const movies = [];
                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    if (values[titleIndex] && values[titleIndex].trim()) {
                        const cleanValue = (index) => {
                            if (index === -1 || !values[index]) return null;
                            return values[index].replace(/^["']|["']$/g, '').trim() || null;
                        };

                        movies.push({
                            title: cleanValue(titleIndex),
                            year: cleanValue(yearIndex),
                            tmdb_id: cleanValue(tmdbIdIndex),
                            status: cleanValue(statusIndex) || 'collection',
                            format: cleanValue(formatIndex) || 'DVD',
                            edition: cleanValue(editionIndex),
                            region: cleanValue(regionIndex),
                            condition: cleanValue(conditionIndex) || 'Good',
                            notes: cleanValue(notesIndex),
                            barcode: cleanValue(barcodeIndex)
                        });
                    }
                }

                if (movies.length === 0) {
                    showToast('No valid movies found in CSV', 'error');
                    return;
                }

                // Confirm import
                const confirmMsg = `Import ${movies.length} movies from CSV?\n\n` +
                    `✅ Movies with TMDB IDs → Added directly to Collection/Wishlist\n` +
                    `❓ Movies without TMDB IDs → Sent to Resolve for manual matching\n\n` +
                    `This will be quick - no automatic searching!`;

                if (!confirm(confirmMsg)) {
                    return;
                }

                showToast(`Importing ${movies.length} movies...`, 'info');
                let addedToCollection = 0;
                let addedToWishlist = 0;
                let addedToUnresolved = 0;
                let skipped = 0;
                let failed = 0;

                for (let i = 0; i < movies.length; i++) {
                    const movie = movies[i];
                    try {
                        // If TMDB ID is provided, add directly
                        if (movie.tmdb_id && !movie.tmdb_id.startsWith('unresolved_')) {
                            // Check if already in collection
                            const alreadyExists = collection.some(g => g.movie.tmdb_id === movie.tmdb_id);
                            if (alreadyExists) {
                                console.log(`Skipped "${movie.title}" - already in collection`);
                                skipped++;
                            } else {
                                // Add to collection or wishlist based on status
                                if (movie.status === 'wishlist') {
                                    await apiCall('add_wishlist', {
                                        tmdb_id: movie.tmdb_id
                                    });
                                    addedToWishlist++;
                                } else {
                                    await apiCall('add_copy', {
                                        tmdb_id: movie.tmdb_id,
                                        format: movie.format,
                                        edition: movie.edition,
                                        region: movie.region,
                                        condition: movie.condition,
                                        notes: movie.notes,
                                        barcode: movie.barcode,
                                        cert_region: settings.certRegion || 'US'
                                    });
                                    addedToCollection++;
                                }
                                console.log(`Added "${movie.title}" with TMDB ID ${movie.tmdb_id}`);
                            }
                        } else {
                            // No TMDB ID - send directly to unresolved for manual matching
                            await apiCall('add_unresolved', { title: movie.title });
                            addedToUnresolved++;
                            console.log(`Added "${movie.title}" to unresolved - no TMDB ID (manual matching required)`);
                        }

                        // Show progress every 50 movies
                        if ((i + 1) % 50 === 0 || i === movies.length - 1) {
                            showToast(`Progress: ${i + 1}/${movies.length} movies processed...`, 'info');
                        }
                    } catch (error) {
                        console.error(`Failed to import "${movie.title}":`, error);
                        failed++;
                    }
                }

                // Reload all data
                await loadCollection();
                await loadWishlist();
                await loadUnresolved();

                // Show summary
                const summary = `Import complete!\n\n` +
                    `✅ Added to Collection: ${addedToCollection}\n` +
                    `📝 Added to Wishlist: ${addedToWishlist}\n` +
                    `❓ Sent to Resolve: ${addedToUnresolved}\n` +
                    `⏭️ Skipped (duplicates): ${skipped}\n` +
                    `❌ Failed: ${failed}` +
                    (addedToUnresolved > 0 ? `\n\n💡 Tip: Go to Resolve tab to manually match ${addedToUnresolved} movies` : '');

                showToast(summary, 'success');

            } catch (error) {
                console.error('CSV import error:', error);
                showToast('Failed to parse CSV file', 'error');
            }
        };

        reader.onerror = function() {
            showToast('Failed to read file', 'error');
        };

        reader.readAsText(file);
    }

    // ========================================
    // RESOLVE FUNCTIONS
    // ========================================
    
    let unresolvedMovies = [];
    let currentResolvingMovie = null;
    let seqMode = false;
    let seqMovies = [];
    let seqIndex = 0;
    
    async function loadUnresolved() {
        try {
            const data = await apiCall('list_unresolved');
            unresolvedMovies = data || [];
            
            const count = unresolvedMovies.length;
            // Update badge (just number)
const badgeEl = document.getElementById('resolveCount');
if (badgeEl) {
    badgeEl.textContent = count;
}
// Update header
const headerEl = document.getElementById('resolveHeader');
if (headerEl) {
    headerEl.textContent = `🔍 Resolve Unmatched Movies (${count})`;
}

// Update description (full text)
const descEl = document.getElementById('resolveDescription');
if (descEl) {
    if (count === 0) {
        descEl.textContent = 'All movies are matched! ✅';
    } else {
        descEl.textContent = `${count} unmatched movie${count !== 1 ? 's' : ''} need${count !== 1 ? '' : 's'} your attention`;
    }
}
// Show/hide Match All button
const matchAllBtn = document.getElementById('matchAllBtn');
if (matchAllBtn) matchAllBtn.style.display = count > 0 ? '' : 'none';
            
            renderUnresolved();
            
        } catch (error) {
            console.error('Failed to load unresolved movies:', error);
            showToast('Error loading unresolved movies', 'error');
        }
    }
    
function renderUnresolved() {
    const list = document.getElementById('unresolvedList');
    const empty = document.getElementById('emptyUnresolved');

    if (!list || !empty) return;

    if (unresolvedMovies.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';

    // Clear and rebuild
    list.innerHTML = '';

    unresolvedMovies.forEach(movie => {
        const safeTitle = (movie.title || 'Unknown').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const item = document.createElement('div');
        item.className = 'unresolved-item';
        item.dataset.movieId = movie.movie_id;
        item.dataset.movieTitle = movie.title || 'Unknown';

        item.innerHTML = `
            <div class="unresolved-icon">❓</div>
            <div class="unresolved-details">
                <div class="unresolved-title">${safeTitle}</div>
                <div class="unresolved-meta">
                    <span class="unresolved-status">⚠️ Unmatched</span>
                    ${movie.copy_count > 1 ? `<span class="unresolved-copies">${movie.copy_count} copies</span>` : ''}
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.25rem; flex-shrink: 0;">
                <button class="btn-resolve" data-movie-id="${movie.movie_id}" data-title="${safeTitle}" style="padding: 0.3rem 0.65rem; font-size: 0.78rem; white-space: nowrap;">
                    🔍 Match
                </button>
                <button class="btn-resolve btn-delete-unresolved" data-movie-id="${movie.movie_id}" data-title="${safeTitle}" style="background: rgba(239,68,68,0.2); color: #ef4444; padding: 0.3rem 0.65rem; font-size: 0.78rem; white-space: nowrap;">
                    🗑️ Delete
                </button>
            </div>
        `;

        list.appendChild(item);
    });

    // Add event listeners to all resolve buttons
    list.querySelectorAll('.btn-resolve:not(.btn-delete-unresolved)').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const movieId = parseInt(e.target.dataset.movieId);
            const title = e.target.dataset.title;
            openResolveModal(movieId, title);
        });
    });

    // Add event listeners to all delete buttons
    list.querySelectorAll('.btn-delete-unresolved').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const movieId = parseInt(e.target.dataset.movieId);
            const title = e.target.dataset.title;
            deleteUnresolved(movieId, title);
        });
    });
}

async function deleteUnresolved(movieId, title) {
    if (!confirm(`Delete "${title}" from your collection? This will remove all copies of this unmatched entry.`)) return;

    try {
        await apiCall('delete_unresolved', { movie_id: movieId });
        showToast(`"${title}" deleted`, 'success');

        // Refresh the unresolved list
        await loadUnresolved();

        // Refresh collection data
        try {
            const data = await apiCall('list_collection');
            const grouped = {};
            (data || []).forEach(item => {
                if (!grouped[item.movie_id]) {
                    grouped[item.movie_id] = { movie: item, copies: [] };
                }
                grouped[item.movie_id].copies.push(item);
            });
            collection = Object.values(grouped);
            originalCollection = [...collection];
        } catch (e) {
            console.error('Failed to refresh collection:', e);
        }
    } catch (error) {
        console.error('Failed to delete unresolved movie:', error);
        showToast('Failed to delete entry', 'error');
    }
}

function toggleFilters() {
    const controls = document.getElementById('filterControls');
    const btn = document.getElementById('filterToggleBtn');
    const bar = document.getElementById('filterBar');

    if (controls.style.display === 'none') {
        controls.style.display = 'grid';
        if (bar) bar.classList.add('filter-open');
        if (btn) btn.classList.add('active');
        updateFilterUI(); // Populate dropdowns
        _restoreFilterUI(); // Restore previously-selected values
    } else {
        controls.style.display = 'none';
        if (bar) bar.classList.remove('filter-open');
        if (btn) btn.classList.remove('active');
    }
}

function onFilterChange(filterType, value) {
    if (filterType === 'yearMin' || filterType === 'yearMax') {
        currentFilters[filterType] = value ? parseInt(value) : null;
    } else {
        currentFilters[filterType] = value;
    }
    _saveFilters();

    const sortBy = document.getElementById('sortBySelect').value || 'title';
    sortMoviesEnhanced(sortBy);
    updateActiveFilters();
}

function updateActiveFilters() {
    const activeFiltersDiv = document.getElementById('activeFilters');
    const tagsContainer = activeFiltersDiv.querySelector('.active-filter-tags');

    const activeTags = [];

    if (currentFilters.search && currentFilters.search.trim()) {
        activeTags.push({
            type: 'search',
            label: `Search: "${currentFilters.search}"`,
            value: currentFilters.search
        });
    }

    if (currentFilters.director !== 'all') {
        activeTags.push({
            type: 'director',
            label: `Director: ${currentFilters.director}`,
            value: currentFilters.director
        });
    }

    if (currentFilters.actor !== 'all') {
        activeTags.push({
            type: 'actor',
            label: `Actor: ${currentFilters.actor}`,
            value: currentFilters.actor
        });
    }

    if (currentFilters.studio !== 'all') {
        activeTags.push({
            type: 'studio',
            label: `Studio: ${currentFilters.studio}`,
            value: currentFilters.studio
        });
    }

    if (currentFilters.genre !== 'all') {
        activeTags.push({
            type: 'genre',
            label: `Genre: ${currentFilters.genre}`,
            value: currentFilters.genre
        });
    }

    if (currentFilters.certification !== 'all') {
        activeTags.push({
            type: 'certification',
            label: `Rating: ${currentFilters.certification}`,
            value: currentFilters.certification
        });
    }

    if (currentFilters.yearMin) {
        activeTags.push({
            type: 'yearMin',
            label: `From: ${currentFilters.yearMin}`,
            value: currentFilters.yearMin
        });
    }
    
    if (currentFilters.yearMax) {
        activeTags.push({
            type: 'yearMax',
            label: `To: ${currentFilters.yearMax}`,
            value: currentFilters.yearMax
        });
    }
    
    if (activeTags.length > 0) {
        activeFiltersDiv.style.display = 'block';
        tagsContainer.innerHTML = activeTags.map(tag => `
            <span class="filter-tag">
                ${tag.label}
                <span class="remove" onclick="App.removeFilter('${tag.type}')">×</span>
            </span>
        `).join('');
    } else {
        activeFiltersDiv.style.display = 'none';
    }
}

function removeFilter(filterType) {
    if (filterType === 'search') {
        currentFilters.search = '';
        document.getElementById('filterSearch').value = '';
    } else if (filterType === 'yearMin' || filterType === 'yearMax') {
        currentFilters[filterType] = null;
        document.getElementById(`filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`).value = '';
    } else {
        currentFilters[filterType] = 'all';
        document.getElementById(`filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`).value = 'all';
    }

    _saveFilters();
    const sortBy = document.getElementById('sortBySelect').value || 'title';
    sortMoviesEnhanced(sortBy);
    updateActiveFilters();
}

    function openResolveModal(movieId, title) {
        currentResolvingMovie = { movieId, title };

        const modal = document.getElementById('resolveModal');
        const modalTitle = document.getElementById('resolveModalTitle');
        const searchInput = document.getElementById('resolveSearchInput');
        const resultsDiv = document.getElementById('resolveResults');

        if (!modal || !modalTitle || !searchInput || !resultsDiv) return;

        modalTitle.textContent = `Match: ${title}`;
        searchInput.value = title;
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 2rem;">🔍 Searching TMDB...</p>';

        modal.classList.add('active');

        // Auto-search on open
        setTimeout(() => searchForResolve(), 200);
    }
    
    function closeResolveModal() {
        const modal = document.getElementById('resolveModal');
        if (modal) modal.classList.remove('active');
        currentResolvingMovie = null;
        seqMode = false;
        seqMovies = [];
        seqIndex = 0;
        const seqNav = document.getElementById('seqNav');
        if (seqNav) seqNav.style.display = 'none';
    }

    async function fetchAllMissingMetadata() {
        const btn = document.getElementById('fillMissingMetaBtn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
        try {
            showToast('Fetching missing metadata from TMDB…', 'info');
            const result = await apiCall('fill_missing_metadata');
            const msg = `✅ Updated ${result.updated} film${result.updated !== 1 ? 's' : ''}` +
                (result.failed ? ` (${result.failed} failed)` : '') +
                (result.remaining > 0 ? ` — run again for ${result.remaining} more` : '');
            showToast(msg, 'success');
            await loadCollection();
        } catch (e) {
            showToast('Failed to fetch metadata', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Fill Missing Directors & Metadata'; }
        }
    }

    function openSequenceMatcher(startIndex) {
        if (unresolvedMovies.length === 0) {
            showToast('No unresolved movies to match', 'info');
            return;
        }
        seqMode = true;
        seqMovies = [...unresolvedMovies];
        seqIndex = typeof startIndex === 'number' ? startIndex : 0;
        _seqLoad(seqIndex);
    }

    function _seqLoad(index) {
        if (index >= seqMovies.length) {
            seqMode = false;
            seqMovies = [];
            seqIndex = 0;
            const seqNav = document.getElementById('seqNav');
            if (seqNav) seqNav.style.display = 'none';
            const modal = document.getElementById('resolveModal');
            if (modal) modal.classList.remove('active');
            currentResolvingMovie = null;
            showToast('🎉 Sequence complete!', 'success');
            return;
        }

        const movie = seqMovies[index];
        if (!movie) { seqIndex++; _seqLoad(seqIndex); return; }

        const titleStr = movie.title || 'Unknown';
        currentResolvingMovie = { movieId: movie.movie_id, title: titleStr };

        const modalTitle = document.getElementById('resolveModalTitle');
        if (modalTitle) modalTitle.textContent = `Match: ${titleStr}`;

        const searchInput = document.getElementById('resolveSearchInput');
        if (searchInput) searchInput.value = titleStr;

        const resultsDiv = document.getElementById('resolveResults');
        if (resultsDiv) resultsDiv.innerHTML = '<p style="text-align: center; padding: 2rem;">🔍 Searching TMDB...</p>';

        document.getElementById('resolveMergeBanner')?.remove();

        const seqNav = document.getElementById('seqNav');
        const seqCounter = document.getElementById('seqCounter');
        if (seqNav) seqNav.style.display = 'flex';
        if (seqCounter) seqCounter.textContent = `${index + 1} of ${seqMovies.length}`;

        const modal = document.getElementById('resolveModal');
        if (modal && !modal.classList.contains('active')) modal.classList.add('active');

        setTimeout(() => searchForResolve(), 200);
    }

    function seqSkip() {
        seqIndex++;
        _seqLoad(seqIndex);
    }

    function seqPrev() {
        seqIndex = Math.max(0, seqIndex - 1);
        _seqLoad(seqIndex);
    }

async function searchForResolve() {
    const searchInput = document.getElementById('resolveSearchInput');
    const resultsDiv = document.getElementById('resolveResults');
    
    if (!searchInput || !resultsDiv) return;
    
    const query = searchInput.value.trim();
    
    if (!query) {
        showToast('Please enter a search term', 'error');
        return;
    }
    
    resultsDiv.innerHTML = '<p style="text-align: center; padding: 2rem;">🔍 Searching TMDB for movies & TV shows...</p>';
    
    try {
        const results = await apiCall('search_multi', { query });
        
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 2rem;">No results found. Try a different search term.</p>';
            return;
        }

        const shown = results.slice(0, 20);
        const hint = results.length > 20
            ? `Showing top 20 of ${results.length} results`
            : `${results.length} result${results.length !== 1 ? 's' : ''}`;

        resultsDiv.innerHTML = `<p style="font-size:0.8rem;color:rgba(255,255,255,0.45);margin:0 0 0.75rem;text-align:center;">
            ${hint} — not seeing it? Edit the search above and try adding a year or the director's name.
        </p>` + shown.map(item => {
            const isTV = item.media_type === 'tv';
            const title = isTV ? item.name : item.title;
            const releaseDate = isTV ? item.first_air_date : item.release_date;
            const posterPath = item.poster_path 
                ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
                : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'150\'%3E%3Crect fill=\'%23666\' width=\'100\' height=\'150\'/%3E%3C/svg%3E';
            const year = releaseDate ? releaseDate.substring(0, 4) : 'N/A';
            const overview = item.overview ? (item.overview.substring(0, 150) + '...') : 'No description available.';
            const mediaIcon = isTV ? '📺' : '🎬';
            const mediaLabel = isTV ? 'TV Series' : 'Movie';
            
            return `
            <div class="resolve-result-card" 
                 style="display: flex; gap: 1rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.75rem; cursor: pointer; transition: all 0.2s;"
                 data-tmdb-id="${item.id}"
                 data-title="${title.replace(/"/g, '&quot;')}"
                 data-year="${year}"
                 data-media-type="${item.media_type}">
                <img src="${posterPath}" 
                     alt="${title}" 
                     style="width: 60px; height: 90px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; margin-bottom: 0.25rem; color: white;">
                        ${mediaIcon} ${title}
                    </div>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-bottom: 0.5rem;">
                        ${mediaLabel} • ${year} ${item.vote_average ? `• ⭐ ${item.vote_average.toFixed(1)}` : ''}
                    </div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); line-height: 1.3;">${overview}</div>
                </div>
            </div>
            `;
        }).join('');
        
        // Add click handlers
        resultsDiv.querySelectorAll('.resolve-result-card').forEach(card => {
            card.addEventListener('click', function() {
                const tmdbId = parseInt(card.dataset.tmdbId);
                const title = card.dataset.title.replace(/&quot;/g, '"');
                const year = card.dataset.year;
                const mediaType = card.dataset.mediaType;
                confirmResolve(tmdbId, title, year, mediaType);
            });
        });
        
    } catch (error) {
        console.error('Search failed:', error);
        resultsDiv.innerHTML = '<p style="text-align: center; color: #f44336; padding: 2rem;">Search failed. Please try again.</p>';
        showToast('Search failed', 'error');
    }
}
    
async function confirmResolve(tmdbId, title, year, mediaType = 'movie') {
    if (!currentResolvingMovie) return;

    // Remove any previous merge banner
    document.getElementById('resolveMergeBanner')?.remove();

    try {
        const result = await apiCall('resolve_movie', {
            movie_id: currentResolvingMovie.movieId,
            tmdb_id: String(tmdbId),
            media_type: mediaType
        });

        showToast(`✅ Matched!`, 'success');
        loadUnresolved();
        loadCollection();
        if (seqMode) {
            seqIndex++;
            _seqLoad(seqIndex);
        } else {
            closeResolveModal();
        }

    } catch (error) {
        console.error('Resolve failed:', error);

        // Duplicate movie — show inline merge banner inside the modal instead of a confirm() dialog
        if (error.message && error.message.includes('already exists') && error.data?.already_exists) {
            const existingTitle = error.data.existing_movie?.title || 'an existing entry';
            const banner = document.createElement('div');
            banner.id = 'resolveMergeBanner';
            banner.style.cssText = 'background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:8px;padding:0.9rem 1rem;margin-top:1rem;';
            banner.innerHTML = `
                <p style="color:#fca5a5;font-size:0.88rem;margin:0 0 0.65rem;">
                    ⚠️ <strong>"${existingTitle}"</strong> already exists. Merge unresolved copies into it?
                </p>
                <div style="display:flex;gap:0.5rem;">
                    <button id="mergeYesBtn" class="btn" style="flex:1;padding:0.4rem;font-size:0.85rem;background:rgba(239,68,68,0.25);border:1px solid rgba(239,68,68,0.5);">
                        Yes, merge
                    </button>
                    <button id="mergeNoBtn" class="btn btn-secondary" style="flex:1;padding:0.4rem;font-size:0.85rem;">
                        Cancel
                    </button>
                </div>`;
            document.getElementById('resolveResults').appendChild(banner);
            banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            document.getElementById('mergeYesBtn').onclick = async () => {
                banner.remove();
                try {
                    const mergeResult = await apiCall('resolve_movie', {
                        movie_id: currentResolvingMovie.movieId,
                        tmdb_id: String(tmdbId),
                        media_type: mediaType,
                        confirm_merge: true
                    });
                    const n = mergeResult.copies_moved || 0;
                    showToast(`✅ Merged ${n} ${n === 1 ? 'copy' : 'copies'}`, 'success');
                    loadUnresolved();
                    loadCollection();
                    if (seqMode) {
                        seqIndex++;
                        _seqLoad(seqIndex);
                    } else {
                        closeResolveModal();
                    }
                } catch (mergeError) {
                    showToast('Failed to merge copies', 'error');
                }
            };
            document.getElementById('mergeNoBtn').onclick = () => banner.remove();
        } else {
            showToast('Failed to resolve movie', 'error');
        }
    }
}
    
    // ========================================
    // BOX SET / CONTAINER SYSTEM (v2.3.0)
    // ========================================

    let currentContainerId = null;
    let currentContainer = null; // Current box set container data
    let boxSetMovies = []; // Movies added to current box set

    // Show/hide sections in Add tab
    function showAddTypeChoice() {
        document.getElementById('addTypeChoice').style.display = 'grid';
        document.getElementById('addSingleMovieSection').style.display = 'none';
        document.getElementById('addBoxSetSection').style.display = 'none';
    }

    function showAddSingleMovie() {
        document.getElementById('addTypeChoice').style.display = 'none';
        document.getElementById('addSingleMovieSection').style.display = 'block';
        document.getElementById('addBoxSetSection').style.display = 'none';
    }

    function showAddBoxSet() {
        document.getElementById('addTypeChoice').style.display = 'none';
        document.getElementById('addSingleMovieSection').style.display = 'none';
        document.getElementById('addBoxSetSection').style.display = 'block';
        document.getElementById('boxSetStep1').style.display = 'block';
        document.getElementById('boxSetStep2').style.display = 'none';

        // Reset form
        document.getElementById('boxSetName').value = '';
        document.getElementById('boxSetSpineLabel').value = '';
        document.getElementById('boxSetNotes').value = '';

        // Clear movie search
        const searchInput = document.getElementById('boxSetMovieSearch');
        const searchResults = document.getElementById('boxSetSearchResults');
        if (searchInput) searchInput.value = '';
        if (searchResults) searchResults.innerHTML = '';

        // Reset box set data
        boxSetMovies = [];
        currentContainerId = null;
        currentContainer = null;
    }

    // Create box set container and move to step 2
    async function createBoxSetAndAddMovies() {
        const name = document.getElementById('boxSetName').value.trim();
        const spineLabel = document.getElementById('boxSetSpineLabel').value.trim() || name;
        const format = document.getElementById('boxSetFormat').value;
        const edition = document.getElementById('boxSetEdition').value;
        const region = document.getElementById('boxSetRegion').value;
        const condition = document.getElementById('boxSetCondition').value;
        const spineType = document.getElementById('boxSetSpineType').value;
        const spineColor = document.getElementById('boxSetSpineColor').value;
        const notes = document.getElementById('boxSetNotes').value;
        // Physical media attributes (v3.0.0)
        const aspectRatio = document.getElementById('boxSetAspectRatio')?.value || '';
        const packageType = document.getElementById('boxSetPackageType')?.value || '';
        const hasSlipcover = document.getElementById('boxSetHasSlipcover')?.checked ? 1 : 0;
        const hasBooklet = document.getElementById('boxSetHasBooklet')?.checked ? 1 : 0;
        const hasBonusDisc = document.getElementById('boxSetHasBonusDisc')?.checked ? 1 : 0;
        const bonusDiscCount = hasBonusDisc ? parseInt(document.getElementById('boxSetBonusDiscCount')?.value || '1') : 0;
        const hasDigitalCopy = document.getElementById('boxSetHasDigitalCopy')?.checked ? 1 : 0;
        const has3d = document.getElementById('boxSetHas3d')?.checked ? 1 : 0;

        if (!name) {
            showToast('Please enter a box set name', 'error');
            return;
        }

        if (!format) {
            showToast('Please select a format', 'error');
            return;
        }

        try {
            const data = await apiCall('create_container', {
                name,
                spine_label: spineLabel,
                spine_image_type: spineType,
                spine_color: spineColor,
                spine_type: spineType,
                format,
                edition,
                region,
                condition,
                notes,
                aspect_ratio: aspectRatio,
                package_type: packageType,
                has_slipcover: hasSlipcover,
                has_booklet: hasBooklet,
                has_bonus_disc: hasBonusDisc,
                bonus_disc_count: bonusDiscCount,
                has_digital_copy: hasDigitalCopy,
                has_3d: has3d
            });

            if (data.container_id) {
                currentContainerId = data.container_id;
                boxSetMovies = [];

                // Show step 2
                document.getElementById('boxSetStep1').style.display = 'none';
                document.getElementById('boxSetStep2').style.display = 'block';

                // Clear search input and results from previous session
                const searchInput = document.getElementById('boxSetMovieSearch');
                const searchResults = document.getElementById('boxSetSearchResults');
                if (searchInput) searchInput.value = '';
                if (searchResults) searchResults.innerHTML = '';

                // Update UI elements if they exist
                const createdNameEl = document.getElementById('boxSetCreatedName');
                const movieCountEl = document.getElementById('boxSetMovieCount');
                const moviesContainerEl = document.getElementById('boxSetMoviesContainer');

                if (createdNameEl) {
                    createdNameEl.textContent = `📦 ${name}`;
                }
                if (movieCountEl) {
                    movieCountEl.textContent = '0';
                }
                if (moviesContainerEl) {
                    moviesContainerEl.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 2rem;">No movies added yet. Search above to add movies.</div>';
                }

                showToast('Box set created! Now add movies.', 'success');

                // Scroll to and focus the search input so it's obvious on mobile
                setTimeout(() => {
                    const searchEl = document.getElementById('boxSetMovieSearch');
                    if (searchEl) {
                        searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        searchEl.focus();
                    }
                }, 300);
            }
        } catch (error) {
            console.error('Failed to create box set:', error);
            showToast('Failed to create box set', 'error');
        }
    }

    // Scan box set cover/back to find movie titles via AI
    // Opens camera-based scanner (like Quick Scan) for scanning individual covers
    // or can scan box set back cover for multiple titles at once
    async function scanBoxSetTitles() {
        if (!currentContainerId) {
            showToast('Create the box set first', 'error');
            return;
        }

        // Open the camera-based scanner modal (Quick Scan style)
        openBoxSetScanner();
    }

    // Search for movies to add to box set
    async function searchMoviesForBoxSet() {
        const query = document.getElementById('boxSetMovieSearch').value.trim();
        console.log('[Search Movies] Searching for:', query);

        if (!query) return;

        const resultsDiv = document.getElementById('boxSetSearchResults');
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 2rem;">Searching...</p>';

        try {
            const data = await apiCall('search_movies', { query });
            console.log('[Search Movies] Search results:', data);

            if (!data || !data.results || data.results.length === 0) {
                resultsDiv.innerHTML = '<p style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">No movies found. Try a different search.</p>';
                return;
            }

            console.log('[Search Movies] Found movies:', data.results.map(m => ({
                id: m.id,
                title: m.title,
                year: m.release_date ? m.release_date.split('-')[0] : 'N/A'
            })));

            resultsDiv.innerHTML = data.results.map(movie => {
                console.log('[Search Movies] Rendering movie with ID:', movie.id, 'Title:', movie.title);
                return `
                    <div class="search-result" onclick="App.addMovieToBoxSet(${movie.id})">
                        <img src="${movie.poster_path ? 'https://image.tmdb.org/t/p/w92' + movie.poster_path : PLACEHOLDER_IMG}" alt="${movie.title}">
                        <div class="result-info">
                            <h4>${movie.title}</h4>
                            <p>${movie.release_date ? movie.release_date.split('-')[0] : 'N/A'}</p>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('[Search Movies] ERROR:', error);
            resultsDiv.innerHTML = '<p style="text-align: center; padding: 2rem; color: #ff5555;">Search failed. Please try again.</p>';
        }
    }

    // Add a movie to the box set
    async function addMovieToBoxSet(tmdbId) {
        console.log('[Add Movie to Box Set] Starting with TMDB ID:', tmdbId);

        if (!currentContainerId) {
            showToast('No container selected', 'error');
            return;
        }
        console.log('[Add Movie to Box Set] Container ID:', currentContainerId);

        try {
            // First, add movie to collection if not exists
            console.log('[Add Movie to Box Set] Step 1: Calling get_or_create_movie with tmdb_id:', tmdbId);
            const movieData = await apiCall('get_or_create_movie', { tmdb_id: tmdbId, cert_region: settings.certRegion || 'US' });
            console.log('[Add Movie to Box Set] Step 1 Response:', movieData);

            if (!movieData || !movieData.movie_id) {
                showToast('Failed to fetch movie details', 'error');
                return;
            }
            console.log('[Add Movie to Box Set] Movie created/found:', {
                movie_id: movieData.movie_id,
                title: movieData.title,
                tmdb_id: movieData.tmdb_id
            });

            // Create a copy for this movie
            const copyParams = {
                movie_id: movieData.movie_id,
                format: document.getElementById('boxSetFormat').value,
                edition: '',
                region: document.getElementById('boxSetRegion').value,
                condition: document.getElementById('boxSetCondition').value,
                notes: '',
                cert_region: settings.certRegion || 'US'
            };
            console.log('[Add Movie to Box Set] Step 2: Calling add_copy with params:', copyParams);
            const copyData = await apiCall('add_copy', copyParams);
            console.log('[Add Movie to Box Set] Step 2 Response:', copyData);

            if (!copyData || !copyData.copy_id) {
                showToast('Failed to create copy', 'error');
                return;
            }
            console.log('[Add Movie to Box Set] Copy created:', {
                copy_id: copyData.copy_id
            });

            // Add copy to container
            const discNumber = boxSetMovies.length + 1;
            const containerParams = {
                container_id: currentContainerId,
                copy_id: copyData.copy_id,
                disc_number: discNumber,
                disc_label: `Disc ${discNumber}: ${movieData.title}`,
                is_present: 1,
                position_in_container: discNumber - 1
            };
            console.log('[Add Movie to Box Set] Step 3: Calling add_movie_to_container with params:', containerParams);
            const containerResponse = await apiCall('add_movie_to_container', containerParams);
            console.log('[Add Movie to Box Set] Step 3 Response:', containerResponse);

            // Add to local list
            boxSetMovies.push({
                ...movieData,
                copy_id: copyData.copy_id,
                disc_number: discNumber
            });

            // Update UI
            updateBoxSetMoviesList();
            document.getElementById('boxSetMovieSearch').value = '';
            document.getElementById('boxSetSearchResults').innerHTML = '';

            console.log('[Add Movie to Box Set] SUCCESS: Added movie to box set:', movieData.title);
            showToast(`Added ${movieData.title} to box set`, 'success');

        } catch (error) {
            console.error('[Add Movie to Box Set] ERROR:', error);
            showToast('Failed to add movie to box set', 'error');
        }
    }

    // Update the list of movies in the box set
    function updateBoxSetMoviesList() {
        console.log('[updateBoxSetMoviesList] Called with boxSetMovies.length:', boxSetMovies.length);
        console.log('[updateBoxSetMoviesList] boxSetMovies:', boxSetMovies);

        const container = document.getElementById('boxSetMoviesContainer');
        const count = document.getElementById('boxSetMovieCount');

        console.log('[updateBoxSetMoviesList] container element:', container);
        console.log('[updateBoxSetMoviesList] count element:', count);

        // Only update count if element exists (may not exist in quick-create flow)
        if (count) {
            count.textContent = boxSetMovies.length;
            console.log('[updateBoxSetMoviesList] Updated count to:', boxSetMovies.length);
        }

        // Only update container if element exists (may not exist in quick-create flow)
        if (!container) {
            console.log('[updateBoxSetMoviesList] Container not found, returning');
            return;
        }

        if (boxSetMovies.length === 0) {
            console.log('[updateBoxSetMoviesList] No movies, showing empty message');
            container.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 2rem;">No movies added yet. Search above to add movies.</div>';
            return;
        }

        console.log('[updateBoxSetMoviesList] Rendering', boxSetMovies.length, 'movies');
        container.innerHTML = boxSetMovies.map((movie, index) => `
            <div style="display: flex; align-items: center; gap: 1rem; background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px;">
                <div style="font-size: 1.5rem; font-weight: 700; color: rgba(255,255,255,0.3); width: 30px;">
                    ${movie.disc_number}
                </div>
                <img src="${movie.poster_url || PLACEHOLDER_IMG}"
                     style="width: 50px; height: 75px; object-fit: cover; border-radius: 4px;"
                     alt="${movie.title}">
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${movie.title}</div>
                    <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">${movie.year || 'N/A'}</div>
                </div>
                <button class="btn-icon" onclick="App.removeMovieFromBoxSet(${index})" title="Remove">
                    🗑️
                </button>
            </div>
        `).join('');
    }

    // Remove a movie from the box set
    async function removeMovieFromBoxSet(index) {
        if (!confirm('Remove this movie from the box set?')) return;

        const movie = boxSetMovies[index];

        try {
            // Remove from container (this will delete the container_contents entry)
            // We'd need the content_id, but for now let's just remove from local array
            // In production, we'd call remove_movie_from_container API

            boxSetMovies.splice(index, 1);

            // Renumber remaining movies
            boxSetMovies.forEach((m, i) => {
                m.disc_number = i + 1;
            });

            updateBoxSetMoviesList();
            showToast('Movie removed from box set', 'success');

        } catch (error) {
            console.error('Failed to remove movie:', error);
            showToast('Failed to remove movie', 'error');
        }
    }

    // Finish box set creation and return to collection
    function finishBoxSetCreation() {
        showToast(`Box set created with ${boxSetMovies.length} movies!`, 'success');

        // Clear search
        const searchInput = document.getElementById('boxSetMovieSearch');
        const searchResults = document.getElementById('boxSetSearchResults');
        if (searchInput) searchInput.value = '';
        if (searchResults) searchResults.innerHTML = '';

        // Reset
        showAddTypeChoice();
        currentContainerId = null;
        currentContainer = null;
        boxSetMovies = [];

        // Reload collection and switch to collection tab
        loadCollection();
        switchTab('collection');
    }

    // View box set details
    function viewBoxSetDetails() {
        if (!currentContainerId) {
            showToast('No box set selected', 'error');
            return;
        }

        // Open the box set details modal
        showBoxSetDetails(currentContainerId);
    }

    // Update spine color picker visibility
    function updateBoxSetSpinePreview() {
        const spineType = document.getElementById('boxSetSpineType').value;
        const colorPicker = document.getElementById('boxSetSpineColorPicker');

        if (spineType === 'color') {
            colorPicker.style.display = 'block';
        } else {
            colorPicker.style.display = 'none';
        }
    }

    // ========================================
    // BOX SET MANAGEMENT FUNCTIONS
    // ========================================

    // Load all box sets for the user
    // ========================================
    // BOX SET COVER UPLOAD + CROP
    // ========================================

    let _cropImg      = null;   // HTMLImageElement
    let _cropOffsetX  = 0;      // image draw offset inside canvas
    let _cropOffsetY  = 0;
    let _cropScale    = 1;
    let _cropDragging = false;
    let _cropLastX    = 0;
    let _cropLastY    = 0;

    // Poster aspect ratio used for the crop frame (2 : 3)
    const CROP_W_RATIO = 0.80; // fraction of canvas width used as crop frame

    // Crop aspect mode and image adjustment state
    let _cropAspect = 'poster'; // 'poster' (2:3), 'boxset' (4:5), 'square' (1:1)
    let _cropBrightness = 0;
    let _cropContrast = 0;
    let _cropWarmth = 0;
    let _cropSaturation = 0;

    function showCoverUpload(containerId) {
        currentContainerId = containerId;
        document.getElementById('coverCropModal').classList.add('active');
        // Reset state
        _cropImg = null;
        _cropAspect = 'poster';
        _cropBrightness = 0;
        _cropContrast = 0;
        _cropWarmth = 0;
        _cropSaturation = 0;
        // Reset adjustment sliders
        const bEl = document.getElementById('cropBrightness');
        const cEl = document.getElementById('cropContrast');
        const wEl = document.getElementById('cropWarmth');
        const sEl = document.getElementById('cropSaturation');
        if (bEl) bEl.value = 0;
        if (cEl) cEl.value = 0;
        if (wEl) wEl.value = 0;
        if (sEl) sEl.value = 0;
        ['cropBrightnessVal','cropContrastVal','cropWarmthVal','cropSaturationVal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        // Reset aspect buttons
        document.querySelectorAll('.crop-aspect-btns .btn-chip').forEach(b => b.classList.remove('active'));
        const posterBtn = document.querySelector('.crop-aspect-btns .btn-chip[data-aspect="poster"]');
        if (posterBtn) posterBtn.classList.add('active');

        const canvas = document.getElementById('cropCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '1rem sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Select a photo above to start', canvas.width / 2, canvas.height / 2);
        document.getElementById('cropSaveBtn').disabled = true;

        // If container already has a custom cover, pre-load it for editing
        if (currentContainer && currentContainer.spine_image_type === 'custom' && currentContainer.spine_image_url) {
            _loadCropImage(currentContainer.spine_image_url);
        }
    }

    function closeCoverCrop() {
        document.getElementById('coverCropModal').classList.remove('active');
        _cropImg = null;
    }

    function onCoverFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => _loadCropImage(ev.target.result);
        reader.readAsDataURL(file);
        e.target.value = ''; // allow re-selecting same file
    }

    function _loadCropImage(src) {
        const img = new Image();
        img.onload = () => {
            _cropImg    = img;
            const canvas = document.getElementById('cropCanvas');
            // Scale image to fit entirely inside the canvas (no cropping on load)
            const scaleX = canvas.width  / img.width;
            const scaleY = canvas.height / img.height;
            _cropScale   = Math.min(scaleX, scaleY);
            _cropOffsetX = (canvas.width  - img.width  * _cropScale) / 2;
            _cropOffsetY = (canvas.height - img.height * _cropScale) / 2;
            document.getElementById('cropZoomSlider').value = 100;
            document.getElementById('cropSaveBtn').disabled = false;
            _drawCrop();
        };
        img.src = src;
    }

    function _getCropAspectRatio() {
        switch (_cropAspect) {
            case 'boxset': return 5 / 4;   // 4:5 - squatter box set shape
            case 'square': return 1;       // 1:1
            default: return 3 / 2;         // 2:3 poster
        }
    }

    function _drawCrop() {
        const canvas = document.getElementById('cropCanvas');
        const ctx    = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        if (_cropImg) {
            // Apply image adjustments
            ctx.save();
            const filterParts = [];
            if (_cropBrightness !== 0) filterParts.push(`brightness(${1 + _cropBrightness / 100})`);
            if (_cropContrast !== 0) filterParts.push(`contrast(${1 + _cropContrast / 100})`);
            if (_cropSaturation !== 0) filterParts.push(`saturate(${1 + _cropSaturation / 100})`);
            // Warmth via hue-rotate (positive = warm/orange, negative = cool/blue)
            if (_cropWarmth !== 0) filterParts.push(`sepia(${Math.abs(_cropWarmth) / 100 * 0.3}) hue-rotate(${_cropWarmth > 0 ? -10 : 10}deg)`);
            if (filterParts.length > 0) ctx.filter = filterParts.join(' ');

            ctx.drawImage(_cropImg,
                _cropOffsetX, _cropOffsetY,
                _cropImg.width * _cropScale, _cropImg.height * _cropScale);
            ctx.restore();
        }

        // Crop frame dimensions based on selected aspect ratio
        const aspectRatio = _getCropAspectRatio();
        const frameW = W * CROP_W_RATIO;
        const frameH = frameW * aspectRatio;
        const frameX = (W - frameW) / 2;
        const frameY = (H - frameH) / 2;

        // Semi-transparent overlay outside the frame
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, frameY);                          // top
        ctx.fillRect(0, frameY + frameH, W, H - frameY - frameH); // bottom
        ctx.fillRect(0, frameY, frameX, frameH);                // left
        ctx.fillRect(frameX + frameW, frameY, W - frameX - frameW, frameH); // right

        // Frame border
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth   = 2;
        ctx.strokeRect(frameX, frameY, frameW, frameH);

        // Corner accents
        const ca = 16;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 3;
        [[frameX, frameY], [frameX + frameW, frameY],
         [frameX, frameY + frameH], [frameX + frameW, frameY + frameH]].forEach(([cx, cy]) => {
            const sx = cx === frameX ? 1 : -1;
            const sy = cy === frameY ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(cx + sx * ca, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + sy * ca);
            ctx.stroke();
        });

        // Aspect label
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '0.7rem sans-serif';
        ctx.textAlign = 'center';
        const label = _cropAspect === 'poster' ? '2:3 Poster' : _cropAspect === 'boxset' ? '4:5 Box Set' : '1:1 Square';
        ctx.fillText(label, W / 2, frameY + frameH + 16);
    }

    // Drag to pan
    function _cropPointerDown(e) {
        _cropDragging = true;
        const pt = e.touches ? e.touches[0] : e;
        _cropLastX = pt.clientX;
        _cropLastY = pt.clientY;
    }
    function _cropPointerMove(e) {
        if (!_cropDragging || !_cropImg) return;
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - _cropLastX;
        const dy = pt.clientY - _cropLastY;
        _cropLastX = pt.clientX;
        _cropLastY = pt.clientY;
        _cropOffsetX += dx;
        _cropOffsetY += dy;
        _drawCrop();
    }
    function _cropPointerUp() { _cropDragging = false; }

    function cropZoom(val) {
        if (!_cropImg) return;
        const canvas   = document.getElementById('cropCanvas');
        const newScale = (val / 100) * Math.min(canvas.width / _cropImg.width,
                                                 canvas.height / _cropImg.height);
        // Zoom around canvas centre
        const cx = canvas.width / 2, cy = canvas.height / 2;
        _cropOffsetX = cx - (cx - _cropOffsetX) * (newScale / _cropScale);
        _cropOffsetY = cy - (cy - _cropOffsetY) * (newScale / _cropScale);
        _cropScale   = newScale;
        _drawCrop();
    }

    // Wire up canvas events (called once after DOM ready)
    function _initCropCanvasEvents() {
        const canvas = document.getElementById('cropCanvas');
        if (!canvas || canvas._cropEventsAttached) return;
        canvas._cropEventsAttached = true;
        canvas.addEventListener('mousedown',  _cropPointerDown);
        canvas.addEventListener('mousemove',  _cropPointerMove);
        canvas.addEventListener('mouseup',    _cropPointerUp);
        canvas.addEventListener('mouseleave', _cropPointerUp);
        canvas.addEventListener('touchstart', _cropPointerDown, { passive: true });
        canvas.addEventListener('touchmove',  _cropPointerMove, { passive: false });
        canvas.addEventListener('touchend',   _cropPointerUp);
    }

    // ── Crop Aspect Ratio Switching ──
    function setCropAspect(mode) {
        _cropAspect = mode;
        document.querySelectorAll('.crop-aspect-btns .btn-chip').forEach(b => {
            b.classList.toggle('active', b.dataset.aspect === mode);
        });
        _drawCrop();
    }

    // ── Image Adjustment Controls ──
    function applyCropAdjustments() {
        _cropBrightness = parseInt(document.getElementById('cropBrightness')?.value || '0');
        _cropContrast = parseInt(document.getElementById('cropContrast')?.value || '0');
        _cropWarmth = parseInt(document.getElementById('cropWarmth')?.value || '0');
        _cropSaturation = parseInt(document.getElementById('cropSaturation')?.value || '0');
        // Update value displays
        const bv = document.getElementById('cropBrightnessVal');
        const cv = document.getElementById('cropContrastVal');
        const wv = document.getElementById('cropWarmthVal');
        const sv = document.getElementById('cropSaturationVal');
        if (bv) bv.textContent = _cropBrightness;
        if (cv) cv.textContent = _cropContrast;
        if (wv) wv.textContent = _cropWarmth;
        if (sv) sv.textContent = _cropSaturation;
        _drawCrop();
    }

    function resetCropAdjustments() {
        _cropBrightness = _cropContrast = _cropWarmth = _cropSaturation = 0;
        ['cropBrightness','cropContrast','cropWarmth','cropSaturation'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = 0;
        });
        ['cropBrightnessVal','cropContrastVal','cropWarmthVal','cropSaturationVal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        _drawCrop();
    }

    function autoAdjustCrop() {
        if (!_cropImg) return;
        // Sample average brightness and color from the image
        const sample = document.createElement('canvas');
        sample.width = 100;
        sample.height = 100;
        const sCtx = sample.getContext('2d');
        sCtx.drawImage(_cropImg, 0, 0, 100, 100);
        const data = sCtx.getImageData(0, 0, 100, 100).data;

        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalR += data[i];
            totalG += data[i + 1];
            totalB += data[i + 2];
            count++;
        }
        const avgR = totalR / count;
        const avgG = totalG / count;
        const avgB = totalB / count;
        const avgLum = (avgR + avgG + avgB) / 3;

        // Auto-brightness: push towards ~130 avg luminance
        _cropBrightness = Math.round((130 - avgLum) / 2.55 * 0.6);
        _cropBrightness = Math.max(-50, Math.min(50, _cropBrightness));

        // Auto-contrast: slight boost if image is flat
        const variance = _calcVariance(data, avgLum);
        _cropContrast = variance < 2000 ? 15 : (variance < 4000 ? 8 : 0);

        // Auto-warmth: correct if too warm (ambient light)
        const warmthBias = avgR - avgB;
        _cropWarmth = Math.round(-warmthBias / 5);
        _cropWarmth = Math.max(-30, Math.min(30, _cropWarmth));

        // Slight saturation boost
        _cropSaturation = 10;

        // Update sliders
        document.getElementById('cropBrightness').value = _cropBrightness;
        document.getElementById('cropContrast').value = _cropContrast;
        document.getElementById('cropWarmth').value = _cropWarmth;
        document.getElementById('cropSaturation').value = _cropSaturation;
        document.getElementById('cropBrightnessVal').textContent = _cropBrightness;
        document.getElementById('cropContrastVal').textContent = _cropContrast;
        document.getElementById('cropWarmthVal').textContent = _cropWarmth;
        document.getElementById('cropSaturationVal').textContent = _cropSaturation;

        _drawCrop();
        showToast('Auto-adjusted image', 'success');
    }

    function _calcVariance(data, mean) {
        let sum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const lum = (data[i] + data[i+1] + data[i+2]) / 3;
            sum += (lum - mean) ** 2;
            count++;
        }
        return sum / count;
    }

    // ── Spine Color Extraction from Poster ──
    function extractAverageColor(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 50;
                canvas.height = 75;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 50, 75);
                const data = ctx.getImageData(0, 0, 50, 75).data;

                // Use a weighted approach - edges contribute to spine color more
                let r = 0, g = 0, b = 0, count = 0;
                for (let y = 0; y < 75; y++) {
                    for (let x = 0; x < 50; x++) {
                        const i = (y * 50 + x) * 4;
                        // Weight edges (left/right columns) more for spine color
                        const edgeWeight = (x < 8 || x > 42) ? 3 : 1;
                        r += data[i] * edgeWeight;
                        g += data[i + 1] * edgeWeight;
                        b += data[i + 2] * edgeWeight;
                        count += edgeWeight;
                    }
                }
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);

                // Boost saturation slightly for more vivid spines
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                if (max - min > 20) {
                    const factor = 1.2;
                    const avg = (r + g + b) / 3;
                    r = Math.min(255, Math.round(avg + (r - avg) * factor));
                    g = Math.min(255, Math.round(avg + (g - avg) * factor));
                    b = Math.min(255, Math.round(avg + (b - avg) * factor));
                }

                const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
                resolve(hex);
            };
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = imageUrl;
        });
    }

    // ── Bonus disc toggle for add form ──
    function _initPackagingToggles() {
        // Copy form bonus disc toggle
        const bonusDiscCb = document.getElementById('copyHasBonusDisc');
        if (bonusDiscCb) {
            bonusDiscCb.addEventListener('change', () => {
                const row = document.getElementById('bonusDiscCountRow');
                if (row) row.style.display = bonusDiscCb.checked ? 'block' : 'none';
            });
        }
        // Box set form bonus disc toggle
        const boxSetBonusDiscCb = document.getElementById('boxSetHasBonusDisc');
        if (boxSetBonusDiscCb) {
            boxSetBonusDiscCb.addEventListener('change', () => {
                const row = document.getElementById('boxSetBonusDiscCountRow');
                if (row) row.style.display = boxSetBonusDiscCb.checked ? 'block' : 'none';
            });
        }
    }

    async function saveCroppedCover() {
        if (!_cropImg) return;
        const sourceCanvas = document.getElementById('cropCanvas');
        const W = sourceCanvas.width, H = sourceCanvas.height;

        const aspectRatio = _getCropAspectRatio();
        const frameW = W * CROP_W_RATIO;
        const frameH = frameW * aspectRatio;
        const frameX = (W - frameW) / 2;
        const frameY = (H - frameH) / 2;

        // Build output canvas at a clean resolution
        const outW = 400;
        const outH = Math.round(outW * aspectRatio);
        const out  = document.createElement('canvas');
        out.width  = outW;
        out.height = outH;
        const ctx  = out.getContext('2d');

        // Apply image adjustments to output
        const filterParts = [];
        if (_cropBrightness !== 0) filterParts.push(`brightness(${1 + _cropBrightness / 100})`);
        if (_cropContrast !== 0) filterParts.push(`contrast(${1 + _cropContrast / 100})`);
        if (_cropSaturation !== 0) filterParts.push(`saturate(${1 + _cropSaturation / 100})`);
        if (_cropWarmth !== 0) filterParts.push(`sepia(${Math.abs(_cropWarmth) / 100 * 0.3}) hue-rotate(${_cropWarmth > 0 ? -10 : 10}deg)`);
        if (filterParts.length > 0) ctx.filter = filterParts.join(' ');

        // Map: frame pixel (frameX, frameY) → image pixel
        const imgX = (frameX - _cropOffsetX) / _cropScale;
        const imgY = (frameY - _cropOffsetY) / _cropScale;
        const imgW = frameW / _cropScale;
        const imgH = frameH / _cropScale;
        ctx.drawImage(_cropImg, imgX, imgY, imgW, imgH, 0, 0, outW, outH);

        // Upload
        const btn = document.getElementById('cropSaveBtn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        out.toBlob(async (blob) => {
            try {
                const form = new FormData();
                form.append('cover', blob, 'cover.jpg');

                const resp = await fetch('/api/upload-cover.php', {
                    method: 'POST',
                    body: form
                });
                const result = await resp.json();

                if (!result.success) throw new Error(result.error || 'Upload failed');

                // Update the container's cover
                await apiCall('update_container', {
                    container_id: currentContainerId,
                    spine_image_type: 'custom',
                    spine_image_url: result.url
                });

                showToast('Cover saved! 🎨', 'success');
                closeCoverCrop();
                // Re-render box set detail if open in movieDetailModal
                if (document.getElementById('movieDetailModal').classList.contains('active') && currentContainerId) {
                    showBoxSetDetails(currentContainerId);
                }
                loadBoxSets();
            } catch (err) {
                showToast('Failed to save cover: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Cover';
            }
        }, 'image/jpeg', 0.88);
    }

    // ========================================
    // END BOX SET COVER
    // ========================================

    function filterBoxSets(val) {
        const q = (val || '').toLowerCase().trim();
        const cards = document.querySelectorAll('#boxSetsList .movie-card');
        let shown = 0;
        cards.forEach(card => {
            const title = (card.querySelector('.movie-title')?.textContent || '').toLowerCase();
            const visible = !q || title.includes(q);
            card.style.display = visible ? '' : 'none';
            if (visible) shown++;
        });
        const empty = document.getElementById('emptyBoxSets');
        if (empty) empty.style.display = (shown === 0 && cards.length > 0) ? 'flex' : 'none';
    }

    async function loadBoxSets() {
        try {
            const boxSets = await apiCall('list_containers');

            const container = document.getElementById('boxSetsList');
            const emptyState = document.getElementById('emptyBoxSets');

            if (!boxSets || boxSets.length === 0) {
                container.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            container.style.display = 'grid';
            emptyState.style.display = 'none';

            // Apply movie-grid view classes
            const viewClass = currentView === 'list' ? 'list-view' : currentView === 'compact' ? 'compact-view' : currentView === 'gallery' ? 'gallery-view' : 'grid-view';
            container.className = 'movie-grid ' + viewClass;

            // Fetch movie posters for each box set
            const boxSetsWithMovies = await Promise.all(
                boxSets.map(async (boxSet) => {
                    try {
                        const data = await apiCall('get_container_contents', { container_id: boxSet.id });
                        return { ...boxSet, movies: data.movies || [] };
                    } catch (e) {
                        console.error(`Failed to load movies for box set ${boxSet.id}:`, e);
                        return { ...boxSet, movies: [] };
                    }
                })
            );

            // Build nav list of container IDs
            const containerIds = JSON.stringify(boxSetsWithMovies.map(bs => bs.id));

            container.innerHTML = boxSetsWithMovies.map(boxSet => {
                // Poster: UMDB cover > custom local cover > first movie poster > color placeholder
                const customCoverUrl = boxSet.umdb_cover_url || (boxSet.spine_image_url && boxSet.spine_image_url);
                const firstMoviePoster = boxSet.movies[0]?.poster_url;
                const posterUrl = customCoverUrl ? customCoverUrl
                    : firstMoviePoster ? firstMoviePoster
                    : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'%3E%3Crect fill='${encodeURIComponent(boxSet.spine_color || '#764ba2')}' width='200' height='300'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='white' font-size='40'%3E📦%3C/text%3E%3C/svg%3E`;
                const safeTitle = (boxSet.name || 'Box Set').replace(/"/g, '&quot;');

                if (currentView === 'list') {
                    // List view: detailed horizontal layout (original box set card style)
                    const posterMovies = boxSet.movies.slice(0, 4);
                    const thumbnail = customCoverUrl
                        ? `<img src="${customCoverUrl}" alt="${safeTitle}" style="width:80px;height:107px;flex-shrink:0;border-radius:6px;object-fit:cover;">`
                        : posterMovies.length > 0
                        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;width:80px;height:107px;flex-shrink:0;background:rgba(0,0,0,0.3);border-radius:6px;overflow:hidden;">
                                ${posterMovies.map(movie => `<div style="overflow:hidden;background:rgba(0,0,0,0.5);"><img src="${movie.poster_url || ''}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'"></div>`).join('')}
                                ${posterMovies.length < 4 ? Array(4 - posterMovies.length).fill('<div style="background:rgba(0,0,0,0.3);"></div>').join('') : ''}
                            </div>`
                        : `<div style="width:80px;height:107px;flex-shrink:0;background:${boxSet.spine_color||'#667eea'};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:2rem;">📦</div>`;

                    return `<div class="movie-card collection-card" onclick="App.showBoxSetDetailsWithNav(${boxSet.id}, ${containerIds})" style="cursor:pointer;">
                        <div class="movie-poster-container">${thumbnail}</div>
                        <div class="movie-info">
                            <h3 class="movie-title">📦 ${safeTitle}</h3>
                            <div class="movie-meta">
                                <span>${boxSet.format || 'Box Set'}</span>
                                ${boxSet.edition ? `<span>${boxSet.edition}</span>` : ''}
                                <span>${boxSet.total_movies || 0} Movie${boxSet.total_movies !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                        <div class="movie-actions">
                            <button class="btn-icon" onclick="event.stopPropagation(); App.showBoxSetDetailsWithNav(${boxSet.id}, ${containerIds});" title="Details">👁️</button>
                        </div>
                    </div>`;
                } else {
                    // Grid/Compact: Netflix-style poster card matching Movies
                    return `<div class="movie-card" onclick="App.showBoxSetDetailsWithNav(${boxSet.id}, ${containerIds})" style="cursor:pointer;">
                        <div class="movie-poster-container">
                            <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                        </div>
                        <div class="hover-overlay">
                            <div class="hover-title">${safeTitle}</div>
                            <div class="hover-meta">
                                <span>${boxSet.format || 'Box Set'}</span>
                                ${boxSet.edition ? `<span>${boxSet.edition}</span>` : ''}
                                <span>${boxSet.total_movies || 0} films</span>
                            </div>
                        </div>
                        <div class="movie-info">
                            <h3 class="movie-title">📦 ${safeTitle}</h3>
                        </div>
                    </div>`;
                }
            }).join('');
        } catch (error) {
            console.error('Failed to load box sets:', error);
            showToast('Failed to load box sets', 'error');
        }
    }

    // Show box set details modal
    async function showBoxSetDetails(containerId) {
        try {
            const data = await apiCall('get_container_contents', { container_id: containerId });
            const { container, movies } = data;

            if (!container) {
                showToast('Box set not found', 'error');
                return;
            }

            currentContainerId = containerId;
            currentContainer = container;

            // Reset movie/copy nav (will be overridden by box set nav if applicable)
            shelfNavMovieList = [];
            shelfNavIndex = -1;
            shelfNavCopyList = [];
            shelfNavCopyIndex = -1;

            // Build cover image: UMDB cover takes priority, then custom upload, then poster mosaic
            let coverHTML = '';
            if (container.umdb_cover_url) {
                coverHTML = `<img src="${container.umdb_cover_url}" alt="${container.name}" class="boxset-cover-img">`;
            } else if (container.spine_image_type === 'custom' && container.spine_image_url) {
                coverHTML = `<img src="${container.spine_image_url}" alt="${container.name}" class="boxset-cover-img">`;
            } else if (movies && movies.length > 0) {
                // Poster mosaic from first 4 films
                const posters = movies.slice(0, 4).filter(m => m.poster_url);
                if (posters.length >= 2) {
                    coverHTML = `<div class="boxset-poster-mosaic">
                        ${posters.map(m => `<img src="${m.poster_url}" alt="${m.title || ''}">`).join('')}
                    </div>`;
                } else if (posters.length === 1) {
                    coverHTML = `<img src="${posters[0].poster_url}" alt="${container.name}" class="boxset-cover-img">`;
                } else {
                    coverHTML = `<div class="boxset-cover-placeholder" style="background:${container.spine_color || '#667eea'}">📦</div>`;
                }
            } else {
                coverHTML = `<div class="boxset-cover-placeholder" style="background:${container.spine_color || '#667eea'}">📦</div>`;
            }

            // Build film list with navigation support
            const filmCount = movies ? movies.length : 0;
            const boxSetMovieIds = movies ? movies.filter(m => collection.find(c => c.movie.movie_id === m.movie_id)).map(m => m.movie_id) : [];
            const navIdsJson = JSON.stringify(boxSetMovieIds);
            let filmsHTML = '';
            if (movies && movies.length > 0) {
                filmsHTML = movies.map(movie => {
                    const movieId = movie.movie_id;
                    const clickable = collection.find(c => c.movie.movie_id === movieId);
                    const onclick = clickable ? `onclick="App.boxSetNavList=[]; App.viewMovieDetailsWithNav(${movieId}, ${navIdsJson});"` : '';
                    const cursorStyle = clickable ? 'cursor:pointer' : '';
                    return `
                    <div class="boxset-film-row" ${onclick} style="${cursorStyle}" title="${clickable ? 'View movie details' : ''}">
                        ${movie.poster_url
                            ? `<img src="${movie.poster_url}" alt="${movie.display_title || movie.title}" class="boxset-film-thumb">`
                            : `<div class="boxset-film-thumb boxset-film-thumb-empty">🎬</div>`}
                        <div class="boxset-film-info">
                            <div class="boxset-film-title">${movie.display_title || movie.title}</div>
                            <div class="boxset-film-meta">${movie.year || ''}${movie.director ? ` · ${movie.director}` : ''}${movie.disc_label ? ` · ${movie.disc_label.replace(/:\s*.+$/, '').trim()}` : ''}</div>
                        </div>
                        ${!movie.is_present ? '<span class="boxset-film-missing">Missing</span>' : ''}
                    </div>`;
                }).join('');
            } else {
                filmsHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 1rem 0;">No movies in this box set yet.</p>';
            }

            const content = document.getElementById('movieDetailContent');
            content.innerHTML = `
                <div class="movie-detail-layout">
                    <div class="movie-detail-poster">
                        ${coverHTML}
                        <div style="text-align:center; margin-top:0.75rem;">
                            <button class="btn btn-secondary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="event.stopPropagation(); App._initCropCanvasEvents(); App.showCoverUpload(${containerId});">
                                📸 Change Cover
                            </button>
                        </div>
                    </div>
                    <div class="movie-detail-info">
                        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; min-width: 0;">
                            <h2 style="margin: 0; min-width: 0; word-wrap: break-word; overflow-wrap: break-word; flex: 1 1 auto;">${container.name}</h2>
                            ${container.umdb_boxset_id ? `<span class="umdb-link-badge" title="Linked: ${container.umdb_boxset_id}">UMDB</span>` : ''}
                            <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                                <button class="btn-icon" onclick="App.editBoxSet()" title="Edit Box Set">✏️</button>
                                <button class="btn-icon" onclick="App.deleteBoxSet()" title="Delete Box Set" style="color: #ff6b6b;">🗑️</button>
                            </div>
                        </div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
                            ${container.umdb_boxset_id
                                ? `<button class="btn-sm btn-umdb-sm" onclick="App.syncBoxSetFromUmdb(${containerId})" title="Re-pull cover and data from UMDB">↺ Sync from UMDB</button>
                                   <button class="btn-sm btn-umdb-sm" onclick="App.backfillBoxSetReleases(${containerId})" title="Create PhysicalCopy records on UMDB for each film in this box set">⚙ Fix Releases</button>
                                   ${container.spine_image_type === 'custom' && container.spine_image_url ? `<button class="btn-sm btn-umdb-sm" onclick="App.pushBoxSetCoverToUmdb(${containerId})" title="Upload your local cover photo to UMDB">📷 Push Cover</button>` : ''}
                                   <button class="btn-sm" onclick="App.unlinkBoxSetFromUmdb(${containerId})" title="Remove UMDB link" style="font-size:0.75rem; opacity:0.6;">Unlink</button>`
                                : `<button class="btn-sm btn-umdb-sm" onclick="App.pushBoxSetToUmdb(${containerId})" title="Push this box set to UMDB">↑ Push to UMDB</button>`
                            }
                        </div>
                        ${container.umdb_boxset_id ? `<div style="margin-top:0.4rem; font-size:0.75rem; color:rgba(255,255,255,0.45); font-family:monospace; cursor:pointer; user-select:all;" onclick="navigator.clipboard.writeText('${container.umdb_boxset_id}').then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='${container.umdb_boxset_id}'},1500)})" title="Click to copy UMDB box set ID">${container.umdb_boxset_id}</div>` : ''}
                        <div class="movie-detail-meta">
                            <span>${container.format || 'Box Set'}</span>
                            ${container.edition ? `<span>${container.edition}</span>` : ''}
                            ${container.condition ? `<span>${container.condition}</span>` : ''}
                            <span>${filmCount} film${filmCount !== 1 ? 's' : ''}</span>
                        </div>
                        ${container.spine_label ? `<div style="color: rgba(255,255,255,0.5); font-size:0.9rem;">Spine: ${container.spine_label}</div>` : ''}

                        <div class="movie-detail-section" style="margin-top:1.25rem;">
                            <h3>Films in this Box Set</h3>
                            <div class="boxset-film-list">
                                ${filmsHTML}
                            </div>
                        </div>

                        <div id="container-components-section" class="movie-detail-section" style="margin-top:1.25rem;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
                                <h3 style="margin:0;">What's in the Box</h3>
                                <button class="btn-sm" onclick="App.addContainerComponent(${containerId})" title="Manually add a component" style="font-size:0.75rem;">+ Add</button>
                            </div>
                            <div id="container-components-list" style="margin-top:0.75rem;">
                                <p style="color:rgba(255,255,255,0.4); font-size:0.85rem;">Loading components…</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Close the shelf contents modal if it's open (prevents stacking)
            document.getElementById('shelfContentsModal').classList.remove('active');

            document.getElementById('movieDetailModal').classList.add('active');

            // Show box set nav arrows if we have a nav list
            _updateBoxSetNavUI();

            // Asynchronously load component checklist
            _loadContainerComponents(containerId);
        } catch (error) {
            console.error('Failed to load box set details:', error);
            showToast('Failed to load box set details', 'error');
        }
    }

    // ── Container component checklist ──────────────────────────────────────────

    const _containerCompTypeIcons = {
        disc: '💿', booklet: '📖', slipcover: '🗂️', poster: '🖼️',
        art_cards: '🃏', digital_code: '💻', case: '📦', outer_case: '📦',
        insert: '📄', other: '📌'
    };

    async function _loadContainerComponents(containerId) {
        const listEl = document.getElementById('container-components-list');
        if (!listEl) return;
        try {
            const data = await apiCall('get_container_components', { container_id: containerId });
            const components = data.components || [];

            if (components.length === 0) {
                listEl.innerHTML = `<p style="color:rgba(255,255,255,0.4); font-size:0.85rem;">No components defined.
                    ${currentContainer && currentContainer.umdb_boxset_id
                        ? ' Sync from UMDB to auto-populate.'
                        : ' Use "+ Add" to build your checklist.'}</p>`;
                return;
            }

            const presentCount = components.filter(c => c.is_present == 1).length;

            listEl.innerHTML = `
                <div style="font-size:0.8rem; color:rgba(255,255,255,0.5); margin-bottom:0.6rem;">
                    <span id="container-comp-summary">${presentCount} of ${components.length}</span> items present
                </div>
                <div class="component-checklist">
                    ${components.map(comp => {
                        const icon = _containerCompTypeIcons[comp.component_type] || '📌';
                        const present = comp.is_present == 1;
                        return `
                        <div class="component-item ${present ? 'component-present' : 'component-missing'}"
                             id="ccomp-item-${comp.container_component_id}">
                            <div class="component-item-header">
                                <label class="component-toggle">
                                    <input type="checkbox" ${present ? 'checked' : ''}
                                        onchange="App.toggleContainerComponent(${containerId}, ${comp.container_component_id}, this.checked)">
                                    <span class="component-toggle-label">
                                        <span class="component-icon">${icon}</span>
                                        ${comp.component_name}
                                        ${comp.required == 0 ? '<span style="font-size:0.7rem;opacity:0.5;">(optional)</span>' : ''}
                                    </span>
                                </label>
                                <button class="btn-icon" onclick="App.deleteContainerComponent(${containerId}, ${comp.container_component_id})"
                                        title="Remove component" style="font-size:0.75rem; opacity:0.4;">✕</button>
                            </div>
                            <div class="component-item-details" style="${present ? '' : 'opacity:0.4;'}">
                                <select class="form-control component-condition"
                                        onchange="App.updateContainerComponentCondition(${containerId}, ${comp.container_component_id}, this.value)"
                                        data-comp-id="${comp.container_component_id}">
                                    ${['Mint','Like New','Good','Fair','Poor'].map(c =>
                                        `<option value="${c}" ${comp.user_condition === c ? 'selected' : ''}>${c}</option>`
                                    ).join('')}
                                </select>
                                ${comp.description ? `<span class="component-desc">${comp.description}</span>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
        } catch (e) {
            console.error('Failed to load container components:', e);
            if (listEl) listEl.innerHTML = '<p style="color:rgba(255,100,100,0.6); font-size:0.85rem;">Failed to load components.</p>';
        }
    }

    async function toggleContainerComponent(containerId, componentId, checked) {
        const isPresent = checked ? 1 : 0;
        const item = document.getElementById(`ccomp-item-${componentId}`);
        const details = item?.querySelector('.component-item-details');
        if (item) {
            item.classList.toggle('component-present', !!isPresent);
            item.classList.toggle('component-missing', !isPresent);
        }
        if (details) details.style.opacity = isPresent ? '' : '0.4';

        // Update summary count
        const checklist = document.querySelector('#container-components-list .component-checklist');
        if (checklist) {
            const total = checklist.querySelectorAll('.component-item').length;
            const present = checklist.querySelectorAll('.component-present').length;
            const summary = document.getElementById('container-comp-summary');
            if (summary) summary.textContent = `${present} of ${total}`;
        }

        try {
            const condition = item?.querySelector('.component-condition')?.value || 'Good';
            await apiCall('update_copy_container_component', {
                container_id: containerId,
                container_component_id: componentId,
                is_present: isPresent,
                condition
            });
        } catch (e) {
            console.error('Failed to update container component:', e);
            showToast('Failed to update component', 'error');
        }
    }

    async function updateContainerComponentCondition(containerId, componentId, condition) {
        const isPresent = document.getElementById(`ccomp-item-${componentId}`)
            ?.querySelector('input[type="checkbox"]')?.checked ? 1 : 0;
        try {
            await apiCall('update_copy_container_component', {
                container_id: containerId,
                container_component_id: componentId,
                is_present: isPresent,
                condition
            });
        } catch (e) {
            console.error('Failed to update component condition:', e);
            showToast('Failed to update condition', 'error');
        }
    }

    async function addContainerComponent(containerId) {
        // Build inline add form in-place below the section heading
        const listEl = document.getElementById('container-components-list');
        if (!listEl) return;

        // Avoid double-adding the form
        if (document.getElementById('add-comp-inline-form')) return;

        const compTypes = [
            ['disc','Disc'], ['booklet','Booklet'], ['slipcover','Slipcover'],
            ['poster','Poster'], ['art_cards','Art Cards'], ['digital_code','Digital Code'],
            ['case','Case (Steelbook/Digipak)'], ['outer_case','Outer Case (Slipcase)'],
            ['insert','Insert'], ['other','Other'],
        ];

        const form = document.createElement('div');
        form.id = 'add-comp-inline-form';
        form.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;padding:0.6rem;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:0.75rem;';
        form.innerHTML = `
            <select id="add-comp-type" class="form-control" style="font-size:0.85rem;">
                ${compTypes.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
            <input id="add-comp-name" type="text" class="form-control" placeholder="Component name (e.g. 40-page booklet)" style="font-size:0.85rem;">
            <div style="display:flex;gap:0.4rem;">
                <button class="btn btn-sm" id="add-comp-save" style="font-size:0.8rem;">Add</button>
                <button class="btn btn-ghost btn-sm" id="add-comp-cancel" style="font-size:0.8rem;">Cancel</button>
            </div>`;
        listEl.insertBefore(form, listEl.firstChild);

        document.getElementById('add-comp-name').focus();

        document.getElementById('add-comp-cancel').onclick = () => {
            form.remove();
        };
        document.getElementById('add-comp-save').onclick = async () => {
            const type = document.getElementById('add-comp-type').value;
            const name = document.getElementById('add-comp-name').value.trim();
            if (!name) { showToast('Please enter a component name', 'error'); return; }
            try {
                await apiCall('add_container_component', {
                    container_id: containerId,
                    component_type: type,
                    component_name: name,
                    required: 1
                });
                showToast('Component added', 'success');
                _loadContainerComponents(containerId);
            } catch (e) {
                showToast('Failed to add component', 'error');
            }
        };
    }

    async function deleteContainerComponent(containerId, componentId) {
        try {
            await apiCall('delete_container_component', { component_id: componentId });
            _loadContainerComponents(containerId);
        } catch (e) {
            showToast('Failed to remove component', 'error');
        }
    }

    // ── End container component checklist ──────────────────────────────────────

    // Close box set details (now rendered inside movie detail modal)
    function closeBoxSetDetails() {
        document.getElementById('boxSetDetailsModal').classList.remove('active');
        document.getElementById('movieDetailModal').classList.remove('active');

        // DON'T clear currentContainerId if we're in the middle of box set creation
        const step2 = document.getElementById('boxSetStep2');
        const isCreating = step2 && step2.style.display !== 'none';

        if (!isCreating) {
            currentContainerId = null;
            currentContainer = null;
        }
    }

    // Show create box set modal (redirect to add tab)
    function showCreateBoxSetModal() {
        switchTab('add');
        showAddBoxSet();
    }

    // Edit box set - opens Step 1 pre-populated for metadata editing, then Step 2 for films
    async function editBoxSet() {
        if (!currentContainerId || !currentContainer) return;

        // Close both possible detail modals
        document.getElementById('boxSetDetailsModal').classList.remove('active');
        document.getElementById('movieDetailModal').classList.remove('active');

        // Switch to Add tab
        switchTab('add');

        // Show box set section
        document.getElementById('addTypeChoice').style.display = 'none';
        document.getElementById('addSingleMovieSection').style.display = 'none';
        document.getElementById('addBoxSetSection').style.display = 'block';

        // Show Step 1 pre-populated with current values
        document.getElementById('boxSetStep1').style.display = 'block';
        document.getElementById('boxSetStep2').style.display = 'none';

        // Pre-populate form fields from current container data
        document.getElementById('boxSetName').value = currentContainer.name || '';
        document.getElementById('boxSetSpineLabel').value = currentContainer.spine_label || '';
        document.getElementById('boxSetFormat').value = currentContainer.format || 'Blu-ray Box Set';
        document.getElementById('boxSetEdition').value = currentContainer.edition || '';
        document.getElementById('boxSetRegion').value = currentContainer.region || 'Region Free';
        document.getElementById('boxSetCondition').value = currentContainer.condition || 'Mint';
        document.getElementById('boxSetSpineType').value = currentContainer.spine_image_type || 'color';
        document.getElementById('boxSetSpineColor').value = currentContainer.spine_color || '#667eea';
        document.getElementById('boxSetNotes').value = currentContainer.notes || '';

        // Ensure custom dropdown values exist before setting them
        _ensureDropdownOption('boxSetFormat', currentContainer.format);
        _ensureDropdownOption('boxSetEdition', currentContainer.edition);

        updateBoxSetSpinePreview();

        // Change the button to "Save Changes" mode
        const actionsDiv = document.getElementById('boxSetStep1').querySelector('.form-actions');
        actionsDiv.innerHTML = `
            <button class="btn" onclick="App.saveBoxSetEdits()">Save Changes & Manage Films →</button>
            <button class="btn btn-ghost" onclick="App.cancelBoxSetEdit()">Cancel</button>
        `;
    }

    // Save edits to box set metadata then move to Step 2
    async function saveBoxSetEdits() {
        const name = document.getElementById('boxSetName').value.trim();
        const spineLabel = document.getElementById('boxSetSpineLabel').value.trim() || name;
        const format = document.getElementById('boxSetFormat').value;
        const edition = document.getElementById('boxSetEdition').value;
        const region = document.getElementById('boxSetRegion').value;
        const condition = document.getElementById('boxSetCondition').value;
        const spineType = document.getElementById('boxSetSpineType').value;
        const spineColor = document.getElementById('boxSetSpineColor').value;
        const notes = document.getElementById('boxSetNotes').value;

        if (!name) {
            showToast('Please enter a box set name', 'error');
            return;
        }

        try {
            await apiCall('update_container', {
                container_id: currentContainerId,
                name,
                spine_label: spineLabel,
                spine_image_type: spineType,
                spine_color: spineColor,
                format,
                edition,
                region,
                condition,
                notes
            });

            // Update local reference
            currentContainer.name = name;
            currentContainer.spine_label = spineLabel;
            currentContainer.format = format;
            currentContainer.edition = edition;
            currentContainer.region = region;
            currentContainer.condition = condition;
            currentContainer.spine_image_type = spineType;
            currentContainer.spine_color = spineColor;
            currentContainer.notes = notes;

            showToast('Box set details updated!', 'success');

            // Now show Step 2 (adding movies)
            document.getElementById('boxSetStep1').style.display = 'none';
            document.getElementById('boxSetStep2').style.display = 'block';

            // Restore Step 1 button to create mode for next time
            _restoreStep1Buttons();

            // Fetch current movies
            const data = await apiCall('get_container_contents', { container_id: currentContainerId });
            const { movies } = data;

            boxSetMovies = movies.map((m, index) => ({
                movie_id: m.movie_id,
                title: m.title,
                year: m.year,
                poster_url: m.poster_url,
                tmdb_id: m.tmdb_id,
                copy_id: m.copy_id,
                disc_number: m.disc_number || (index + 1)
            }));

            const createdNameEl = document.getElementById('boxSetCreatedName');
            if (createdNameEl) {
                createdNameEl.textContent = `📦 ${name} (Editing)`;
            }

            const searchInput = document.getElementById('boxSetMovieSearch');
            const searchResults = document.getElementById('boxSetSearchResults');
            if (searchInput) searchInput.value = '';
            if (searchResults) searchResults.innerHTML = '';

            updateBoxSetMoviesList();
        } catch (error) {
            console.error('Failed to update box set:', error);
            showToast('Failed to save changes', 'error');
        }
    }

    // Cancel edit and go back to box set detail
    function cancelBoxSetEdit() {
        _restoreStep1Buttons();
        showAddTypeChoice();
        if (currentContainerId) {
            showBoxSetDetails(currentContainerId);
        }
    }

    // Restore Step 1 buttons to default create mode
    function _restoreStep1Buttons() {
        const actionsDiv = document.getElementById('boxSetStep1').querySelector('.form-actions');
        actionsDiv.innerHTML = `
            <button class="btn" onclick="App.createBoxSetAndAddMovies()">Next: Add Movies →</button>
            <button class="btn btn-ghost" onclick="App.showAddTypeChoice()">Cancel</button>
        `;
    }

    // Handle "Custom..." dropdown selection — prompt user for value
    function onCustomDropdown(selectEl) {
        if (selectEl.value !== '__custom__') return;

        const label = selectEl.previousElementSibling?.textContent || 'value';
        const custom = prompt(`Enter a custom ${label.replace(' *', '').toLowerCase()}:`);

        if (custom && custom.trim()) {
            const val = custom.trim();
            // Add the custom option before the "Custom..." option
            const customOpt = selectEl.querySelector('option[value="__custom__"]');
            const newOpt = document.createElement('option');
            newOpt.value = val;
            newOpt.textContent = val;
            selectEl.insertBefore(newOpt, customOpt);
            selectEl.value = val;
        } else {
            // Cancelled — revert to first option
            selectEl.selectedIndex = 0;
        }
    }

    // Ensure a value exists in a dropdown, add it if not
    function _ensureDropdownOption(selectId, value) {
        if (!value) return;
        const select = document.getElementById(selectId);
        const exists = Array.from(select.options).some(opt => opt.value === value);
        if (!exists) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
            select.value = value;
        }
    }

    // Delete box set
    async function deleteBoxSet() {
        if (!currentContainerId) return;

        if (!confirm('Are you sure you want to delete this box set? The movies inside will not be deleted.')) {
            return;
        }

        try {
            await apiCall('delete_container', { container_id: currentContainerId });
            showToast('Box set deleted successfully', 'success');
            closeBoxSetDetails();
            loadBoxSets();
        } catch (error) {
            console.error('Failed to delete box set:', error);
            showToast('Failed to delete box set', 'error');
        }
    }

    /**
 * CineShelf v3.0 - Groups Feature Addition
 * ADD THIS TO THE END OF YOUR app.js FILE (before the final return statement)
 */

// ========================================
// GROUPS STATE
// ========================================

let userGroups = [];
let currentGroupId = null;
let currentGroupsTab = 'manage';
let familyMembers = [];

// ========================================
// GROUPS TAB MANAGEMENT
// ========================================

function switchGroupsTab(tabName) {
    currentGroupsTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.groups-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.groupsTab === tabName) {
            tab.classList.add('active');
        }
    });

    // Hide all subtabs
    document.querySelectorAll('.groups-subtab').forEach(subtab => {
        subtab.classList.remove('active');
    });

    // Show selected subtab
    const subtabMap = {
        'manage': 'manageGroups',
        'family': 'familyCollection',
        'ratings': 'ratingsPanel',
        'wishlist': 'groupWishlist',
        'borrowed': 'borrowedItems',
        'lent': 'lentItems'
    };

    const subtabId = subtabMap[tabName];
    const subtabElement = document.getElementById(subtabId);

    if (subtabElement) {
        subtabElement.classList.add('active');
    } else {
        console.error(`Subtab element not found: ${subtabId}`);
        return;
    }

    // Load data for this tab
    switch(tabName) {
        case 'manage':
            loadGroups();
            break;
        case 'family':
            // Check if group is already selected
            const familyGroupSelect = document.getElementById('familyGroupSelect');
            if (familyGroupSelect && familyGroupSelect.value) {
                loadFamilyCollection(familyGroupSelect.value);
            }
            break;
        case 'wishlist':
            // Check if group is already selected
            const wishlistGroupSelect = document.getElementById('groupWishlistSelect');
            if (wishlistGroupSelect && wishlistGroupSelect.value) {
                loadGroupWishlist(wishlistGroupSelect.value);
            }
            break;
        case 'ratings':
            ratingsTabInit();
            break;
        case 'borrowed':
            loadBorrowedItems();
            break;
        case 'lent':
            loadLentItems();
            break;
    }
}

// ========================================
// MANAGE GROUPS
// ========================================

async function loadGroups() {
    try {
        const groupSelector = document.getElementById('currentGroup');
        const familyGroupSelect = document.getElementById('familyGroupSelect');
        const wishlistGroupSelect = document.getElementById('groupWishlistSelect');

        if (!groupSelector || !familyGroupSelect || !wishlistGroupSelect) {
            return; // UI not ready
        }
        
        const groupsData = await apiCall('list_groups');  // Returns data or throws
        userGroups = groupsData || [];
        
        if (userGroups.length > 0) {
            groupSelector.innerHTML = '<option value="">My Collection</option>';
            familyGroupSelect.innerHTML = '<option value="">Select a group...</option>';
            wishlistGroupSelect.innerHTML = '<option value="">Select a group...</option>';

            userGroups.forEach(group => {
                groupSelector.innerHTML += `<option value="${group.id}">${group.name}</option>`;
                familyGroupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
                wishlistGroupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
            });

            // Auto-select the first group so the user doesn't have to pick manually
            if (userGroups.length > 0) {
                const firstId = userGroups[0].id;
                familyGroupSelect.value = firstId;
                wishlistGroupSelect.value = firstId;
            }
        }
        
        renderGroupsList();
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

function switchGroup(groupId) {
    // Convert to number or null
    currentGroupId = groupId ? parseInt(groupId) : null;
    
    console.log('Switching to group:', currentGroupId || 'My Collection');
    
    // Update dropdown value
    const selector = document.getElementById('currentGroup');
    if (selector) {
        selector.value = groupId || '';
    }
    
    // If on Movies tab, reload collection
    const currentTab = document.querySelector('.tab.active')?.dataset.tab;
    if (currentTab === 'movies') {
        loadCollection();
    }
    
    // Show toast
    if (currentGroupId) {
        const group = userGroups.find(g => g.id === currentGroupId);
        if (group) {
            showToast(`Switched to ${group.name}`, 'info');
        }
    } else {
        showToast('Viewing your personal collection', 'info');
    }
}

function renderGroupsList() {
    const container = document.getElementById('groupsList');
    const emptyState = document.getElementById('emptyGroups');
    
    // Safety check - elements may not exist if HTML not updated yet
    if (!container || !emptyState) {
        return;
    }
    
    if (userGroups.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = userGroups.map(group => `
        <div class="group-card">
            <div class="group-card-header">
                <h3>${group.name}</h3>
                <span class="group-badge">${group.role === 'admin' ? '👑 Admin' : '👤 Member'}</span>
            </div>
            ${group.description ? `<p class="group-description">${group.description}</p>` : ''}
            <div class="group-stats">
                <span>👥 ${group.member_count} member${group.member_count !== 1 ? 's' : ''}</span>
                <span>Created by ${group.creator_name}</span>
            </div>
            <button class="btn-secondary" onclick="App.showGroupDetail(${group.id})">
                Manage Group
            </button>
        </div>
    `).join('');
}

function showCreateGroupModal() {
    document.getElementById('createGroupModal').classList.add('active');
    document.getElementById('groupName').value = '';
    document.getElementById('groupDescription').value = '';
}

function closeCreateGroupModal() {
    document.getElementById('createGroupModal').classList.remove('active');
}

async function createGroup() {
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();
    
    if (!name) {
        showToast('Group name is required', 'error');
        return;
    }
    
    try {
        await apiCall('create_group', { name, description });  // Returns data or throws
        showToast('Group created successfully!', 'success');
        closeCreateGroupModal();
        await loadGroups();
    } catch (error) {
        showToast('Failed to create group', 'error');
    }
}

async function showGroupDetail(groupId) {
    try {
        const members = await apiCall('list_group_members', { group_id: groupId });
        const group = userGroups.find(g => g.id === groupId);
        const isAdmin = group && group.role === 'admin';
        
        let content = `
            <div class="group-members-section">
                <h3>Members (${members.length})</h3>
                <div class="members-list">
                    ${members.map(member => `
                        <div class="member-item">
                            <div class="member-info">
                                <span class="member-name">${member.display_name || member.username || member.email}</span>
                                <span class="member-badge">${member.role === 'admin' ? '👑 Admin' : '👤 Member'}</span>
                                <span class="member-stat">${member.copy_count} movie${member.copy_count !== 1 ? 's' : ''}</span>
                            </div>
                            ${isAdmin && member.role !== 'admin' ? `
                                <button class="btn-danger-sm" onclick="App.removeMember(${groupId}, ${member.id}, '${(member.display_name || member.username || member.email).replace(/'/g, "\\'")}')">
                                    Remove
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        if (isAdmin) {
            content += `
                <div class="add-member-section">
                    <h3>Invite Members</h3>
                    <p style="color: rgba(255,255,255,0.7); font-size: 0.9rem; margin-bottom: 1rem;">
                        Share this link with anyone you want to invite to the group:
                    </p>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <input type="text" id="groupInviteLink" readonly style="flex:1;background:rgba(255,255,255,0.1);cursor:text;" placeholder="Generating link...">
                        <button class="btn" onclick="App.copyGroupInviteLink()" id="copyInviteBtn">📋 Copy</button>
                        <button class="btn btn-secondary" onclick="App.generateNewInviteLink(${groupId})" title="Generate new link">🔄</button>
                    </div>
                </div>
            `;
        }
        
        content += `
            <div class="group-actions">
                ${!isAdmin ? `
                    <button class="btn-danger" onclick="App.leaveGroup(${groupId})">
                        Leave Group
                    </button>
                ` : ''}
            </div>
        `;
        
        document.getElementById('groupDetailName').textContent = group.name;
        document.getElementById('groupDetailContent').innerHTML = content;
        document.getElementById('groupDetailModal').classList.add('active');

        // If user is admin, generate invite link
        if (isAdmin) {
            generateGroupInviteLink(groupId);
        }
    } catch (error) {
        showToast('Failed to load group details', 'error');
    }
}

function closeGroupDetail() {
    document.getElementById('groupDetailModal').classList.remove('active');
}

async function generateGroupInviteLink(groupId) {
    try {
        const result = await apiCall('create_group_invite', { group_id: groupId });
        const inviteLink = `${window.location.origin}/join-group.html?token=${result.invite_token}`;

        const input = document.getElementById('groupInviteLink');
        if (input) {
            input.value = inviteLink;
            input.dataset.link = inviteLink;
        }
    } catch (error) {
        console.error('Failed to generate invite link:', error);
        showToast('Failed to generate invite link', 'error');
    }
}

async function generateNewInviteLink(groupId) {
    if (!confirm('Generate a new invite link? The old link will remain valid until it expires.')) {
        return;
    }
    await generateGroupInviteLink(groupId);
    showToast('Invite link refreshed!', 'success');
}

function copyGroupInviteLink() {
    const input = document.getElementById('groupInviteLink');
    if (!input || !input.value) {
        showToast('No invite link available', 'error');
        return;
    }

    input.select();
    input.setSelectionRange(0, 99999); // For mobile
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Invite link copied to clipboard!', 'success');

        // Visual feedback
        const btn = document.getElementById('copyInviteBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied';
            setTimeout(() => btn.textContent = originalText, 2000);
        }
    }).catch(() => {
        showToast('Failed to copy link', 'error');
    });
}

async function addMemberToGroup(groupId) {
    const username = document.getElementById('newMemberUsername').value.trim();
    
    if (!username) {
        showToast('Username is required', 'error');
        return;
    }
    
    try {
        await apiCall('add_group_member', { group_id: groupId, username: username });
        showToast('Member added successfully!', 'success');
        document.getElementById('newMemberUsername').value = '';
        await showGroupDetail(groupId);
    } catch (error) {
        showToast(error.message || 'Failed to add member', 'error');
    }
}

async function removeMember(groupId, userId, username) {
    if (!confirm(`Remove ${username} from this group?`)) return;
    
    try {
        await apiCall('remove_group_member', { group_id: groupId, user_id: userId });
        showToast('Member removed', 'success');
        await showGroupDetail(groupId);
    } catch (error) {
        showToast('Failed to remove member', 'error');
    }
}

async function leaveGroup(groupId) {
    if (!confirm('Are you sure you want to leave this group?')) return;
    
    try {
        const userId = await getCurrentUserId();
        await apiCall('remove_group_member', { group_id: groupId, user_id: userId });
        showToast('Left group', 'success');
        closeGroupDetail();
        await loadGroups();
    } catch (error) {
        showToast('Failed to leave group', 'error');
    }
}

// ========================================
// FAMILY COLLECTION VIEW
// ========================================

// ========================================
// FAMILY COLLECTION VIEW - FIXED
// ========================================

async function loadFamilyCollection(groupId) {
    if (!groupId) {
        document.getElementById('emptyFamilyCollection').style.display = 'flex';
        document.getElementById('familyCollectionGrid').innerHTML = '';
        document.getElementById('familyMemberFilter').style.display = 'none';
        return;
    }
    
    currentGroupId = groupId;
    
    try {
        const movies = await apiCall('list_group_collection', { group_id: groupId });
        const members = await apiCall('list_group_members', { group_id: groupId });
        
        familyMembers = members || [];
        
        const filter = document.getElementById('familyMemberFilter');
        filter.style.display = 'block';
        filter.innerHTML = '<option value="all">All Members</option>';
        familyMembers.forEach(member => {
            filter.innerHTML += `<option value="${member.id}">${member.username}</option>`;
        });
        
        renderFamilyCollection(movies || []);
    } catch (error) {
        showToast('Failed to load family collection', 'error');
    }
}

function renderFamilyCollection(movies) {
    // Save data for re-rendering when view changes
    window.familyCollectionData = movies;

    const grid = document.getElementById('familyCollectionGrid');
    const emptyState = document.getElementById('emptyFamilyCollection');

    if (movies.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';

    // Group by movie_id
    const grouped = {};
    movies.forEach(movie => {
        const movieId = movie.movie_id;
        if (!grouped[movieId]) {
            grouped[movieId] = {
                movie: movie,
                copies: []
            };
        }
        grouped[movieId].copies.push(movie);
    });

    const groupedMovies = Object.values(grouped);

    // Sort alphabetically (use display_title if available)
    groupedMovies.sort((a, b) => {
        const titleA = (a.movie.display_title || a.movie.title || '').toLowerCase();
        const titleB = (b.movie.display_title || b.movie.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
    });

    grid.innerHTML = groupedMovies.map(group => {
        const movie = group.movie;
        const copies = group.copies;
        const copyCount = copies.length;

        const posterUrl = movie.poster_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect fill="#333" width="200" height="300"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="16">No Poster</text></svg>';
        const displayTitle = movie.display_title || movie.title || 'Unknown';
        const safeTitle = displayTitle.replace(/"/g, '&quot;');
        const mediaIcon = movie.media_type === 'tv' ? '📺' : '🎬';
        const certColor = movie.certification ? getCertColor(movie.certification) : '#666';
        const genreEmojis = getGenreEmojis(movie.genre);
        const runtimeFormatted = formatRuntime(movie.runtime);

        // Conditional rendering based on currentView
        if (currentView === 'list') {
            // Wishlist-style for list view (always-visible metadata)
            return `
            <div class="movie-card collection-card" data-movie-id="${movie.movie_id}" onclick="App.viewGroupMovieDetails(${movie.movie_id})" style="cursor: pointer;">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${copyCount > 1 ? `<div class="copy-count-badge">${copyCount} copies</div>` : ''}
                </div>
                <div class="movie-info">
                    <h3 class="movie-title">${mediaIcon} ${safeTitle}</h3>
                    <div class="movie-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge" style="--cert-color: ${certColor};">${movie.certification}</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${movie.rating.toFixed(1)}</span>` : ''}
                        ${runtimeFormatted ? `<span>${runtimeFormatted}</span>` : ''}
                    </div>
                    ${movie.director ? `<div class="movie-director">🎬 ${movie.director}</div>` : ''}
                    ${genreEmojis ? `<div class="movie-genres">${genreEmojis}</div>` : ''}
                </div>
                <div class="movie-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); App.viewGroupMovieDetails(${movie.movie_id});" title="Details">👁️</button>
                </div>
            </div>
            `;
        } else {
            // Netflix-style for grid and compact views (hover overlay)
            return `
            <div class="movie-card" onclick="App.viewGroupMovieDetails(${movie.movie_id})" data-movie-id="${movie.movie_id}">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${copyCount > 1 ? `<div class="copy-count-badge">${copyCount} copies</div>` : ''}
                </div>

                <div class="hover-overlay">
                    <div class="hover-title">${safeTitle}</div>
                    <div class="hover-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge-hover" style="--cert-color: ${certColor};">${movie.certification}</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${movie.rating.toFixed(1)}</span>` : ''}
                        ${runtimeFormatted ? `<span>${runtimeFormatted}</span>` : ''}
                    </div>
                    ${genreEmojis ? `<div class="genre-emojis">${genreEmojis}</div>` : ''}
                    ${movie.director ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">🎬 ${movie.director}</div>` : ''}
                    <div class="hover-actions">
                        <button class="hover-btn" onclick="event.stopPropagation(); App.viewGroupMovieDetails(${movie.movie_id});">ℹ️</button>
                    </div>
                </div>

                <div class="movie-info">
                    <div class="movie-title">${mediaIcon} ${safeTitle}</div>
                </div>
            </div>
            `;
        }
    }).join('');
}


function filterFamilyByMember(memberId) {
    if (!currentGroupId) return;
    
    // Reload collection with filter
    apiCall('list_group_collection', { group_id: currentGroupId }).then(movies => {
        if (memberId === 'all') {
            renderFamilyCollection(movies);
        } else {
            // Filter to only show movies owned by selected member
            const filtered = movies.filter(m => m.owner_id == memberId);
            renderFamilyCollection(filtered);
        }
    });
}

// NEW FUNCTION: View movie details in group context (shows ALL copies from ALL members)
async function viewGroupMovieDetails(movieId) {
    try {
        // Get all copies for this movie in the current group
        const copies = await apiCall('list_group_collection', { 
            group_id: currentGroupId 
        });
        
        // Filter to just this movie
        const movieCopies = copies.filter(c => c.movie_id === movieId);
        
        if (movieCopies.length === 0) return;
        
        const movie = movieCopies[0]; // Use first copy for movie data
        
        const content = document.getElementById('movieDetailContent');
        const posterUrl = movie.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\'%3E%3Crect fill=\'%23333\' width=\'300\' height=\'450\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'20\'%3ENo Poster%3C/text%3E%3C/svg%3E';
        
        content.innerHTML = `
            <div class="movie-detail-layout">
                <div class="movie-detail-poster">
                    <img src="${posterUrl}" alt="${movie.title}">
                </div>
                <div class="movie-detail-info">
                    <h2>${movie.title}</h2>
                    <div class="movie-detail-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.runtime ? `<span>${movie.runtime} min</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${movie.rating.toFixed(1)}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge" style="--cert-color: ${getCertColor(movie.certification)};">${movie.certification}</span>` : ''}
                    </div>
                    ${movie.genre ? `<div class="movie-detail-genre">${movie.genre}</div>` : ''}
                    ${movie.director ? `<div class="movie-detail-director">🎬 Directed by ${movie.director}</div>` : ''}
                    ${movie.overview ? `<p class="movie-detail-overview">${movie.overview}</p>` : ''}
                    
                    <h3>Group Copies (${movieCopies.length})</h3>
                    <div class="copies-summary">
                        ${movieCopies.map((copy, i) => {
                            const isYou = copy.owner_name === currentUser;
                            const isBorrowed = copy.borrow_id !== null;
                            return `
                                <div class="copy-summary-item" style="background: ${isYou ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255,255,255,0.05)'}; border-left: 3px solid ${isYou ? '#4caf50' : '#667eea'};">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <strong>${copy.owner_name}${isYou ? ' (You)' : ''}</strong>
                                            <div style="font-size: 0.9rem; color: rgba(255,255,255,0.7); margin-top: 0.25rem;">
                                                ${copy.format}${copy.edition ? ` - ${copy.edition}` : ''}${copy.condition ? ` (${copy.condition})` : ''}
                                            </div>
                                            ${isBorrowed ? `
                                                <div style="font-size: 0.85rem; color: #ff9800; margin-top: 0.25rem;">
                                                    📥 Currently borrowed
                                                </div>
                                            ` : ''}
                                        </div>
                                        ${!isBorrowed && !isYou ? `
                                            <button class="btn-secondary" onclick="App.borrowMovie(${copy.copy_id}, '${movie.title.replace(/'/g, "\\'")}')">
                                                📥 Borrow
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('movieDetailModal').classList.add('active');
        
    } catch (error) {
        console.error('Failed to load group movie details:', error);
        showToast('Failed to load movie details', 'error');
    }
}

// ========================================
// BORROWING
// ========================================

async function borrowMovie(copyId, title) {
    const dueDate = prompt(`Borrow "${title}"\n\nDue date (YYYY-MM-DD, optional):`);
    if (dueDate === null) return;
    
    try {
        await apiCall('borrow_copy', { copy_id: copyId, due_date: dueDate || null, notes: '' });
        showToast('Movie borrowed!', 'success');
        if (currentGroupId) await loadFamilyCollection(currentGroupId);
    } catch (error) {
        showToast(error.message || 'Failed to borrow movie', 'error');
    }
}

async function returnMovie(borrowId, title) {
    if (!confirm(`Mark "${title}" as returned?`)) return;

    try {
        await apiCall('return_copy', { borrow_id: borrowId });
        showToast('Movie returned!', 'success');
        if (currentGroupId) await loadFamilyCollection(currentGroupId);
        if (currentGroupsTab === 'lent') await loadLentItems();
    } catch (error) {
        showToast('Failed to return movie', 'error');
    }
}

async function loadGroupWishlist(groupId) {
    console.log('loadGroupWishlist called with groupId:', groupId);

    const grid = document.getElementById('groupWishlistGrid');
    const emptyState = document.getElementById('emptyGroupWishlist');
    const memberFilter = document.getElementById('wishlistMemberFilter');

    if (!grid || !emptyState) {
        console.error('Required DOM elements not found for group wishlist');
        return;
    }

    if (!groupId) {
        grid.innerHTML = '';
        emptyState.style.display = 'flex';
        if (memberFilter) memberFilter.style.display = 'none';
        return;
    }

    try {
        // Get group members
        console.log('Fetching group data...');
        const groupData = await apiCall('get_group', { group_id: groupId });
        const members = groupData.members || [];
        console.log('Group members:', members);

        if (members.length === 0) {
            grid.innerHTML = '';
            emptyState.style.display = 'flex';
            showToast('This group has no members', 'info');
            return;
        }

        // Load wishlist for each member
        showToast('Loading group wishlists...', 'info');
        const allWishlists = [];

        for (const member of members) {
            try {
                console.log(`Loading wishlist for ${member.username} (ID: ${member.user_id})`);
                const wishlistData = await apiCall('get_user_wishlist', { user_id: member.user_id });
                console.log(`Wishlist data for ${member.username}:`, wishlistData);

                if (wishlistData && wishlistData.length > 0) {
                    wishlistData.forEach(item => {
                        allWishlists.push({
                            ...item,
                            member_name: member.username,
                            member_id: member.user_id
                        });
                    });
                }
            } catch (error) {
                console.error(`Failed to load wishlist for ${member.username}:`, error);
                showToast(`Failed to load wishlist for ${member.username}`, 'warning');
            }
        }

        console.log('Total wishlist items loaded:', allWishlists.length);

        // Update member filter dropdown
        if (memberFilter) {
            memberFilter.innerHTML = '<option value="all">All Members</option>';
            members.forEach(member => {
                memberFilter.innerHTML += `<option value="${member.user_id}">${member.username}</option>`;
            });
            memberFilter.style.display = 'inline-block';
        }

        // Store and render
        window.currentGroupWishlist = allWishlists;
        renderGroupWishlist(allWishlists);

        if (allWishlists.length > 0) {
            showToast(`Loaded ${allWishlists.length} wishlist items`, 'success');
        } else {
            showToast('No wishlist items found for this group', 'info');
        }

    } catch (error) {
        console.error('Error loading group wishlist:', error);
        showToast(`Failed to load group wishlist: ${error.message}`, 'error');
        grid.innerHTML = '';
        emptyState.style.display = 'flex';
    }
}

function renderGroupWishlist(wishlists) {
    console.log('renderGroupWishlist called with', wishlists.length, 'items');

    const grid = document.getElementById('groupWishlistGrid');
    const emptyState = document.getElementById('emptyGroupWishlist');

    if (!grid || !emptyState) {
        console.error('Required DOM elements not found for rendering group wishlist');
        return;
    }

    if (!wishlists || wishlists.length === 0) {
        console.log('No wishlist items to render, showing empty state');
        grid.innerHTML = '';
        emptyState.style.display = 'flex';
        grid.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    grid.style.display = 'grid';

    // Group by TMDB ID
    const movieMap = new Map();
    wishlists.forEach(item => {
        const key = item.tmdb_id;
        if (!movieMap.has(key)) {
            movieMap.set(key, {
                ...item,
                members: [{ name: item.member_name, id: item.member_id }]
            });
        } else {
            const existing = movieMap.get(key);
            if (!existing.members.find(m => m.id === item.member_id)) {
                existing.members.push({ name: item.member_name, id: item.member_id });
            }
        }
    });

    console.log('Grouped into', movieMap.size, 'unique movies');

    // Convert to array and sort by most wanted
    const movies = Array.from(movieMap.values()).sort((a, b) => b.members.length - a.members.length);

    grid.innerHTML = movies.map(movie => {
        const posterUrl = movie.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
        const safeTitle = (movie.title || 'Unknown Title').replace(/"/g, '&quot;');
        const membersList = movie.members.map(m => m.name).join(', ');
        const memberCount = movie.members.length;
        const memberLabel = memberCount === 1 ? '1 member' : `${memberCount} members`;
        const year = movie.release_date ? movie.release_date.substring(0, 4) : (movie.year || 'N/A');

        // Conditional rendering based on currentView
        if (currentView === 'list') {
            // Wishlist-style for list view (always-visible metadata)
            return `
            <div class="movie-card wishlist-card" data-member-ids="${movie.members.map(m => m.id).join(',')}">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${memberCount > 1 ? `<div class="wishlist-badge">❤️ ${memberLabel}</div>` : ''}
                </div>
                <div class="movie-info">
                    <h3 class="movie-title">${safeTitle}</h3>
                    <div class="movie-meta">
                        ${year !== 'N/A' ? `<span>${year}</span>` : ''}
                    </div>
                    <p class="wishlist-members">${membersList}</p>
                </div>
            </div>
            `;
        } else {
            // Netflix-style for grid and compact views (hover overlay)
            return `
            <div class="movie-card" data-member-ids="${movie.members.map(m => m.id).join(',')}">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${memberCount > 1 ? `<div class="wishlist-badge">❤️ ${memberLabel}</div>` : ''}
                </div>

                <div class="hover-overlay">
                    <div class="hover-title">${safeTitle}</div>
                    <div class="hover-meta">
                        ${year !== 'N/A' ? `<span>${year}</span>` : ''}
                    </div>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">${membersList}</div>
                </div>

                <div class="movie-info">
                    <h3 class="movie-title">${safeTitle}</h3>
                </div>
            </div>
            `;
        }
    }).join('');

    console.log('Rendered', movies.length, 'movie cards');
}

function filterWishlistByMember(memberId) {
    console.log('filterWishlistByMember called with memberId:', memberId);

    if (!window.currentGroupWishlist) {
        console.error('No currentGroupWishlist data available');
        return;
    }

    if (memberId === 'all') {
        console.log('Showing all members wishlist');
        renderGroupWishlist(window.currentGroupWishlist);
        return;
    }

    const filtered = window.currentGroupWishlist.filter(item =>
        String(item.member_id) === String(memberId)
    );

    console.log(`Filtered to ${filtered.length} items for member ${memberId}`);
    renderGroupWishlist(filtered);
}

async function loadBorrowedItems() {
    try {
        const items = await apiCall('list_borrowed');
        renderBorrowedList(items || []);
    } catch (error) {
        console.error('Error loading borrowed items:', error);
    }
}

function renderBorrowedList(items) {
    const container = document.getElementById('borrowedList');
    const emptyState = document.getElementById('emptyBorrowed');
    
    if (items.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = items.map(item => {
        const dueDate = item.due_date ? new Date(item.due_date) : null;
        const isOverdue = dueDate && dueDate < new Date();
        
        return `
            <div class="borrow-item ${isOverdue ? 'overdue' : ''}">
                ${item.poster_url ? 
                    `<img src="${item.poster_url}" alt="${item.title}" class="borrow-poster">` : 
                    `<div class="borrow-poster-placeholder">🎬</div>`
                }
                <div class="borrow-info">
                    <h3>${item.title} ${item.year ? `(${item.year})` : ''}</h3>
                    <p>Borrowed from: <strong>${item.owner_name}</strong></p>
                    <p>Format: ${item.format}${item.edition ? ` - ${item.edition}` : ''}</p>
                    <p>Borrowed: ${new Date(item.borrowed_at).toLocaleDateString()}</p>
                    ${dueDate ? `
                        <p class="${isOverdue ? 'overdue-text' : ''}">
                            Due: ${dueDate.toLocaleDateString()} ${isOverdue ? '⚠️ OVERDUE' : ''}
                        </p>
                    ` : ''}
                </div>
                <button class="btn" onclick="App.returnMovie(${item.borrow_id}, '${item.title}')">
                    Return
                </button>
            </div>
        `;
    }).join('');
}

async function loadLentItems() {
    try {
        const items = await apiCall('list_lent');
        renderLentList(items || []);
    } catch (error) {
        console.error('Error loading lent items:', error);
    }
}

function renderLentList(items) {
    const container = document.getElementById('lentList');
    const emptyState = document.getElementById('emptyLent');
    
    if (items.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = items.map(item => {
        const dueDate = item.due_date ? new Date(item.due_date) : null;
        const isOverdue = dueDate && dueDate < new Date();
        
        return `
            <div class="borrow-item ${isOverdue ? 'overdue' : ''}">
                ${item.poster_url ? 
                    `<img src="${item.poster_url}" alt="${item.title}" class="borrow-poster">` : 
                    `<div class="borrow-poster-placeholder">🎬</div>`
                }
                <div class="borrow-info">
                    <h3>${item.title} ${item.year ? `(${item.year})` : ''}</h3>
                    <p>Lent to: <strong>${item.borrower_name}</strong></p>
                    <p>Format: ${item.format}${item.edition ? ` - ${item.edition}` : ''}</p>
                    <p>Borrowed: ${new Date(item.borrowed_at).toLocaleDateString()}</p>
                    ${dueDate ? `
                        <p class="${isOverdue ? 'overdue-text' : ''}">
                            Due: ${dueDate.toLocaleDateString()} ${isOverdue ? '⚠️ OVERDUE' : ''}
                        </p>
                    ` : ''}
                </div>
                <button class="btn" onclick="App.returnMovie(${item.borrow_id}, '${item.title}')">
                    Mark Returned
                </button>
            </div>
        `;
    }).join('');
}

// ========================================
// HELPER: Get Current User ID
// ========================================

async function getCurrentUserId() {
    // Get user ID from API stats call (contains user info)
    try {
        const result = await apiCall('get_stats');
        // We need to add user_id to stats response, or query it separately
        // For now, we'll store it when we switch tabs
        return currentUserId || 1; // Fallback
    } catch (error) {
        return 1;
    }
}

    // ========================================
    // TRIVIA GAME FUNCTIONS
    // ========================================

    let triviaState = {
        gameId: null,
        mode: null,
        scope: null,
        roundNumber: 0,
        score: 0,
        correctCount: 0,
        incorrectCount: 0,
        currentStreak: 0,
        bestStreak: 0,
        livesRemaining: 3,
        currentQuestion: null,
        questionStartTime: null,
        usedHashes: new Set(),
        gameStartTime: null,
        timerInterval: null
    };

    function switchToTrivia() {
        currentTab = 'trivia';
        showTriviaSettings();
    }

    function showTriviaSettings() {
        document.getElementById('triviaSettings').style.display = 'block';
        document.getElementById('triviaGame').style.display = 'none';
        document.getElementById('triviaGameOver').style.display = 'none';
        document.getElementById('triviaHistory').style.display = 'none';
    }

    async function startTriviaGame(mode, scope, questionLimit = 10) {
        try {
            // Initialize game state
            triviaState = {
                gameId: null,
                mode: mode,
                scope: scope,
                questionLimit: questionLimit,
                roundNumber: 0,
                score: 0,
                correctCount: 0,
                incorrectCount: 0,
                currentStreak: 0,
                bestStreak: 0,
                livesRemaining: mode === 'survival' ? 3 : 0,
                currentQuestion: null,
                questionStartTime: null,
                usedHashes: new Set(),
                gameStartTime: Date.now(),
                timerInterval: null
            };

            // Load used question hashes to avoid repeats
            const usedHashesData = await apiCall('trivia_get_used_hashes', { limit: 200 });
            triviaState.usedHashes = new Set(usedHashesData);

            // Start game on server
            const result = await apiCall('trivia_start_game', { mode, scope });
            triviaState.gameId = result.game_id;

            // Show game UI
            document.getElementById('triviaSettings').style.display = 'none';
            document.getElementById('triviaGame').style.display = 'block';
            document.getElementById('triviaGameOver').style.display = 'none';

            // Load first question
            await nextTriviaQuestion();

        } catch (error) {
            console.error('Failed to start trivia game:', error);
            showToast('Failed to start game. Please try again.', 'error');
        }
    }

    async function nextTriviaQuestion() {
        triviaState.roundNumber++;

        // Check if game should end
        if (triviaState.mode === 'sprint' && triviaState.roundNumber > triviaState.questionLimit) {
            return endTriviaGame();
        }

        if (triviaState.mode === 'survival' && triviaState.livesRemaining <= 0) {
            return endTriviaGame();
        }

        // Get movies based on scope
        let movies = [];
        if (triviaState.scope === 'collection') {
            movies = collection.map(g => g.movie);
        } else if (triviaState.scope === 'wishlist') {
            movies = wishlist;
        } else if (triviaState.scope === 'all') {
            movies = [...collection.map(g => g.movie), ...wishlist];
        } else if (triviaState.scope === 'mix') {
            // Random mix of collection and wishlist
            const allMovies = [...collection.map(g => g.movie), ...wishlist];
            movies = allMovies.sort(() => Math.random() - 0.5);
        }

        if (movies.length < 4) {
            showToast('Not enough movies for trivia. Add more to your collection!', 'error');
            return;
        }

        // Generate question
        const question = await TriviaService.generateQuestion(
            movies,
            [...collection.map(g => g.movie), ...wishlist],
            triviaState.roundNumber,
            triviaState.usedHashes
        );

        if (!question) {
            showToast('Could not generate question. Please try again.', 'error');
            return;
        }

        // Track this question hash
        triviaState.usedHashes.add(question.hash);
        triviaState.currentQuestion = question;
        triviaState.questionStartTime = Date.now();

        // Render question
        renderTriviaQuestion(question);
        startQuestionTimer();
    }

    function renderTriviaQuestion(question) {
        const container = document.getElementById('triviaQuestionContainer');
        const difficulty = question.difficulty;
        const difficultyColor = {
            easy: '#4caf50',
            medium: '#ff9800',
            hard: '#f44336'
        }[difficulty];

        let html = `
            <div class="trivia-question-card">
                <div class="trivia-header">
                    <div class="trivia-round">
                        Round ${triviaState.roundNumber}
                        ${triviaState.mode === 'sprint' ? ` / ${triviaState.questionLimit}` : ''}
                    </div>
                    <div class="trivia-difficulty" style="background: ${difficultyColor}">
                        ${difficulty.toUpperCase()}
                    </div>
                </div>

                <div class="trivia-stats-bar">
                    <div class="trivia-stat">
                        <span class="trivia-stat-label">Score</span>
                        <span class="trivia-stat-value" id="triviaCurrentScore">${triviaState.score}</span>
                    </div>
                    <div class="trivia-stat">
                        <span class="trivia-stat-label">Streak</span>
                        <span class="trivia-stat-value">${triviaState.currentStreak}🔥</span>
                    </div>
                    ${triviaState.mode === 'survival' ? `
                        <div class="trivia-stat">
                            <span class="trivia-stat-label">Lives</span>
                            <span class="trivia-stat-value">${'❤️'.repeat(triviaState.livesRemaining)}</span>
                        </div>
                    ` : ''}
                    <div class="trivia-stat">
                        <span class="trivia-stat-label">Time</span>
                        <span class="trivia-stat-value" id="triviaTimer">20</span>
                    </div>
                </div>

                <div class="trivia-question-text">
                    ${question.question}
                </div>

                <div class="trivia-choices">
                    ${question.choices.map((choice, idx) => `
                        <button class="trivia-choice-btn" onclick="App.answerTriviaQuestion('${choice.replace(/'/g, "\\'")}')">
                            ${choice}
                        </button>
                    `).join('')}
                </div>

                <div class="trivia-actions">
                    <button class="btn-ghost" onclick="App.quitTrivia()">Quit Game</button>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    function startQuestionTimer() {
        const timerEl = document.getElementById('triviaTimer');
        let timeLeft = 20;

        if (triviaState.timerInterval) {
            clearInterval(triviaState.timerInterval);
        }

        triviaState.timerInterval = setInterval(() => {
            timeLeft--;
            if (timerEl) {
                timerEl.textContent = timeLeft;

                // Change color based on time left
                if (timeLeft <= 5) {
                    timerEl.style.color = '#f44336';
                } else if (timeLeft <= 10) {
                    timerEl.style.color = '#ff9800';
                }
            }

            if (timeLeft <= 0) {
                clearInterval(triviaState.timerInterval);
                answerTriviaQuestion(null); // Time's up, no answer
            }
        }, 1000);
    }

    async function answerTriviaQuestion(userAnswer) {
        if (!triviaState.currentQuestion) return;

        // Stop timer
        if (triviaState.timerInterval) {
            clearInterval(triviaState.timerInterval);
        }

        const question = triviaState.currentQuestion;
        const timeTaken = (Date.now() - triviaState.questionStartTime) / 1000;
        const isCorrect = userAnswer === question.correct_answer;

        // Update streak
        if (isCorrect) {
            triviaState.currentStreak++;
            triviaState.correctCount++;
            if (triviaState.currentStreak > triviaState.bestStreak) {
                triviaState.bestStreak = triviaState.currentStreak;
            }
        } else {
            triviaState.currentStreak = 0;
            triviaState.incorrectCount++;
            if (triviaState.mode === 'survival') {
                triviaState.livesRemaining--;
            }
        }

        // Calculate score
        const points = isCorrect ? TriviaService.calculateScore(
            question.difficulty,
            timeTaken,
            triviaState.currentStreak
        ) : 0;

        triviaState.score += points;

        // Show feedback
        showAnswerFeedback(isCorrect, points, question.correct_answer);

        // Save question to database
        try {
            await apiCall('trivia_save_question', {
                game_id: triviaState.gameId,
                round_number: triviaState.roundNumber,
                question: question.question,
                type: question.type,
                difficulty: question.difficulty,
                template_id: question.template_id,
                choices: question.choices,
                correct_answer: question.correct_answer,
                user_answer: userAnswer || '',
                is_correct: isCorrect ? 1 : 0,
                time_taken: timeTaken,
                points_earned: points,
                streak_at_time: triviaState.currentStreak,
                question_hash: question.hash,
                metadata: question.metadata
            });

            // Update game state
            await apiCall('trivia_update_game', {
                game_id: triviaState.gameId,
                questions_count: triviaState.roundNumber,
                correct_count: triviaState.correctCount,
                incorrect_count: triviaState.incorrectCount,
                score: triviaState.score,
                duration: Math.floor((Date.now() - triviaState.gameStartTime) / 1000),
                best_streak: triviaState.bestStreak,
                lives_remaining: triviaState.livesRemaining
            });
        } catch (error) {
            console.error('Failed to save question:', error);
        }

        // Wait 2 seconds then show next question or end game
        setTimeout(() => {
            nextTriviaQuestion();
        }, 2000);
    }

    function showAnswerFeedback(isCorrect, points, correctAnswer) {
        const container = document.getElementById('triviaQuestionContainer');
        const feedbackColor = isCorrect ? '#4caf50' : '#f44336';
        const feedbackIcon = isCorrect ? '✓' : '✗';

        const feedback = document.createElement('div');
        feedback.className = 'trivia-feedback';
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${feedbackColor};
            color: white;
            padding: 2rem;
            border-radius: 12px;
            font-size: 2rem;
            font-weight: bold;
            text-align: center;
            z-index: 10000;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            animation: fadeIn 0.3s ease;
        `;

        feedback.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">${feedbackIcon}</div>
            <div>${isCorrect ? 'Correct!' : 'Incorrect'}</div>
            ${isCorrect ? `<div style="font-size: 1.5rem; margin-top: 0.5rem;">+${points} points</div>` : `<div style="font-size: 1rem; margin-top: 0.5rem;">Answer: ${correctAnswer}</div>`}
        `;

        document.body.appendChild(feedback);

        setTimeout(() => {
            feedback.remove();
        }, 2000);
    }

    async function endTriviaGame() {
        const duration = Math.floor((Date.now() - triviaState.gameStartTime) / 1000);

        try {
            await apiCall('trivia_complete_game', {
                game_id: triviaState.gameId,
                mode: triviaState.mode,
                score: triviaState.score,
                questions_count: triviaState.roundNumber,
                correct_count: triviaState.correctCount,
                incorrect_count: triviaState.incorrectCount,
                best_streak: triviaState.bestStreak,
                duration: duration
            });
        } catch (error) {
            console.error('Failed to complete game:', error);
        }

        // Show game over screen
        showGameOverScreen();
    }

    function showGameOverScreen() {
        document.getElementById('triviaGame').style.display = 'none';
        document.getElementById('triviaGameOver').style.display = 'block';

        const accuracy = triviaState.roundNumber > 0
            ? Math.round((triviaState.correctCount / triviaState.roundNumber) * 100)
            : 0;

        const duration = Math.floor((Date.now() - triviaState.gameStartTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        document.getElementById('gameOverContainer').innerHTML = `
            <div class="game-over-card">
                <div class="game-over-title">
                    <h2>🎬 Game Over!</h2>
                    <div class="game-over-mode">${triviaState.mode.toUpperCase()} MODE</div>
                </div>

                <div class="game-over-score">
                    <div class="final-score">
                        <div class="final-score-label">Final Score</div>
                        <div class="final-score-value">${triviaState.score}</div>
                    </div>
                </div>

                <div class="game-over-stats">
                    <div class="game-stat">
                        <div class="game-stat-value">${triviaState.roundNumber}</div>
                        <div class="game-stat-label">Questions</div>
                    </div>
                    <div class="game-stat">
                        <div class="game-stat-value">${triviaState.correctCount}</div>
                        <div class="game-stat-label">Correct</div>
                    </div>
                    <div class="game-stat">
                        <div class="game-stat-value">${accuracy}%</div>
                        <div class="game-stat-label">Accuracy</div>
                    </div>
                    <div class="game-stat">
                        <div class="game-stat-value">${triviaState.bestStreak}🔥</div>
                        <div class="game-stat-label">Best Streak</div>
                    </div>
                    <div class="game-stat">
                        <div class="game-stat-value">${minutes}:${seconds.toString().padStart(2, '0')}</div>
                        <div class="game-stat-label">Time</div>
                    </div>
                </div>

                <div class="game-over-actions">
                    <button class="btn" onclick="App.showTriviaSettings()">Play Again</button>
                    <button class="btn-secondary" onclick="App.viewTriviaHistory()">View History</button>
                    <button class="btn-ghost" onclick="App.switchTab('collection')">Back to Collection</button>
                </div>
            </div>
        `;
    }

    function quitTrivia() {
        if (confirm('Are you sure you want to quit? Your progress will be saved.')) {
            if (triviaState.timerInterval) {
                clearInterval(triviaState.timerInterval);
            }
            endTriviaGame();
        }
    }

    async function viewTriviaHistory() {
        try {
            const history = await apiCall('trivia_get_history', { limit: 50 });

            document.getElementById('triviaSettings').style.display = 'none';
            document.getElementById('triviaGame').style.display = 'none';
            document.getElementById('triviaGameOver').style.display = 'none';
            document.getElementById('triviaHistory').style.display = 'block';

            const container = document.getElementById('triviaHistoryContainer');

            if (history.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📜</div>
                        <h3>No History Yet</h3>
                        <p>Play some trivia games to see your history!</p>
                        <button class="btn" onclick="App.showTriviaSettings()">Start Playing</button>
                    </div>
                `;
                return;
            }

            let html = '<div class="trivia-history-list">';

            history.forEach(q => {
                const isCorrect = q.is_correct === 1;
                const statusIcon = isCorrect ? '✓' : '✗';
                const statusColor = isCorrect ? '#4caf50' : '#f44336';

                html += `
                    <div class="trivia-history-item">
                        <div class="trivia-history-header">
                            <span class="trivia-history-status" style="color: ${statusColor}">${statusIcon}</span>
                            <span class="trivia-history-difficulty">${q.difficulty}</span>
                            <span class="trivia-history-points">${q.points_earned} pts</span>
                        </div>
                        <div class="trivia-history-question">${q.question}</div>
                        <div class="trivia-history-answer">
                            ${isCorrect
                                ? `<span style="color: #4caf50">Your answer: ${q.user_answer}</span>`
                                : `<span style="color: #f44336">Your answer: ${q.user_answer || 'No answer'}</span><br><span style="color: #4caf50">Correct answer: ${q.correct_answer}</span>`
                            }
                        </div>
                        <div class="trivia-history-meta">
                            ${q.mode} • ${new Date(q.created_at).toLocaleDateString()} • ${q.time_taken.toFixed(1)}s
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            html += '<button class="btn" onclick="App.showTriviaSettings()">Back to Settings</button>';

            container.innerHTML = html;

        } catch (error) {
            console.error('Failed to load history:', error);
            showToast('Failed to load history', 'error');
        }
    }

    async function viewTriviaStats() {
        // Hide other trivia views
        document.getElementById('triviaSettings').style.display = 'none';
        document.getElementById('triviaGame').style.display = 'none';
        document.getElementById('triviaGameOver').style.display = 'none';
        document.getElementById('triviaHistory').style.display = 'none';
        document.getElementById('triviaLeaderboards').style.display = 'block';

        // Populate group selector
        const groupSelect = document.getElementById('leaderboardGroupSelect');
        groupSelect.innerHTML = '<option value="">Select a group...</option>';
        if (userGroups && userGroups.length > 0) {
            userGroups.forEach(group => {
                groupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
            });
        }

        // Load personal stats by default
        switchLeaderboardTab('personal');
    }

    function switchLeaderboardTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.leaderboard-tab').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content visibility
        document.querySelectorAll('.leaderboard-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tab === 'personal') {
            document.getElementById('personalStats').classList.add('active');
            loadPersonalStats();
        } else if (tab === 'group') {
            document.getElementById('groupRankings').classList.add('active');
        } else if (tab === 'global') {
            document.getElementById('globalRankings').classList.add('active');
            loadGlobalLeaderboard();
        }
    }

    async function loadPersonalStats() {
        try {
            const stats = await apiCall('trivia_get_stats');
            const container = document.getElementById('personalStatsContainer');

            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">🎮</div>
                        <div class="stat-value">${stats.total_games || 0}</div>
                        <div class="stat-label">Total Games</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🏆</div>
                        <div class="stat-value">${stats.best_score || 0}</div>
                        <div class="stat-label">Best Score</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🎯</div>
                        <div class="stat-value">${stats.accuracy || 0}%</div>
                        <div class="stat-label">Accuracy</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⭐</div>
                        <div class="stat-value">${stats.average_score || 0}</div>
                        <div class="stat-label">Avg Score</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🔥</div>
                        <div class="stat-value">${stats.best_streak || 0}</div>
                        <div class="stat-label">Best Streak</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-value">${stats.avg_time ? Math.round(stats.avg_time) + 's' : 'N/A'}</div>
                        <div class="stat-label">Avg Time/Question</div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load personal stats:', error);
            document.getElementById('personalStatsContainer').innerHTML = `
                <div class="empty-state">
                    <p>Failed to load personal stats</p>
                </div>
            `;
        }
    }

    async function loadGroupLeaderboard(groupId) {
        const container = document.getElementById('groupRankingsContainer');

        // Clear and exit if no group selected
        if (!groupId || groupId === '' || groupId === 'undefined') {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>Select a Group</h3>
                    <p>Choose a group to view trivia rankings</p>
                </div>
            `;
            return;
        }

        try {
            const rankings = await apiCall('trivia_group_leaderboard', { group_id: groupId });
            renderLeaderboard(rankings, 'groupRankingsContainer');
        } catch (error) {
            console.error('Failed to load group leaderboard:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>Failed to load group rankings</p>
                </div>
            `;
        }
    }

    async function loadGlobalLeaderboard() {
        try {
            const rankings = await apiCall('trivia_global_leaderboard', { limit: 100 });
            renderLeaderboard(rankings, 'globalRankingsContainer');
        } catch (error) {
            console.error('Failed to load global leaderboard:', error);
            document.getElementById('globalRankingsContainer').innerHTML = `
                <div class="empty-state">
                    <p>Failed to load global rankings</p>
                </div>
            `;
        }
    }

    function renderLeaderboard(rankings, containerId) {
        const container = document.getElementById(containerId);

        if (!rankings || rankings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🏆</div>
                    <h3>No Rankings Yet</h3>
                    <p>Be the first to play and set a score!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="leaderboard-table">
                <div class="leaderboard-header">
                    <div class="rank-col">Rank</div>
                    <div class="player-col">Player</div>
                    <div class="score-col">Best Score</div>
                    <div class="games-col">Games</div>
                    <div class="accuracy-col">Accuracy</div>
                </div>
                ${rankings.map((player, index) => {
                    const rank = index + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
                    const isCurrentUser = player.user_id === window.currentUserId;

                    return `
                        <div class="leaderboard-row ${isCurrentUser ? 'current-user' : ''}">
                            <div class="rank-col">${medal}</div>
                            <div class="player-col">${player.username || 'Anonymous'}${isCurrentUser ? ' (You)' : ''}</div>
                            <div class="score-col">${player.best_score || 0}</div>
                            <div class="games-col">${player.total_games || 0}</div>
                            <div class="accuracy-col">${player.accuracy || 0}%</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // ========================================
    // SHELF MANAGEMENT
    // ========================================

    // ----------------------------------------
    // SHELF SETUP WIZARD
    // ----------------------------------------

    let wizardSelections  = [];
    let wizardCategory    = 'mixed';
    let wizardParentShelfId = null;

    function showShelfWizard() {
        document.getElementById('shelfWizardModal').classList.add('active');
        wizardSelections = [];
        wizardStep1();
    }

    function closeShelfWizard() {
        document.getElementById('shelfWizardModal').classList.remove('active');
        wizardSelections = [];
    }

    /** Compute top directors / studios / genres from the loaded collection */
    function _wizardComputeTopItems() {
        const directors = {}, studios = {}, genres = {};

        collection.forEach(group => {
            const m = group.movie;
            if (m.director) {
                const d = m.director.trim();
                if (d) directors[d] = (directors[d] || 0) + 1;
            }
            if (m.studio) {
                const s = m.studio.trim();
                if (s) studios[s] = (studios[s] || 0) + 1;
            }
            if (m.genre) {
                m.genre.split(',').forEach(g => {
                    const gt = g.trim();
                    if (gt) genres[gt] = (genres[gt] || 0) + 1;
                });
            }
        });

        const sortDesc = obj => Object.entries(obj)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        return {
            directors: sortDesc(directors),
            studios:   sortDesc(studios),
            genres:    sortDesc(genres)
        };
    }

    function wizardStep1() {
        const parentOptions = (shelves || []).map(s =>
            `<option value="${s.id}">${s.name}</option>`
        ).join('');

        document.getElementById('shelfWizardBody').innerHTML = `
            <div class="wizard-step">
                <div class="wizard-step-header">
                    <span class="wizard-step-num">1</span>
                    <span>Choose how to organize</span>
                </div>
                <p class="wizard-desc">
                    The wizard will suggest shelves based on what's most common in your collection —
                    directors, studios, genres, or a mix. You pick which ones to create.
                </p>

                <div class="wizard-category-picker">
                    <label class="wizard-cat-option">
                        <input type="radio" name="wizardCat" value="directors" ${wizardCategory === 'directors' ? 'checked' : ''}>
                        <div class="wizard-cat-card">
                            <div class="wizard-cat-icon">🎬</div>
                            <div class="wizard-cat-name">Directors</div>
                            <div class="wizard-cat-desc">One shelf per director</div>
                        </div>
                    </label>
                    <label class="wizard-cat-option">
                        <input type="radio" name="wizardCat" value="studios" ${wizardCategory === 'studios' ? 'checked' : ''}>
                        <div class="wizard-cat-card">
                            <div class="wizard-cat-icon">🏢</div>
                            <div class="wizard-cat-name">Studios</div>
                            <div class="wizard-cat-desc">One shelf per studio</div>
                        </div>
                    </label>
                    <label class="wizard-cat-option">
                        <input type="radio" name="wizardCat" value="genres" ${wizardCategory === 'genres' ? 'checked' : ''}>
                        <div class="wizard-cat-card">
                            <div class="wizard-cat-icon">🎭</div>
                            <div class="wizard-cat-name">Genres</div>
                            <div class="wizard-cat-desc">One shelf per genre</div>
                        </div>
                    </label>
                    <label class="wizard-cat-option">
                        <input type="radio" name="wizardCat" value="mixed" ${wizardCategory === 'mixed' || wizardCategory === '' ? 'checked' : ''}>
                        <div class="wizard-cat-card">
                            <div class="wizard-cat-icon">✨</div>
                            <div class="wizard-cat-name">Mixed</div>
                            <div class="wizard-cat-desc">Pick from all categories</div>
                        </div>
                    </label>
                </div>

                <div class="setting-item" style="margin-top: 1.5rem;">
                    <label>Nest under an existing shelf <span style="color:rgba(255,255,255,0.45);">(optional)</span></label>
                    <select id="wizardParentShelf" style="max-width: 300px;">
                        <option value="">— Top level (no parent) —</option>
                        ${parentOptions}
                    </select>
                </div>

                <div class="wizard-footer">
                    <span></span>
                    <button class="btn" onclick="App.wizardGoStep2()">Next →</button>
                </div>
            </div>
        `;
    }

    function wizardGoStep2() {
        wizardCategory    = document.querySelector('input[name="wizardCat"]:checked').value;
        wizardParentShelfId = document.getElementById('wizardParentShelf').value || null;
        wizardStep2();
    }

    /** Render a collapsible checklist section for a category */
    function _wizardRenderSection(title, icon, items, catKey, initialShow = 10) {
        if (!items.length) return '';

        const topItems    = items.slice(0, initialShow);
        const moreItems   = items.slice(initialShow);

        const renderItem = (item, checked) => `
            <label class="wizard-check-item">
                <input type="checkbox" name="wizard_${catKey}" value="${item.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" ${checked ? 'checked' : ''}>
                <span class="wizard-check-name">${item.name}</span>
                <span class="wizard-check-count">${item.count} film${item.count !== 1 ? 's' : ''}</span>
            </label>`;

        return `
            <div class="wizard-section">
                <div class="wizard-section-title">${icon} ${title}</div>
                <div class="wizard-checklist">
                    ${topItems.map(i => renderItem(i, true)).join('')}
                    ${moreItems.length > 0 ? `
                        <div class="wizard-hidden" id="wizardHidden_${catKey}" style="display:none;">
                            ${moreItems.map(i => renderItem(i, false)).join('')}
                        </div>
                        <button class="wizard-show-more" type="button" onclick="App.wizardToggleMore('${catKey}')">
                            Show ${moreItems.length} more ▾
                        </button>
                    ` : ''}
                </div>
            </div>`;
    }

    function wizardToggleMore(catKey) {
        const hidden = document.getElementById(`wizardHidden_${catKey}`);
        const btn    = hidden ? hidden.nextElementSibling : null;
        if (!hidden || !btn) return;
        const expanding = hidden.style.display === 'none';
        hidden.style.display = expanding ? '' : 'none';
        btn.textContent = expanding
            ? 'Show fewer ▴'
            : `Show ${hidden.querySelectorAll('label').length} more ▾`;
    }

    function wizardStep2() {
        const tops = _wizardComputeTopItems();

        if (!collection.length) {
            document.getElementById('shelfWizardBody').innerHTML = `
                <div class="wizard-step">
                    <p style="color:rgba(255,255,255,0.6); text-align:center; padding: 2rem;">
                        Your collection is empty — add some movies first!
                    </p>
                    <div class="wizard-footer">
                        <button class="btn btn-secondary" onclick="App.wizardStep1()">← Back</button>
                    </div>
                </div>`;
            return;
        }

        let sectionsHTML = '';
        if (wizardCategory === 'directors' || wizardCategory === 'mixed') {
            sectionsHTML += _wizardRenderSection('Directors', '🎬', tops.directors, 'directors');
        }
        if (wizardCategory === 'studios' || wizardCategory === 'mixed') {
            sectionsHTML += _wizardRenderSection('Studios', '🏢', tops.studios, 'studios');
        }
        if (wizardCategory === 'genres' || wizardCategory === 'mixed') {
            sectionsHTML += _wizardRenderSection('Genres', '🎭', tops.genres, 'genres');
        }

        document.getElementById('shelfWizardBody').innerHTML = `
            <div class="wizard-step">
                <div class="wizard-step-header">
                    <span class="wizard-step-num">2</span>
                    <span>Select shelves to create</span>
                </div>
                <p class="wizard-desc">
                    The top picks are pre-checked. Uncheck anything you don't want, or scroll down
                    to reveal and check less-common items too.
                </p>
                ${sectionsHTML || '<p style="color:rgba(255,255,255,0.5);">No data found in your collection.</p>'}
                <div class="wizard-footer">
                    <button class="btn btn-secondary" onclick="App.wizardStep1()">← Back</button>
                    <button class="btn" onclick="App.wizardGoStep3()">Review →</button>
                </div>
            </div>`;
    }

    function wizardGoStep3() {
        wizardSelections = [];
        ['directors', 'studios', 'genres'].forEach(cat => {
            document.querySelectorAll(`input[name="wizard_${cat}"]:checked`).forEach(cb => {
                wizardSelections.push({ name: cb.value, category: cat });
            });
        });

        if (!wizardSelections.length) {
            showToast('Select at least one item to create a shelf for.', 'error');
            return;
        }
        wizardStep3();
    }

    function wizardStep3() {
        const parentName = wizardParentShelfId
            ? ((shelves || []).find(s => String(s.id) === String(wizardParentShelfId))?.name || 'Selected shelf')
            : 'Top level';

        const catColors = { directors: '#1a6fd4', studios: '#c0a020', genres: '#27ae60' };
        const catIcons  = { directors: '🎬', studios: '🏢', genres: '🎭' };

        document.getElementById('shelfWizardBody').innerHTML = `
            <div class="wizard-step">
                <div class="wizard-step-header">
                    <span class="wizard-step-num">3</span>
                    <span>Review & Create</span>
                </div>
                <p class="wizard-desc">
                    Ready to create <strong>${wizardSelections.length} shelf${wizardSelections.length !== 1 ? 'ves' : ''}</strong>
                    under <strong>${parentName}</strong>:
                </p>
                <div class="wizard-review-list">
                    ${wizardSelections.map(s => `
                        <div class="wizard-review-item">
                            <span class="wizard-review-icon">${catIcons[s.category] || '📁'}</span>
                            <span class="wizard-review-name">${s.name}</span>
                            <span class="wizard-review-cat" style="color:${catColors[s.category] || '#888'}">${s.category}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="wizard-footer">
                    <button class="btn btn-secondary" onclick="App.wizardStep2()">← Back</button>
                    <button class="btn" id="wizardCreateBtn" onclick="App.wizardCreate()">
                        ✨ Create ${wizardSelections.length} Shelf${wizardSelections.length !== 1 ? 'ves' : ''}
                    </button>
                </div>
            </div>`;
    }

    async function wizardCreate() {
        const btn = document.getElementById('wizardCreateBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

        const catColors = { directors: '#1a6fd4', studios: '#c0a020', genres: '#27ae60' };
        let created = 0, failed = 0;
        let totalAssigned = 0, totalSkipped = 0;

        // Fetch unassigned copies once so we only assign films not already on a shelf
        let unassignedCopies = [];
        try {
            unassignedCopies = await apiCall('get_unassigned_copies') || [];
        } catch (e) {
            console.error('Wizard: could not fetch unassigned copies', e);
        }

        // Track copy IDs we assign during this run so a copy isn't assigned twice
        const assignedDuringRun = new Set();

        for (const sel of wizardSelections) {
            try {
                const params = {
                    name:  sel.name,
                    color: catColors[sel.category] || '#667eea'
                };
                if (wizardParentShelfId) params.parent_shelf_id = parseInt(wizardParentShelfId);

                if (btn) btn.textContent = `Creating "${sel.name}"…`;

                const result = await apiCall('create_shelf', params);
                const newShelfId = result?.shelf_id;
                created++;

                if (!newShelfId) continue;

                // Find matching unassigned copies for this shelf
                const matchingCopies = unassignedCopies.filter(copy => {
                    if (assignedDuringRun.has(copy.copy_id)) return false;

                    if (sel.category === 'directors') {
                        return copy.director && copy.director.trim() === sel.name;
                    } else if (sel.category === 'studios') {
                        if (copy.studio && copy.studio.trim() === sel.name) return true;
                        // Also check production_companies if available
                        if (copy.production_companies) {
                            if (typeof copy.production_companies === 'string') {
                                return copy.production_companies.includes(sel.name);
                            }
                            if (Array.isArray(copy.production_companies)) {
                                return copy.production_companies.some(c => c.name === sel.name);
                            }
                        }
                        return false;
                    } else if (sel.category === 'genres') {
                        return copy.genre && copy.genre.includes(sel.name);
                    }
                    return false;
                });

                if (btn) btn.textContent = `Populating "${sel.name}" (${matchingCopies.length} films)…`;

                // Assign each matching copy to the new shelf
                for (const copy of matchingCopies) {
                    try {
                        await apiCall('assign_to_shelf', {
                            shelf_id: newShelfId,
                            copy_id: copy.copy_id
                        });
                        assignedDuringRun.add(copy.copy_id);
                        totalAssigned++;
                    } catch (e) {
                        console.error('Wizard: failed to assign copy', copy.copy_id, 'to shelf', newShelfId, e);
                        totalSkipped++;
                    }
                }
            } catch (e) {
                console.error('Wizard: failed to create shelf', sel.name, e);
                failed++;
            }
        }

        // Build summary message
        let subtitle = '';
        if (totalAssigned > 0) {
            subtitle = `${totalAssigned} film${totalAssigned !== 1 ? 's' : ''} automatically assigned to your new shelves!`;
        } else if (created > 0) {
            subtitle = 'Shelves created, but no unassigned films matched. Assign films manually from the shelf view.';
        }
        if (totalSkipped > 0) {
            subtitle += ` (${totalSkipped} could not be assigned)`;
        }

        document.getElementById('shelfWizardBody').innerHTML = `
            <div class="wizard-step wizard-done">
                <div class="wizard-done-icon">${totalAssigned > 0 ? '🎬' : '✅'}</div>
                <h3 class="wizard-done-title">${created} shelf${created !== 1 ? 'ves' : ''} created!</h3>
                ${failed > 0 ? `<p style="color:#f87171; margin-top:0.5rem;">${failed} could not be created — try them manually.</p>` : ''}
                <p class="wizard-done-subtitle">${subtitle}</p>
                <div class="wizard-footer" style="justify-content:center; gap:1rem; margin-top:1.5rem;">
                    <button class="btn btn-secondary" onclick="App.closeShelfWizard()">Close</button>
                    <button class="btn" onclick="App.closeShelfWizard(); App.switchTab('shelves');">
                        📚 Go to Shelves
                    </button>
                </div>
            </div>`;

        await refreshAllShelfViews();
    }

    // ----------------------------------------
    // END SHELF SETUP WIZARD
    // ----------------------------------------

    let currentShelf = null;
    let assignCopyId = null;
    let unassignedMovies = [];
    let filteredUnassignedMovies = []; // Track filtered results for "Select All"
    let selectedCopyIds = new Set();
    let shelfView = 'visual';
    let unassignedFilter = {
        search: '',
        sort: 'title',
        type: 'all',
        director: 'all',
        genre: 'all',
        studio: 'all'
    };

    async function loadShelves() {
        try {
            shelves = await apiCall('list_shelves');
            renderShelves();
            populateShelfDropdown(); // Populate Collection tab dropdown
        } catch (error) {
            console.error('Failed to load shelves:', error);
            showToast('Failed to load shelves', 'error');
        }
    }

    function setShelfView(view) {
        shelfView = view;

        // Update view buttons
        document.querySelectorAll('.shelf-view-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            }
        });

        // Toggle views
        if (view === 'list') {
            document.getElementById('shelvesListView').style.display = 'block';
            document.getElementById('shelvesVisualView').style.display = 'none';
        } else {
            document.getElementById('shelvesListView').style.display = 'none';
            document.getElementById('shelvesVisualView').style.display = 'block';
            renderShelvesVisual();
        }
    }

    function renderShelves() {
        const container = document.getElementById('shelvesList');
        const emptyState = document.getElementById('emptyShelves');

        if (!shelves || shelves.length === 0) {
            container.innerHTML = '';
            if (emptyState) {
                // Tailor message when an empty layout profile is active
                const activeLayout = layoutProfiles.find(l => l.is_active == 1);
                const heading = document.getElementById('emptyShelvesHeading');
                const text    = document.getElementById('emptyShelvesText');
                if (activeLayout) {
                    if (heading) heading.textContent = 'This layout has no shelves yet.';
                    if (text)    text.textContent    = 'Add shelves manually or run the wizard to auto-populate this layout.';
                } else {
                    if (heading) heading.textContent = 'No shelves yet';
                    if (text)    text.textContent    = 'Create your first shelf to organize your physical collection!';
                }
                emptyState.style.display = 'block';
            }
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        container.innerHTML = shelves.map(shelf => {
            const capacityText = shelf.capacity ? `${shelf.assigned_count || 0}/${shelf.capacity}` : `${shelf.assigned_count || 0} movies`;
            const capacityPercent = shelf.capacity ? ((shelf.assigned_count || 0) / shelf.capacity * 100) : 0;
            const isFull = shelf.capacity && (shelf.assigned_count >= shelf.capacity);

            return `
                <div class="shelf-card" style="border-left: 4px solid ${shelf.color || '#667eea'}">
                    <div class="shelf-header">
                        <div>
                            <h3 style="margin: 0; font-size: 1.25rem;">${shelf.name}</h3>
                            ${shelf.theme ? `<span class="shelf-theme">${shelf.theme}</span>` : ''}
                        </div>
                        <div class="shelf-actions">
                            <button class="btn-icon" onclick="App.viewShelfContents(${shelf.id})" title="View contents">
                                👁️
                            </button>
                            <button class="btn-icon" onclick="App.editShelf(${shelf.id})" title="Edit shelf">
                                ✏️
                            </button>
                            <button class="btn-icon" onclick="App.deleteShelf(${shelf.id})" title="Delete shelf">
                                🗑️
                            </button>
                        </div>
                    </div>

                    ${shelf.description ? `<p class="shelf-description">${shelf.description}</p>` : ''}

                    <div class="shelf-stats">
                        <div class="shelf-capacity">
                            <span class="capacity-label">${capacityText}</span>
                            ${shelf.capacity ? `
                                <div class="capacity-bar">
                                    <div class="capacity-fill" style="width: ${capacityPercent}%; background: ${isFull ? '#ef4444' : shelf.color || '#667eea'}"></div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function renderShelvesVisual() {
        const container = document.getElementById('shelvesVisual');

        if (!shelves || shelves.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6);">No shelves to display</p>';
            return;
        }

        // Organize shelves into hierarchy: parent shelves with their children
        const topLevelShelves = shelves.filter(s => !s.parent_shelf_id);
        const childShelvesByParent = {};

        shelves.forEach(shelf => {
            if (shelf.parent_shelf_id) {
                if (!childShelvesByParent[shelf.parent_shelf_id]) {
                    childShelvesByParent[shelf.parent_shelf_id] = [];
                }
                childShelvesByParent[shelf.parent_shelf_id].push(shelf);
            }
        });

        // Fetch contents for ALL shelves (both parents and children)
        const allShelvesWithMovies = await Promise.all(
            shelves.map(async (shelf) => {
                try {
                    const contents = await apiCall('get_shelf_contents', { shelf_id: shelf.id });
                    return { ...shelf, movies: contents || [] };
                } catch (e) {
                    return { ...shelf, movies: [] };
                }
            })
        );

        // Create lookup map for quick access
        const shelfMoviesMap = {};
        allShelvesWithMovies.forEach(shelf => {
            shelfMoviesMap[shelf.id] = shelf.movies;
        });

        // Recursive function to get ALL movies from a shelf and its descendants
        const getAllMoviesRecursive = (shelfId) => {
            const directMovies = shelfMoviesMap[shelfId] || [];
            const children = childShelvesByParent[shelfId] || [];

            // Debug logging
            const currentShelf = shelves.find(s => s.id === shelfId);
            console.log(`[Shelf Aggregation] Processing "${currentShelf?.name}" (ID: ${shelfId})`);
            console.log(`  - Direct movies: ${directMovies.length}`);
            console.log(`  - Child shelves: ${children.length}`, children.map(c => c.name));

            // Combine this shelf's movies with all child shelves' movies
            let allMovies = [...directMovies];

            children.forEach(child => {
                console.log(`  - Recursing into child: ${child.name} (ID: ${child.id})`);
                const childMovies = getAllMoviesRecursive(child.id);
                console.log(`  - Got ${childMovies.length} movies from ${child.name}`);
                allMovies = allMovies.concat(childMovies);
            });

            console.log(`  - Total movies before dedup: ${allMovies.length}`);
            if (allMovies.length > 0) {
                console.log(`  - Sample movie object:`, allMovies[0]);
                console.log(`  - Movie IDs check:`, allMovies.map(m => ({
                    title: m.title,
                    id: m.id,
                    movie_id: m.movie_id
                })));
            }

            // Remove duplicates based on movie ID or container ID
            const uniqueMovies = [];
            const seenIds = new Set();
            allMovies.forEach(movie => {
                // For containers, use container_id; for movies, use movie_id
                const uniqueId = movie.is_container ? `container_${movie.container_id}` : `copy_${movie.copy_id}`;

                if (!seenIds.has(uniqueId)) {
                    seenIds.add(uniqueId);
                    uniqueMovies.push(movie);
                }
            });

            console.log(`  - Unique movies after dedup: ${uniqueMovies.length}`);
            console.log(`  - Returning movies:`, uniqueMovies.map(m => m.is_container ? m.container_name : m.title));

            return uniqueMovies;
        };

        // Recursive function to render shelves with INFINITE nesting levels
        const renderShelfWithChildren = (shelf, level = 0) => {
            const directMovies = shelfMoviesMap[shelf.id] || [];
            const allMovies = getAllMoviesRecursive(shelf.id); // Include child movies!
            const children = childShelvesByParent[shelf.id] || [];
            const hasChildren = children.length > 0;
            const isChild = level > 0;

            let html = `
                <div class="visual-shelf ${isChild ? 'child-shelf' : ''} ${hasChildren ? 'parent-shelf' : ''}"
                     style="border-color: ${shelf.color || '#667eea'}; margin-left: ${level * 2}rem;"
                     data-shelf-id="${shelf.id}"
                     data-level="${level}">
                    <div class="visual-shelf-header">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                            ${hasChildren ? `<button class="expand-btn" onclick="App.toggleShelfChildren(${shelf.id})" title="Toggle child shelves">▼</button>` : ''}
                            <h3>${shelf.name}</h3>
                            ${shelf.theme ? `<span class="visual-shelf-theme">${shelf.theme}</span>` : ''}
                            ${hasChildren ? `<span class="child-count-badge">${children.length} ${children.length !== 1 ? 'shelves' : 'shelf'}</span>` : ''}
                        </div>
                        <span class="visual-shelf-count">${allMovies.length} ${shelf.capacity ? `/ ${shelf.capacity}` : ''} movies</span>
                    </div>
                    <div class="visual-shelf-spines">
                        ${allMovies.length === 0
                            ? '<div class="visual-shelf-empty">Empty shelf - click to add movies</div>'
                            : allMovies.map(movie => {
                                // Handle both containers and regular movies
                                const title = movie.is_container
                                    ? movie.container_name
                                    : (movie.display_title || movie.title);
                                const year = movie.is_container ? '' : ` (${movie.year})`;
                                const icon = movie.is_container ? '📦 ' : '';

                                // Box set spines open box set detail directly; movie spines open movie detail
                                const spineClick = movie.is_container
                                    ? `App.showBoxSetDetails(${movie.container_id})`
                                    : `App.viewMovieDetails(${movie.movie_id})`;

                                return `
                                    <div class="movie-spine ${movie.is_container ? 'container-spine' : ''}"
                                         style="background: ${movie.is_container ? (movie.container_spine_color || '#764ba2') : (shelf.color || '#667eea')}"
                                         title="${icon}${title}${year}"
                                         onclick="${spineClick}">
                                        <span class="spine-title">${icon}${title}</span>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                    <div class="visual-shelf-actions">
                        <button class="btn-icon" onclick="App.viewShelfContents(${shelf.id})" title="Manage movies">
                            📝
                        </button>
                        <button class="btn-icon" onclick="App.editShelf(${shelf.id})" title="Edit shelf">
                            ✏️
                        </button>
                    </div>
                </div>
            `;

            // Recursively render children if any
            if (hasChildren) {
                html += `<div class="child-shelves-container" id="children-${shelf.id}">`;
                children.forEach(childShelf => {
                    html += renderShelfWithChildren(childShelf, level + 1); // RECURSIVE CALL for multi-level!
                });
                html += '</div>';
            }

            return html;
        };

        // Start rendering from top-level shelves
        let html = '';
        topLevelShelves.forEach(shelf => {
            html += renderShelfWithChildren(shelf, 0);
        });

        container.innerHTML = html;
    }

    // New function to toggle child shelf visibility
    function toggleShelfChildren(shelfId) {
        const container = document.getElementById(`children-${shelfId}`);
        const button = document.querySelector(`[data-shelf-id="${shelfId}"] .expand-btn`);

        if (container) {
            const isCollapsed = container.style.display === 'none';
            container.style.display = isCollapsed ? 'block' : 'none';
            button.textContent = isCollapsed ? '▼' : '▶';
        }
    }

    function showCreateShelfModal() {
        currentShelf = null;
        document.getElementById('shelfModalTitle').textContent = 'Create New Shelf';
        document.getElementById('shelfName').value = '';
        document.getElementById('shelfCapacity').value = '';
        document.getElementById('shelfTheme').value = '';
        document.getElementById('shelfDescription').value = '';
        document.getElementById('shelfColor').value = '#667eea';
        populateParentShelfDropdown();
        document.getElementById('shelfParent').value = '';
        document.getElementById('saveShelfBtn').textContent = 'Create Shelf';
        document.getElementById('shelfModal').classList.add('active');
    }

    function populateParentShelfDropdown(excludeShelfId = null) {
        const dropdown = document.getElementById('shelfParent');
        dropdown.innerHTML = '<option value="">None (Top-level shelf)</option>';

        // Build hierarchy recursively to show ALL shelves with proper indentation
        function buildShelfHierarchy(parentId, level = 0) {
            const children = shelves.filter(s => {
                // Match shelves with this parent (or null for top-level)
                const matchesParent = (parentId === null) ? !s.parent_shelf_id : s.parent_shelf_id === parentId;
                // Exclude the shelf we're editing (can't be its own parent)
                return matchesParent && s.id !== excludeShelfId;
            });

            children.forEach(shelf => {
                const option = document.createElement('option');
                option.value = shelf.id;
                // Add visual indentation based on nesting level
                const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(level); // Non-breaking spaces
                const prefix = level > 0 ? '└─ ' : '';
                option.textContent = indent + prefix + shelf.name;
                dropdown.appendChild(option);

                // Recursively add children of this shelf (multi-level support!)
                buildShelfHierarchy(shelf.id, level + 1);
            });
        }

        // Start with top-level shelves (those with no parent)
        buildShelfHierarchy(null, 0);
    }

    async function editShelf(shelfId) {
        const shelf = shelves.find(s => s.id === shelfId);
        if (!shelf) return;

        currentShelf = shelf;
        document.getElementById('shelfModalTitle').textContent = 'Edit Shelf';
        document.getElementById('shelfName').value = shelf.name;
        document.getElementById('shelfCapacity').value = shelf.capacity || '';
        document.getElementById('shelfTheme').value = shelf.theme || '';
        document.getElementById('shelfDescription').value = shelf.description || '';
        document.getElementById('shelfColor').value = shelf.color || '#667eea';
        populateParentShelfDropdown(shelfId); // Exclude current shelf from parent options
        document.getElementById('shelfParent').value = shelf.parent_shelf_id || '';
        document.getElementById('saveShelfBtn').textContent = 'Save Changes';
        document.getElementById('shelfModal').classList.add('active');
    }

    async function saveShelf() {
        const name = document.getElementById('shelfName').value.trim();
        if (!name) {
            showToast('Please enter a shelf name', 'error');
            return;
        }

        const parentShelfValue = document.getElementById('shelfParent').value;
        const shelfData = {
            name: name,
            capacity: parseInt(document.getElementById('shelfCapacity').value) || null,
            theme: document.getElementById('shelfTheme').value.trim() || null,
            description: document.getElementById('shelfDescription').value.trim() || null,
            color: document.getElementById('shelfColor').value || '#667eea',
            parent_shelf_id: parentShelfValue ? parseInt(parentShelfValue) : null
        };

        try {
            if (currentShelf) {
                // Update existing shelf
                await apiCall('update_shelf', { shelf_id: currentShelf.id, ...shelfData });
                showToast('Shelf updated successfully!', 'success');
            } else {
                // Create new shelf
                await apiCall('create_shelf', shelfData);
                showToast('Shelf created successfully!', 'success');
            }

            closeShelfModal();

            await refreshAllShelfViews();
        } catch (error) {
            console.error('Failed to save shelf:', error);
            showToast('Failed to save shelf', 'error');
        }
    }

    function closeShelfModal() {
        document.getElementById('shelfModal').classList.remove('active');
        currentShelf = null;
    }

    async function deleteShelf(shelfId) {
        const shelf = shelves.find(s => s.id === shelfId);
        if (!shelf) return;

        if (!confirm(`Delete shelf "${shelf.name}"? Movies will be unassigned but not deleted.`)) {
            return;
        }

        try {
            await apiCall('delete_shelf', { shelf_id: shelfId });
            showToast('Shelf deleted successfully!', 'success');

            await refreshAllShelfViews();
        } catch (error) {
            console.error('Failed to delete shelf:', error);
            showToast('Failed to delete shelf', 'error');
        }
    }

    async function deleteAllShelves() {
        if (!confirm('Reset ALL shelves?\n\nThis will delete every shelf and unassign all movies. Your collection and copies are safe — nothing gets deleted. This cannot be undone.')) {
            return;
        }
        try {
            await apiCall('delete_all_shelves');
            showToast('All shelves cleared. Ready for a fresh setup!', 'success');
            await refreshAllShelfViews();
        } catch (error) {
            console.error('Failed to reset shelves:', error);
            showToast('Failed to reset shelves', 'error');
        }
    }

    // ── Shelf contents state for drag-and-drop ──
    let _shelfContentsData = [];
    let _shelfDragMode = false;
    let _shelfDragEl = null;
    let _shelfOriginalOrder = [];

    async function viewShelfContents(shelfId) {
        const shelf = shelves.find(s => s.id === shelfId);
        if (!shelf) return;

        currentShelf = shelf;
        _shelfDragMode = false;

        try {
            const contents = await apiCall('get_shelf_contents', { shelf_id: shelfId });
            _shelfContentsData = contents || [];

            document.getElementById('shelfContentsTitle').textContent = `📚 ${shelf.name}`;
            _renderShelfContents();
            document.getElementById('shelfContentsModal').classList.add('active');
        } catch (error) {
            console.error('Failed to load shelf contents:', error);
            showToast('Failed to load shelf contents', 'error');
        }
    }

    function _renderShelfContents() {
        const container = document.getElementById('shelfContentsList');
        const emptyState = document.getElementById('emptyShelfContents');
        const dragHint = document.getElementById('shelfDragHint');
        const saveBar = document.getElementById('shelfSaveOrderBar');

        if (!_shelfContentsData || _shelfContentsData.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            if (dragHint) dragHint.style.display = 'none';
            if (saveBar) saveBar.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (dragHint) dragHint.style.display = _shelfDragMode ? 'block' : 'none';
        if (saveBar) saveBar.style.display = _shelfDragMode ? 'flex' : 'none';

        container.innerHTML = _shelfContentsData.map((item, idx) => {
            const isContainer = item.is_container === 1 || item.is_container === true;
            const dragAttrs = _shelfDragMode
                ? `draggable="true" ondragstart="App._shelfDragStart(event, ${idx})" ondragover="App._shelfDragOver(event, ${idx})" ondragend="App._shelfDragEnd(event)" ondrop="App._shelfDrop(event, ${idx})"`
                : '';
            const dragHandle = _shelfDragMode
                ? `<div class="shelf-drag-handle" title="Drag to reorder">⠿</div>`
                : '';

            if (isContainer) {
                const coverUrl = item.container_umdb_cover_url || item.container_spine_image_url;
                const shelfContainerPosterHTML = coverUrl
                    ? `<img src="${coverUrl}" alt="${item.container_name || 'Box Set'}" class="shelf-movie-poster" style="object-fit: cover;"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
                      + `<div class="container-poster" style="display:none; background: ${item.container_spine_color || '#667eea'}; align-items: center; justify-content: center; font-size: 3rem;">📦</div>`
                    : `<div class="container-poster" style="background: ${item.container_spine_color || '#667eea'}; display: flex; align-items: center; justify-content: center; font-size: 3rem;">📦</div>`;
                return `
                    <div class="shelf-movie-card container-card ${_shelfDragMode ? 'drag-enabled' : ''}"
                         data-idx="${idx}" data-type="container" data-id="${item.container_id}"
                         ${dragAttrs}
                         ${!_shelfDragMode ? `onclick="App.showBoxSetDetails(${item.container_id})"` : ''}>
                        ${dragHandle}
                        ${shelfContainerPosterHTML}
                        <div class="shelf-movie-info">
                            <h4>${item.container_name || 'Box Set'}</h4>
                            <p>${item.container_movie_count || 0} movie${item.container_movie_count !== 1 ? 's' : ''}</p>
                            <div class="shelf-movie-format">${item.container_format || 'Box Set'}</div>
                        </div>
                        <button class="btn-remove" onclick="event.stopPropagation(); App.removeContainerFromShelf(${item.container_id});" title="Remove from shelf">
                            ×
                        </button>
                    </div>
                `;
            } else {
                return `
                    <div class="shelf-movie-card ${_shelfDragMode ? 'drag-enabled' : ''}"
                         data-idx="${idx}" data-type="copy" data-id="${item.copy_id}"
                         ${dragAttrs}>
                        ${dragHandle}
                        <img src="${item.edition_cover_url || item.poster_url || PLACEHOLDER_IMG}"
                             alt="${item.title}"
                             class="shelf-movie-poster">
                        <div class="shelf-movie-info">
                            <h4>${item.display_title || item.title}</h4>
                            <p>${item.year || 'N/A'}</p>
                            <div class="shelf-movie-format">${item.format}</div>
                        </div>
                        <button class="btn-remove" onclick="App.removeFromShelf(${item.copy_id})" title="Remove from shelf">
                            ×
                        </button>
                    </div>
                `;
            }
        }).join('');
    }

    // ── Drag-and-drop handlers ──
    function _shelfDragStart(e, idx) {
        _shelfDragEl = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
    }

    function _shelfDragOver(e, idx) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const cards = document.querySelectorAll('#shelfContentsList .shelf-movie-card');
        cards.forEach((c, i) => {
            c.classList.toggle('drag-over', i === idx && idx !== _shelfDragEl);
        });
    }

    function _shelfDrop(e, targetIdx) {
        e.preventDefault();
        if (_shelfDragEl === null || _shelfDragEl === targetIdx) return;

        const moved = _shelfContentsData.splice(_shelfDragEl, 1)[0];
        _shelfContentsData.splice(targetIdx, 0, moved);
        _shelfDragEl = null;
        _renderShelfContents();
    }

    function _shelfDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        document.querySelectorAll('#shelfContentsList .shelf-movie-card').forEach(c => c.classList.remove('drag-over'));
        _shelfDragEl = null;
    }

    // ── Sort and custom ordering ──
    function sortShelfContents(mode) {
        if (!_shelfContentsData || _shelfContentsData.length === 0) return;

        if (mode === 'custom') {
            _shelfDragMode = true;
            _shelfOriginalOrder = [..._shelfContentsData];
            _renderShelfContents();
            showToast('Drag items to reorder', 'info');
            return;
        }

        _shelfDragMode = false;

        const sorters = {
            title: (a, b) => {
                const tA = (a.display_title || a.title || a.container_name || '').toLowerCase();
                const tB = (b.display_title || b.title || b.container_name || '').toLowerCase();
                return tA.localeCompare(tB);
            },
            year: (a, b) => (a.year || 9999) - (b.year || 9999),
            format: (a, b) => {
                const fA = (a.format || a.container_format || '').toLowerCase();
                const fB = (b.format || b.container_format || '').toLowerCase();
                return fA.localeCompare(fB);
            }
        };

        if (sorters[mode]) {
            _shelfContentsData.sort(sorters[mode]);
        }

        _renderShelfContents();
        // Auto-save the sorted order, then refresh shelf views
        _saveShelfOrderToServer().then(() => refreshAllShelfViews());
    }

    async function saveShelfOrder() {
        await _saveShelfOrderToServer();
        _shelfDragMode = false;
        _renderShelfContents();
        showToast('Shelf order saved!', 'success');
        refreshAllShelfViews();
    }

    async function _saveShelfOrderToServer() {
        if (!currentShelf) return;
        const itemOrder = _shelfContentsData.map(item => {
            const isContainer = item.is_container === 1 || item.is_container === true;
            return {
                type: isContainer ? 'container' : 'copy',
                id: isContainer ? item.container_id : item.copy_id
            };
        });
        try {
            await apiCall('reorder_shelf_contents', {
                shelf_id: currentShelf.id,
                item_order: itemOrder
            });
        } catch (err) {
            console.error('Failed to save shelf order:', err);
            showToast('Failed to save order', 'error');
        }
    }

    function cancelShelfReorder() {
        _shelfContentsData = [..._shelfOriginalOrder];
        _shelfDragMode = false;
        _renderShelfContents();
    }

    function closeShelfContents() {
        document.getElementById('shelfContentsModal').classList.remove('active');
        currentShelf = null;
        _shelfDragMode = false;
    }

    async function removeFromShelf(copyId) {
        if (!confirm('Remove this movie from the shelf?')) {
            return;
        }

        try {
            await apiCall('remove_from_shelf', { copy_id: copyId });
            showToast('Movie removed from shelf', 'success');

            await refreshAllShelfViews();
        } catch (error) {
            console.error('Failed to remove from shelf:', error);
            showToast('Failed to remove from shelf', 'error');
        }
    }

    async function removeContainerFromShelf(containerId) {
        if (!confirm('Remove this box set from the shelf?')) {
            return;
        }

        try {
            await apiCall('remove_container_from_shelf', { container_id: containerId });
            showToast('Box set removed from shelf', 'success');

            await refreshAllShelfViews();
        } catch (error) {
            console.error('Failed to remove container from shelf:', error);
            showToast('Failed to remove container from shelf', 'error');
        }
    }

    async function viewUnassignedCopies() {
        try {
            // Load both unassigned movies AND unassigned containers (box sets)
            const [copies, containers] = await Promise.all([
                apiCall('get_unassigned_copies'),
                apiCall('get_unassigned_containers')
            ]);

            // Mark containers with is_container flag for rendering
            const containersWithFlag = containers.map(c => ({
                ...c,
                is_container: true,
                title: c.name, // Use container name as title for consistency
                display_title: c.name
            }));

            // Combine both into unassignedMovies array
            unassignedMovies = [...copies, ...containersWithFlag];

            selectedCopyIds.clear();
            renderUnassignedMovies();
            document.getElementById('unassignedModal').classList.add('active');
        } catch (error) {
            console.error('Failed to load unassigned copies:', error);
            showToast('Failed to load unassigned movies', 'error');
        }
    }

    function renderUnassignedMovies() {
        let filtered = [...unassignedMovies];

        // Apply search filter
        if (unassignedFilter.search) {
            const search = unassignedFilter.search.toLowerCase();
            filtered = filtered.filter(item =>
                (item.title || '').toLowerCase().includes(search) ||
                (item.display_title || '').toLowerCase().includes(search)
            );
        }

        // Apply type filter (movies vs box sets)
        if (unassignedFilter.type === 'movies') {
            filtered = filtered.filter(item => !item.is_container);
        } else if (unassignedFilter.type === 'boxsets') {
            filtered = filtered.filter(item => item.is_container);
        }

        // Apply director filter
        if (unassignedFilter.director !== 'all') {
            filtered = filtered.filter(item => item.director === unassignedFilter.director);
        }

        // Apply genre filter
        if (unassignedFilter.genre !== 'all') {
            filtered = filtered.filter(item =>
                item.genre && item.genre.includes(unassignedFilter.genre)
            );
        }

        // Apply studio filter
        if (unassignedFilter.studio !== 'all') {
            filtered = filtered.filter(item =>
                item.studio && item.studio.includes(unassignedFilter.studio)
            );
        }

        // Apply sort
        filtered.sort((a, b) => {
            const titleA = a.display_title || a.title || '';
            const titleB = b.display_title || b.title || '';

            switch (unassignedFilter.sort) {
                case 'title':
                    return titleA.localeCompare(titleB);
                case 'year':
                    return (b.year || 0) - (a.year || 0);
                case 'director':
                    return (a.director || '').localeCompare(b.director || '');
                default:
                    return 0;
            }
        });

        // Store filtered results for "Select All"
        filteredUnassignedMovies = filtered;

        const container = document.getElementById('unassignedList');
        const emptyState = document.getElementById('emptyUnassigned');

        // Update selection count
        const selectionCount = document.getElementById('unassignedSelectionCount');
        if (selectionCount) {
            selectionCount.textContent = selectedCopyIds.size > 0 ? `${selectedCopyIds.size} selected` : '';
        }

        if (!filtered || filtered.length === 0) {
            container.innerHTML = unassignedMovies.length === 0
                ? ''
                : '<div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.6);">No movies match your filters</div>';
            if (emptyState && unassignedMovies.length === 0) emptyState.style.display = 'block';
        } else {
            if (emptyState) emptyState.style.display = 'none';

            container.innerHTML = filtered.map(item => {
                // Handle both regular copies and containers (box sets)
                const itemId = item.is_container ? `container_${item.container_id}` : item.copy_id;
                const isSelected = selectedCopyIds.has(itemId);

                if (item.is_container) {
                    // Render box set / container - use custom poster if available
                    const hasCustomCover = item.spine_image_type === 'custom' && item.spine_image_url;
                    const containerPosterHTML = hasCustomCover
                        ? `<img src="${item.spine_image_url}" alt="${item.name}" class="unassigned-movie-poster" style="object-fit: cover;"
                                onclick="App.toggleMovieSelection('${itemId}')"
                                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
                          + `<div class="container-poster" style="display:none; background: ${item.spine_color || '#667eea'}; align-items: center; justify-content: center; font-size: 3rem;"
                                 onclick="App.toggleMovieSelection('${itemId}')">📦</div>`
                        : `<div class="container-poster" style="background: ${item.spine_color || '#667eea'}; display: flex; align-items: center; justify-content: center; font-size: 3rem;"
                                 onclick="App.toggleMovieSelection('${itemId}')">📦</div>`;
                    return `
                        <div class="unassigned-movie-card ${isSelected ? 'selected' : ''} container-card" data-item-id="${itemId}">
                            <input type="checkbox"
                                   class="movie-checkbox"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="App.toggleMovieSelection('${itemId}')"
                                   onclick="event.stopPropagation()">
                            ${containerPosterHTML}
                            <div class="unassigned-movie-info" onclick="App.toggleMovieSelection('${itemId}')">
                                <h4>${item.name}</h4>
                                <p style="color: rgba(255,255,255,0.8);">${item.movie_count} movie${item.movie_count !== 1 ? 's' : ''}</p>
                                <div class="unassigned-movie-format">${item.format || 'Box Set'}</div>
                            </div>
                        </div>
                    `;
                } else {
                    // Render regular movie copy — prefer UMDB edition cover over generic movie poster
                    const copyPoster = item.edition_cover_url || item.poster_url || PLACEHOLDER_IMG;
                    const umdbBadge = item.edition_umdb_release_id ? ' <span class="umdb-link-badge" style="font-size:0.65rem;vertical-align:middle;">UMDB</span>' : '';
                    return `
                        <div class="unassigned-movie-card ${isSelected ? 'selected' : ''}" data-item-id="${itemId}">
                            <input type="checkbox"
                                   class="movie-checkbox"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="App.toggleMovieSelection(${item.copy_id})"
                                   onclick="event.stopPropagation()">
                            <img src="${copyPoster}"
                                 alt="${item.title}"
                                 class="unassigned-movie-poster"
                                 onerror="this.onerror=null;this.src='${item.poster_url || PLACEHOLDER_IMG}'"
                                 onclick="App.toggleMovieSelection(${item.copy_id})">
                            <div class="unassigned-movie-info" onclick="App.toggleMovieSelection(${item.copy_id})">
                                <h4>${item.display_title || item.title}${umdbBadge}</h4>
                                <p>${item.year || 'N/A'}</p>
                                ${item.director ? `<p style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">${item.director}</p>` : ''}
                                <div class="unassigned-movie-format">${item.format}</div>
                            </div>
                        </div>
                    `;
                }
            }).join('');
        }

        // Update filter dropdowns with unique values
        updateUnassignedFilters();
    }

    function updateUnassignedFilters() {
        // Get unique directors
        const directors = new Set();
        unassignedMovies.forEach(item => {
            if (item.director) directors.add(item.director);
        });

        const directorSelect = document.getElementById('unassignedDirectorFilter');
        if (directorSelect) {
            directorSelect.innerHTML = '<option value="all">All Directors</option>' +
                Array.from(directors).sort().map(d =>
                    `<option value="${d}" ${unassignedFilter.director === d ? 'selected' : ''}>${d}</option>`
                ).join('');
        }

        // Get unique genres
        const genres = new Set();
        unassignedMovies.forEach(item => {
            if (item.genre) {
                item.genre.split(',').forEach(g => genres.add(g.trim()));
            }
        });

        const genreSelect = document.getElementById('unassignedGenreFilter');
        if (genreSelect) {
            genreSelect.innerHTML = '<option value="all">All Genres</option>' +
                Array.from(genres).sort().map(g =>
                    `<option value="${g}" ${unassignedFilter.genre === g ? 'selected' : ''}>${g}</option>`
                ).join('');
        }

        // Get unique studios
        const studios = new Set();
        unassignedMovies.forEach(item => {
            if (item.studio && item.studio !== 'N/A') {
                studios.add(item.studio);
            }
        });

        const studioSelect = document.getElementById('unassignedStudioFilter');
        if (studioSelect) {
            studioSelect.innerHTML = '<option value="all">All Studios</option>' +
                Array.from(studios).sort().map(s =>
                    `<option value="${s}" ${unassignedFilter.studio === s ? 'selected' : ''}>${s}</option>`
                ).join('');
        }
    }

    function toggleMovieSelection(copyId) {
        if (selectedCopyIds.has(copyId)) {
            selectedCopyIds.delete(copyId);
        } else {
            selectedCopyIds.add(copyId);
        }
        renderUnassignedMovies();
    }

    function selectAllUnassigned() {
        // Only select the currently filtered/visible movies and containers
        filteredUnassignedMovies.forEach(item => {
            const itemId = item.is_container ? `container_${item.container_id}` : item.copy_id;
            selectedCopyIds.add(itemId);
        });
        renderUnassignedMovies();
    }

    function deselectAllUnassigned() {
        selectedCopyIds.clear();
        renderUnassignedMovies();
    }

    function onUnassignedFilterChange(filterType, value) {
        unassignedFilter[filterType] = value;
        renderUnassignedMovies();
    }

    function closeUnassignedModal() {
        document.getElementById('unassignedModal').classList.remove('active');
    }

    function openAssignToShelf(copyId, movieTitle) {
        // If called with specific movie, use that; otherwise use selected movies
        if (copyId) {
            selectedCopyIds.clear();
            selectedCopyIds.add(copyId);
        }

        if (selectedCopyIds.size === 0) {
            showToast('Please select at least one movie', 'error');
            return;
        }

        const count = selectedCopyIds.size;
        document.getElementById('assignMovieTitle').textContent = count === 1
            ? `Assign "${movieTitle || 'movie'}" to shelf:`
            : `Assign ${count} movies to shelf:`;

        // Populate shelf dropdown
        const select = document.getElementById('assignShelfSelect');
        select.innerHTML = '<option value="">Choose a shelf...</option>' +
            shelves.map(shelf => `<option value="${shelf.id}">${shelf.name}</option>`).join('');

        document.getElementById('assignNotes').value = '';
        document.getElementById('assignToShelfModal').classList.add('active');
    }

    async function confirmAssignToShelf() {
        const shelfId = parseInt(document.getElementById('assignShelfSelect').value);
        if (!shelfId) {
            showToast('Please select a shelf', 'error');
            return;
        }

        const notes = document.getElementById('assignNotes').value.trim();
        const itemIds = Array.from(selectedCopyIds);

        try {
            let successCount = 0;
            let errorCount = 0;

            // Assign each selected item (movie or container)
            for (const itemId of itemIds) {
                try {
                    // Check if this is a container or a regular copy
                    if (typeof itemId === 'string' && itemId.startsWith('container_')) {
                        // It's a container - extract container_id and call container assignment endpoint
                        const containerId = parseInt(itemId.replace('container_', ''));
                        await apiCall('assign_container_to_shelf', {
                            shelf_id: shelfId,
                            container_id: containerId
                        });
                    } else {
                        // It's a regular copy
                        await apiCall('assign_to_shelf', {
                            shelf_id: shelfId,
                            copy_id: itemId
                        });
                    }
                    successCount++;
                } catch (e) {
                    errorCount++;
                    console.error('Failed to assign item', itemId, e);
                }
            }

            if (successCount > 0) {
                showToast(`${successCount} item${successCount > 1 ? 's' : ''} assigned to shelf!`, 'success');
            }
            if (errorCount > 0) {
                showToast(`${errorCount} item${errorCount > 1 ? 's' : ''} failed to assign`, 'error');
            }

            closeAssignToShelf();
            selectedCopyIds.clear();

            // Reload unassigned movies AND containers
            const [copies, containers] = await Promise.all([
                apiCall('get_unassigned_copies'),
                apiCall('get_unassigned_containers')
            ]);

            const containersWithFlag = containers.map(c => ({
                ...c,
                is_container: true,
                title: c.name,
                display_title: c.name
            }));

            unassignedMovies = [...copies, ...containersWithFlag];

            // Reset filters to show all movies
            unassignedFilter = {
                search: '',
                sort: 'title',
                type: 'all',
                director: 'all',
                genre: 'all',
                studio: 'all'
            };

            // Reset filter UI controls
            const searchInput = document.getElementById('unassignedSearch');
            if (searchInput) searchInput.value = '';

            const typeSelect = document.getElementById('unassignedTypeFilter');
            if (typeSelect) typeSelect.value = 'all';

            const sortSelect = document.getElementById('unassignedSortFilter');
            if (sortSelect) sortSelect.value = 'title';

            const directorSelect = document.getElementById('unassignedDirectorFilter');
            if (directorSelect) directorSelect.value = 'all';

            const genreSelect = document.getElementById('unassignedGenreFilter');
            if (genreSelect) genreSelect.value = 'all';

            const studioSelect = document.getElementById('unassignedStudioFilter');
            if (studioSelect) studioSelect.value = 'all';

            renderUnassignedMovies();

            // Reload all shelf views (list, visual, shelf-view browser, contents panel)
            await refreshAllShelfViews();
        } catch (error) {
            console.error('Failed to assign to shelf:', error);
            showToast('Failed to assign to shelf', 'error');
        }
    }

    function closeAssignToShelf() {
        document.getElementById('assignToShelfModal').classList.remove('active');
        assignCopyId = null;
    }

    async function addMoviesToShelf() {
        if (!currentShelf) return;
        closeShelfContents();
        viewUnassignedCopies();
    }

    function printShelfLayout() {
        window.print();
    }

    // ========================================
    // SPREADSHEET / BULK DATA EDITOR
    // ========================================

    let spreadsheetData = [];       // Current loaded data (copies or containers)
    let spreadsheetOriginal = [];   // Original data snapshot for change detection
    let spreadsheetChanges = {};    // Track changes: { rowId: { field: newValue, ... } }
    let spreadsheetType = 'copies'; // 'copies' or 'boxsets'

    async function loadSpreadsheetData() {
        spreadsheetType = document.getElementById('spreadsheetDataType')?.value || 'copies';
        const container = document.getElementById('spreadsheetContainer');
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:rgba(255,255,255,0.5);">Loading data...</div>';

        spreadsheetChanges = {};
        updateSpreadsheetChangeCount();

        try {
            if (spreadsheetType === 'copies') {
                spreadsheetData = await apiCall('list_all_copies_detailed');
            } else {
                spreadsheetData = await apiCall('list_all_containers_detailed');
            }
            spreadsheetOriginal = JSON.parse(JSON.stringify(spreadsheetData));
            renderSpreadsheet();
        } catch (error) {
            console.error('Failed to load spreadsheet data:', error);
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:#ff6b6b;">Failed to load data. Please try again.</div>';
        }
    }

    function renderSpreadsheet() {
        const container = document.getElementById('spreadsheetContainer');
        const searchTerm = (document.getElementById('spreadsheetSearch')?.value || '').toLowerCase();

        let filtered = spreadsheetData;
        if (searchTerm) {
            filtered = spreadsheetData.filter(item => {
                const title = (item.display_title || item.title || item.name || '').toLowerCase();
                return title.includes(searchTerm);
            });
        }

        if (!filtered || filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:rgba(255,255,255,0.5);">No data found.</div>';
            return;
        }

        if (spreadsheetType === 'copies') {
            container.innerHTML = renderCopiesSpreadsheet(filtered);
        } else {
            container.innerHTML = renderContainersSpreadsheet(filtered);
        }
    }

    function buildSelectOptions(presets, currentValue, includeEmpty) {
        let opts = '';
        if (includeEmpty) opts += '<option value="">--</option>';
        const normalizedPresets = presets.map(p => p.toLowerCase());
        let matched = !currentValue || currentValue === '';
        presets.forEach(p => {
            const selected = currentValue && currentValue.toLowerCase() === p.toLowerCase() ? ' selected' : '';
            if (selected) matched = true;
            opts += `<option value="${p}"${selected}>${p}</option>`;
        });
        // If stored value doesn't match any preset, add it as a visible option
        if (!matched && currentValue) {
            opts += `<option value="${currentValue}" selected>${currentValue}</option>`;
        }
        opts += '<option value="__custom__">Custom...</option>';
        return opts;
    }

    function handleSpreadsheetCustomSelect(selectEl, rowId, field) {
        if (selectEl.value === '__custom__') {
            const custom = prompt('Enter custom value:');
            if (custom && custom.trim()) {
                const trimmed = custom.trim();
                // Add the custom value as an option and select it
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed;
                opt.selected = true;
                selectEl.insertBefore(opt, selectEl.querySelector('option[value="__custom__"]'));
                onSpreadsheetChange(rowId, field, trimmed);
            } else {
                // Revert to previous value
                const changes = spreadsheetChanges[rowId] || {};
                const original = spreadsheetType === 'copies'
                    ? spreadsheetOriginal.find(i => i.copy_id == rowId)
                    : spreadsheetOriginal.find(i => `c_${i.container_id}` === String(rowId));
                const origField = field === 'condition'
                    ? (spreadsheetType === 'copies' ? 'copy_condition' : 'container_condition')
                    : field;
                selectEl.value = changes[field] || (original ? original[origField] : '') || '';
            }
        } else {
            onSpreadsheetChange(rowId, field, selectEl.value);
        }
    }

    const FORMAT_PRESETS = ['DVD', 'Blu-ray', '4K UHD', 'Digital', 'VHS', 'Laserdisc', '16mm', 'DVD Box Set', 'Blu-ray Box Set', '4K UHD Box Set'];
    const CONDITION_PRESETS = ['Mint', 'Like New', 'Good', 'Fair', 'Poor'];
    const REGION_PRESETS = ['Region 1', 'Region 2', 'Region 3', 'Region 4', 'Region 5', 'Region 6', 'Region A', 'Region B', 'Region C', 'Region Free'];
    const BOXSET_FORMAT_PRESETS = ['DVD Box Set', 'Blu-ray Box Set', '4K UHD Box Set', 'Mixed Format Set', 'Double Feature', 'Triple Feature', 'Steelbook Set', 'Criterion Collection', 'Collection'];
    const EDITION_PRESETS = ['Standard', "Director's Cut", 'Special Edition', 'Limited Edition', 'Collector\'s Edition', 'Unrated', 'Extended', 'Theatrical', 'Anniversary Edition', 'Criterion', 'Steelbook', 'Slipcover'];
    const BOXSET_REGION_PRESETS = ['Region 1', 'Region 2', 'Region A', 'Region B', 'Region Free'];

    function renderCopiesSpreadsheet(data) {

        let html = `<table class="spreadsheet-table">
            <thead><tr>
                <th></th>
                <th>Title</th>
                <th>Year</th>
                <th>Format</th>
                <th>Edition</th>
                <th>Region</th>
                <th>Condition</th>
                <th>Notes</th>
                <th>Director</th>
                <th>TMDB</th>
            </tr></thead><tbody>`;

        data.forEach(item => {
            const id = item.copy_id;
            const title = item.display_title || item.title || 'Unknown';
            const poster = item.poster_url || '';
            const changes = spreadsheetChanges[id] || {};
            const changed = Object.keys(changes).length > 0;
            const missingData = !item.director || !item.genre || !item.actors;

            const curFormat = changes.format || item.format || '';
            const curEdition = changes.edition !== undefined ? changes.edition : item.edition || '';
            const curRegion = changes.region || item.region || '';
            const curCondition = changes.condition || item.copy_condition || '';

            html += `<tr class="${changed ? 'spreadsheet-row-changed' : ''}" data-copy-id="${id}">
                <td>${poster ? `<img src="${poster}" class="spreadsheet-poster" alt="">` : '<div style="width:35px;height:52px;background:rgba(255,255,255,0.05);border-radius:3px;"></div>'}</td>
                <td class="spreadsheet-title" title="${title.replace(/"/g, '&quot;')}"><a href="#" onclick="event.preventDefault(); App.viewMovieDetails(${item.movie_id})">${title}</a></td>
                <td>${item.year || ''}</td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, ${id}, 'format')" class="${changes.format ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(FORMAT_PRESETS, curFormat, false)}
                </select></td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, ${id}, 'edition')" class="${changes.edition !== undefined ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(EDITION_PRESETS, curEdition, true)}
                </select></td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, ${id}, 'region')" class="${changes.region ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(REGION_PRESETS, curRegion, true)}
                </select></td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, ${id}, 'condition')" class="${changes.condition ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(CONDITION_PRESETS, curCondition, false)}
                </select></td>
                <td><input type="text" value="${(changes.notes !== undefined ? changes.notes : item.notes || '').replace(/"/g, '&quot;')}" onchange="App.onSpreadsheetChange(${id}, 'notes', this.value)" class="${changes.notes !== undefined ? 'spreadsheet-cell-changed' : ''}" placeholder="Notes..." style="min-width:120px;"></td>
                <td style="color:rgba(255,255,255,0.5); font-size:0.8rem;">${item.director || '—'}</td>
                <td>${missingData ? `<button class="btn-fetch-tmdb" onclick="App.fetchTmdbForCopy(${id}, ${item.tmdb_id})">🔄</button>` : '<span style="color:#4caf50; font-size:0.8rem;">✓</span>'}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }

    function renderContainersSpreadsheet(data) {

        let html = `<table class="spreadsheet-table">
            <thead><tr>
                <th>Name</th>
                <th>Movies</th>
                <th>Format</th>
                <th>Edition</th>
                <th>Region</th>
                <th>Condition</th>
            </tr></thead><tbody>`;

        data.forEach(item => {
            const id = item.container_id;
            const changes = spreadsheetChanges[`c_${id}`] || {};
            const changed = Object.keys(changes).length > 0;

            const curFormat = changes.format || item.format || '';
            const curEdition = changes.edition !== undefined ? changes.edition : item.edition || '';
            const curRegion = changes.region || item.region || '';
            const curCondition = changes.condition || item.container_condition || '';

            html += `<tr class="${changed ? 'spreadsheet-row-changed' : ''}" data-container-id="${id}">
                <td class="spreadsheet-title" style="font-weight:600;">📦 ${item.name || 'Unnamed'}</td>
                <td style="text-align:center;">${item.movie_count || 0}</td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, 'c_${id}', 'format')" class="${changes.format ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(BOXSET_FORMAT_PRESETS, curFormat, false)}
                </select></td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, 'c_${id}', 'edition')" class="${changes.edition !== undefined ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(EDITION_PRESETS, curEdition, true)}
                </select></td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, 'c_${id}', 'region')" class="${changes.region ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(BOXSET_REGION_PRESETS, curRegion, true)}
                </select></td>
                <td><select onchange="App.handleSpreadsheetCustomSelect(this, 'c_${id}', 'condition')" class="${changes.condition ? 'spreadsheet-cell-changed' : ''}">
                    ${buildSelectOptions(CONDITION_PRESETS, curCondition, false)}
                </select></td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }

    function onSpreadsheetChange(rowId, field, value) {
        if (!spreadsheetChanges[rowId]) {
            spreadsheetChanges[rowId] = {};
        }

        // Check if value differs from original
        const original = spreadsheetType === 'copies'
            ? spreadsheetOriginal.find(i => i.copy_id == rowId)
            : spreadsheetOriginal.find(i => `c_${i.container_id}` === String(rowId));

        const origField = field === 'condition'
            ? (spreadsheetType === 'copies' ? 'copy_condition' : 'container_condition')
            : field;
        const origValue = original ? (original[origField] || '') : '';

        if (value === origValue) {
            delete spreadsheetChanges[rowId][field];
            if (Object.keys(spreadsheetChanges[rowId]).length === 0) {
                delete spreadsheetChanges[rowId];
            }
        } else {
            spreadsheetChanges[rowId][field] = value;
        }

        updateSpreadsheetChangeCount();

        // Highlight changed cell
        const rowSelector = spreadsheetType === 'copies'
            ? `tr[data-copy-id="${rowId}"]`
            : `tr[data-container-id="${String(rowId).replace('c_', '')}"]`;
        const row = document.querySelector(rowSelector);
        if (row) {
            row.classList.toggle('spreadsheet-row-changed', !!spreadsheetChanges[rowId]);
        }
    }

    function updateSpreadsheetChangeCount() {
        const count = Object.keys(spreadsheetChanges).length;
        const badge = document.getElementById('spreadsheetChangeCount');
        const saveBtn = document.getElementById('spreadsheetSaveBtn');
        if (badge) {
            badge.textContent = `${count} change${count !== 1 ? 's' : ''}`;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
        if (saveBtn) {
            saveBtn.disabled = count === 0;
        }
    }

    function filterSpreadsheet() {
        renderSpreadsheet();
    }

    async function saveSpreadsheetChanges() {
        const changeCount = Object.keys(spreadsheetChanges).length;
        if (changeCount === 0) {
            showToast('No changes to save', 'info');
            return;
        }

        if (!confirm(`Save ${changeCount} change${changeCount !== 1 ? 's' : ''}?`)) return;

        try {
            if (spreadsheetType === 'copies') {
                const updates = Object.entries(spreadsheetChanges).map(([copyId, fields]) => ({
                    copy_id: parseInt(copyId),
                    ...fields
                }));
                const result = await apiCall('bulk_update_copies', { updates });
                showToast(`Updated ${result.updated} copies`, 'success');
            } else {
                const updates = Object.entries(spreadsheetChanges).map(([key, fields]) => ({
                    container_id: parseInt(key.replace('c_', '')),
                    ...fields
                }));
                const result = await apiCall('bulk_update_containers', { updates });
                showToast(`Updated ${result.updated} box sets`, 'success');
            }

            spreadsheetChanges = {};
            updateSpreadsheetChangeCount();
            await loadSpreadsheetData();
            loadCollection();
        } catch (error) {
            console.error('Bulk save failed:', error);
            showToast('Failed to save changes', 'error');
        }
    }

    async function fetchTmdbForCopy(copyId, tmdbId) {
        if (!tmdbId) {
            showToast('No TMDB ID available for this title', 'error');
            return;
        }
        try {
            showToast('Fetching TMDB data...', 'info');
            const data = await apiCall('get_or_create_movie', { tmdb_id: tmdbId, cert_region: settings.certRegion || 'US' });
            if (data) {
                showToast(`Updated data for "${data.title}"`, 'success');
                await loadSpreadsheetData();
            }
        } catch (error) {
            console.error('TMDB fetch failed:', error);
            showToast('Failed to fetch TMDB data', 'error');
        }
    }

    async function fetchMissingTmdbData() {
        if (spreadsheetType !== 'copies') {
            showToast('TMDB fetch only works for individual copies', 'info');
            return;
        }

        const missing = spreadsheetData.filter(item => !item.director || !item.genre || !item.actors);
        if (missing.length === 0) {
            showToast('All entries have complete data!', 'success');
            return;
        }

        if (!confirm(`Fetch TMDB data for ${missing.length} entries with missing info?`)) return;

        showToast(`Fetching data for ${missing.length} entries...`, 'info');
        let updated = 0;
        for (const item of missing) {
            if (!item.tmdb_id) continue;
            try {
                await apiCall('get_or_create_movie', { tmdb_id: item.tmdb_id, cert_region: settings.certRegion || 'US' });
                updated++;
            } catch (e) {
                console.error('Failed for:', item.title, e);
            }
            // Small delay to respect rate limits
            await new Promise(r => setTimeout(r, 300));
        }

        showToast(`Updated ${updated} entries`, 'success');
        await loadSpreadsheetData();
    }

    // ========================================
    // BOX SET COVER FIELD DETECTION (AI)
    // ========================================

    let detectedFieldData = null;

    async function scanBoxSetCoverForFields() {
        // Use a file input to capture photo
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show modal with loading
            document.getElementById('boxSetFieldDetectModal').classList.add('active');
            document.getElementById('boxSetFieldDetectLoading').style.display = 'block';
            document.getElementById('boxSetFieldDetectContent').style.display = 'none';

            try {
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const maxDim = 1920;
                            let w = img.width, h = img.height;
                            if (w > maxDim || h > maxDim) {
                                const scale = maxDim / Math.max(w, h);
                                w = Math.round(w * scale);
                                h = Math.round(h * scale);
                            }
                            canvas.width = w;
                            canvas.height = h;
                            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                            resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                });

                const resp = await fetch('/api/api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ action: 'scan_boxset_cover_fields', image: base64 })
                });
                const result = await resp.json();

                if (!result.ok || !result.data) {
                    showToast('AI analysis failed: ' + (result.error || 'Unknown error'), 'error');
                    closeBoxSetFieldDetect();
                    return;
                }

                detectedFieldData = result.data;
                renderDetectedFields(result.data);

            } catch (error) {
                console.error('Cover field scan error:', error);
                showToast('Failed to analyze cover', 'error');
                closeBoxSetFieldDetect();
            }
        };

        input.click();
    }

    function renderDetectedFields(data) {
        document.getElementById('boxSetFieldDetectLoading').style.display = 'none';
        document.getElementById('boxSetFieldDetectContent').style.display = 'block';

        const phrases = data.detected_phrases || [];
        const suggested = data.suggested || {};

        // Render detected phrases as clickable chips
        const phrasesContainer = document.getElementById('detectedPhrasesContainer');
        const fieldNames = ['title', 'spine_label', 'edition', 'format', 'version'];
        const fieldLabels = { title: 'Title', spine_label: 'Spine', edition: 'Edition', format: 'Format', version: 'Version' };

        phrasesContainer.innerHTML = phrases.map((phrase, idx) => {
            // Check if this phrase was suggested for any field
            let assignedField = '';
            for (const [field, value] of Object.entries(suggested)) {
                if (value && value.toLowerCase() === phrase.toLowerCase()) {
                    assignedField = field;
                    break;
                }
            }

            return `<div class="detected-phrase ${assignedField ? 'assigned' : ''}"
                         onclick="App.cycleDetectedPhraseField(${idx})"
                         data-phrase-idx="${idx}"
                         data-assigned-field="${assignedField}">
                <span>${phrase}</span>
                ${assignedField ? `<span class="phrase-field-tag">${fieldLabels[assignedField] || assignedField}</span>` : ''}
            </div>`;
        }).join('');

        // Pre-fill the field inputs with suggested values
        const titleInput = document.getElementById('fieldDetectTitle');
        const spineInput = document.getElementById('fieldDetectSpine');
        const editionInput = document.getElementById('fieldDetectEdition');
        const formatSelect = document.getElementById('fieldDetectFormat');
        const versionInput = document.getElementById('fieldDetectVersion');

        if (suggested.title) titleInput.value = suggested.title;
        if (suggested.spine_label) spineInput.value = suggested.spine_label;
        if (suggested.edition) editionInput.value = suggested.edition;
        if (suggested.version) versionInput.value = suggested.version;

        // Try to match format to dropdown
        if (suggested.format) {
            const formatLower = suggested.format.toLowerCase();
            if (formatLower.includes('dvd')) formatSelect.value = 'DVD Box Set';
            else if (formatLower.includes('4k') || formatLower.includes('uhd')) formatSelect.value = '4K UHD Box Set';
            else if (formatLower.includes('blu')) formatSelect.value = 'Blu-ray Box Set';
            else formatSelect.value = '';
        }
    }

    function cycleDetectedPhraseField(idx) {
        const phraseEl = document.querySelector(`.detected-phrase[data-phrase-idx="${idx}"]`);
        if (!phraseEl) return;

        const fieldNames = ['', 'title', 'spine_label', 'edition', 'format', 'version'];
        const fieldLabels = { title: 'Title', spine_label: 'Spine', edition: 'Edition', format: 'Format', version: 'Version' };
        const currentField = phraseEl.dataset.assignedField || '';
        const currentIdx = fieldNames.indexOf(currentField);
        const nextField = fieldNames[(currentIdx + 1) % fieldNames.length];

        phraseEl.dataset.assignedField = nextField;
        phraseEl.classList.toggle('assigned', !!nextField);

        // Update the tag
        const existingTag = phraseEl.querySelector('.phrase-field-tag');
        if (existingTag) existingTag.remove();
        if (nextField) {
            const tag = document.createElement('span');
            tag.className = 'phrase-field-tag';
            tag.textContent = fieldLabels[nextField] || nextField;
            phraseEl.appendChild(tag);
        }

        // Update the corresponding input field
        const phraseText = phraseEl.querySelector('span').textContent;
        const fieldInputMap = {
            title: 'fieldDetectTitle',
            spine_label: 'fieldDetectSpine',
            edition: 'fieldDetectEdition',
            version: 'fieldDetectVersion'
        };

        if (nextField && fieldInputMap[nextField]) {
            document.getElementById(fieldInputMap[nextField]).value = phraseText;
        }
        if (nextField === 'format') {
            const formatLower = phraseText.toLowerCase();
            const formatSelect = document.getElementById('fieldDetectFormat');
            if (formatLower.includes('dvd')) formatSelect.value = 'DVD Box Set';
            else if (formatLower.includes('4k') || formatLower.includes('uhd')) formatSelect.value = '4K UHD Box Set';
            else if (formatLower.includes('blu')) formatSelect.value = 'Blu-ray Box Set';
        }
    }

    function applyDetectedFields() {
        const title = document.getElementById('fieldDetectTitle').value.trim();
        const spine = document.getElementById('fieldDetectSpine').value.trim();
        const edition = document.getElementById('fieldDetectEdition').value.trim();
        const format = document.getElementById('fieldDetectFormat').value;
        const version = document.getElementById('fieldDetectVersion').value.trim();

        // Apply to box set step 1 form
        if (title) document.getElementById('boxSetName').value = title;
        if (spine) document.getElementById('boxSetSpineLabel').value = spine;
        if (format) document.getElementById('boxSetFormat').value = format;

        // Apply edition - check if it matches a dropdown option, otherwise set as custom
        if (edition) {
            const editionSelect = document.getElementById('boxSetEdition');
            const matchingOption = Array.from(editionSelect.options).find(
                opt => opt.value.toLowerCase() === edition.toLowerCase()
            );
            if (matchingOption) {
                editionSelect.value = matchingOption.value;
            } else {
                editionSelect.value = edition;
                // Add custom option if needed
                if (!Array.from(editionSelect.options).find(o => o.value === edition)) {
                    const opt = document.createElement('option');
                    opt.value = edition;
                    opt.textContent = edition;
                    editionSelect.insertBefore(opt, editionSelect.querySelector('option[value="__custom__"]'));
                    editionSelect.value = edition;
                }
            }
        }

        // If version info, append to notes
        if (version) {
            const notesEl = document.getElementById('boxSetNotes');
            const existing = notesEl.value.trim();
            notesEl.value = existing ? `${existing}\nVersion: ${version}` : `Version: ${version}`;
        }

        closeBoxSetFieldDetect();
        showToast('Fields populated from cover scan!', 'success');
    }

    function closeBoxSetFieldDetect() {
        document.getElementById('boxSetFieldDetectModal').classList.remove('active');
        detectedFieldData = null;
    }

    // ========================================
    // BOX SET MOVIE SCANNER (Camera-based, Quick Scan style)
    // ========================================

    let boxSetScannerStream = null;
    let boxSetScanList = [];

    async function openBoxSetScanner() {
        if (!currentContainerId) {
            showToast('Create the box set first', 'error');
            return;
        }

        document.getElementById('boxSetScannerModal').classList.add('active');
        boxSetScanList = [];
        renderBoxSetScanList();
        updateBoxSetScanCount();

        const video = document.getElementById('boxSetScannerVideo');

        try {
            const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            if (iOS) {
                try {
                    boxSetScannerStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
                    });
                } catch (err) {
                    try {
                        boxSetScannerStream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                        });
                    } catch (err2) {
                        boxSetScannerStream = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
                        });
                    }
                }
            } else {
                try {
                    boxSetScannerStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
                    });
                } catch (err) {
                    boxSetScannerStream = await navigator.mediaDevices.getUserMedia({ video: true });
                }
            }

            video.srcObject = boxSetScannerStream;
            if (iOS) {
                video.setAttribute('playsinline', 'true');
                video.setAttribute('webkit-playsinline', 'true');
            }
            await video.play();
        } catch (error) {
            console.error('Camera error:', error);
            closeBoxSetScanner();
            if (error.name === 'NotFoundError') {
                alert('No camera found on this device');
            } else if (error.name === 'NotAllowedError') {
                alert('Camera permission denied. Please allow camera access in your browser settings.');
            } else {
                alert('Camera error: ' + error.message);
            }
        }
    }

    async function boxSetScanCapture() {
        if (!boxSetScannerStream) return;

        const btn = document.getElementById('boxSetCaptureBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>🔄</span><span>Analyzing...</span>';

        try {
            const video = document.getElementById('boxSetScannerVideo');
            const canvas = document.getElementById('boxSetScannerCanvas');
            const ctx = canvas.getContext('2d');

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            const base64Image = imageData.split(',')[1];

            // Use the existing scan_cover_image to get a single title
            const response = await fetch('/api/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ action: 'scan_cover_image', image: base64Image })
            });
            const result = await response.json();

            if (result.ok && result.data?.title && result.data.title !== 'UNKNOWN') {
                const title = result.data.title.trim();
                boxSetScanList.push({ id: Date.now(), title, timestamp: new Date().toISOString() });
                renderBoxSetScanList();
                updateBoxSetScanCount();

                // Flash success
                document.getElementById('boxSetScannerPreview').style.background = '#10b981';
                setTimeout(() => {
                    document.getElementById('boxSetScannerPreview').style.background = '';
                }, 300);

                showToast(`Detected: "${title}"`, 'success');
            } else {
                showToast('Could not recognize title. Try again.', 'error');
            }
        } catch (error) {
            console.error('Box set scan error:', error);
            showToast('Scan error: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }

    function renderBoxSetScanList() {
        const container = document.getElementById('boxSetScanList');
        if (boxSetScanList.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding:2rem;">Scan a cover to detect movie titles.</p>';
            return;
        }
        container.innerHTML = boxSetScanList.map(item => `
            <div class="scan-batch-item" data-id="${item.id}">
                <div style="flex:1;">
                    <div style="font-weight:600; margin-bottom:0.25rem;">${item.title}</div>
                    <div style="font-size:0.75rem; color:#666;">${new Date(item.timestamp).toLocaleTimeString()}</div>
                </div>
                <button onclick="App.removeBoxSetScanItem(${item.id})" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:1.2rem; padding:0.5rem;" title="Remove">✕</button>
            </div>
        `).join('');
    }

    function removeBoxSetScanItem(id) {
        boxSetScanList = boxSetScanList.filter(item => item.id !== id);
        renderBoxSetScanList();
        updateBoxSetScanCount();
    }

    function clearBoxSetScanList() {
        if (boxSetScanList.length > 0 && !confirm('Clear all scanned titles?')) return;
        boxSetScanList = [];
        renderBoxSetScanList();
        updateBoxSetScanCount();
    }

    function updateBoxSetScanCount() {
        const badge = document.getElementById('boxSetScanCount');
        if (badge) {
            badge.textContent = boxSetScanList.length;
            badge.style.display = boxSetScanList.length > 0 ? 'inline' : 'none';
        }
    }

    async function processBoxSetScanBatch() {
        if (boxSetScanList.length === 0) {
            showToast('No titles to process', 'info');
            return;
        }

        const btn = document.getElementById('boxSetProcessBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Processing...</span>';

        let added = 0;
        const resultsDiv = document.getElementById('boxSetSearchResults');

        try {
            closeBoxSetScanner();

            for (const item of boxSetScanList) {
                try {
                    // Search TMDB for the title
                    const data = await apiCall('search_movies', { query: item.title });
                    if (data?.results?.length > 0) {
                        const movie = data.results[0];
                        // Add the best match to box set
                        await addMovieToBoxSet(movie.id);
                        added++;
                    } else {
                        showToast(`No TMDB match for "${item.title}"`, 'error');
                    }
                } catch (err) {
                    console.error('Failed to process:', item.title, err);
                }
                await new Promise(r => setTimeout(r, 200));
            }

            boxSetScanList = [];
            showToast(`Added ${added} movie${added !== 1 ? 's' : ''} to box set!`, 'success');

        } catch (error) {
            console.error('Process batch error:', error);
            showToast('Failed to process batch', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>✅</span><span>Add All to Box Set</span>';
        }
    }

    function closeBoxSetScanner() {
        if (boxSetScannerStream) {
            boxSetScannerStream.getTracks().forEach(track => track.stop());
            boxSetScannerStream = null;
        }
        document.getElementById('boxSetScannerModal').classList.remove('active');
    }

    // ========================================
    // SHELF LAYOUT PROFILES (v5.0.0)
    // ========================================

    let layoutProfiles = [];
    let _wizardPlan = null;          // last generated plan
    let _wizardSections = [];        // recipe sections being built
    let _sectionIdCounter = 0;       // auto-increment for section IDs
    let _typeaheadTimer = null;      // debounce handle for typeahead search
    let _wizardMasterShelfId = null; // master shelf ID used for materialization (v2.8.27)

    async function loadLayoutProfiles() {
        try {
            layoutProfiles = await apiCall('list_shelf_layouts');
            _renderLayoutSelector();
        } catch (e) {
            console.warn('Could not load layout profiles:', e);
            layoutProfiles = [];
        }
    }

    function _renderLayoutSelector() {
        const sel = document.getElementById('layoutProfileSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">Default (current)</option>' +
            layoutProfiles.map(l =>
                `<option value="${l.id}" ${l.is_active == 1 ? 'selected' : ''}>${escapeHtml(l.name)}${l.is_active == 1 ? ' ✓' : ''}</option>`
            ).join('') +
            '<option value="__new__" style="color:#a78bfa;">➕ New Empty Layout…</option>';
    }

    async function onLayoutProfileChange(val) {
        if (val === '__new__') {
            _renderLayoutSelector(); // reset selector back to previous state
            showNewEmptyLayoutModal();
            return;
        }
        if (!val) {
            // Revert to default (deactivate all layouts)
            await apiCall('set_active_shelf_layout', { layout_id: null });
            showToast('Switched to default layout', 'success');
        } else {
            const layoutId = parseInt(val);
            if (!confirm('Apply this layout? Your current shelf arrangement will be replaced by this profile.')) {
                _renderLayoutSelector(); // re-render to restore previous selection
                return;
            }
            try {
                await apiCall('apply_shelf_layout', { layout_id: layoutId });
                await apiCall('set_active_shelf_layout', { layout_id: layoutId });
                showToast('Layout applied!', 'success');
            } catch (e) {
                showToast('Failed to apply layout: ' + e.message, 'error');
                _renderLayoutSelector();
                return;
            }
        }
        // Refresh shelf view cache + sections after any layout change (v2.8.24 fix)
        await refreshAllShelfViews();
    }

    function showNewEmptyLayoutModal() {
        const modal = document.getElementById('newEmptyLayoutModal');
        if (!modal) return;
        const nameEl = document.getElementById('newEmptyLayoutName');
        if (nameEl) nameEl.value = '';
        const activeEl = document.getElementById('newEmptyLayoutSetActive');
        if (activeEl) activeEl.checked = false;
        modal.style.display = 'flex';
        if (nameEl) setTimeout(() => nameEl.focus(), 50);
    }

    function closeNewEmptyLayoutModal() {
        const modal = document.getElementById('newEmptyLayoutModal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmNewEmptyLayout() {
        const name = document.getElementById('newEmptyLayoutName')?.value?.trim();
        if (!name) { showToast('Please enter a layout name', 'error'); return; }
        const setActive = document.getElementById('newEmptyLayoutSetActive')?.checked || false;
        try {
            const res = await apiCall('create_empty_layout', { name, set_active: setActive });
            closeNewEmptyLayoutModal();
            if (setActive) {
                // Apply the empty layout to clear shelf_assignments so shelf view
                // reflects the empty state. Without this, ghost movies from the
                // previously-applied layout would remain visible (v2.8.24 fix).
                await apiCall('apply_shelf_layout', { layout_id: res.layout_id });
            }
            await refreshAllShelfViews();
            showToast(`Layout "${res.name}" created!`, 'success');
        } catch (e) {
            showToast('Failed to create layout: ' + e.message, 'error');
        }
    }

    function showManageLayoutsModal() {
        const modal = document.getElementById('manageLayoutsModal');
        if (modal) modal.style.display = 'flex';
        _renderManageLayoutsList();
    }

    function closeManageLayoutsModal() {
        const modal = document.getElementById('manageLayoutsModal');
        if (modal) modal.style.display = 'none';
    }

    function _renderManageLayoutsList() {
        const container = document.getElementById('layoutProfilesList');
        if (!container) return;
        if (!layoutProfiles.length) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5);">No saved layouts yet. Save your current arrangement to get started.</p>';
            return;
        }
        container.innerHTML = layoutProfiles.map(l => `
            <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.06); border-radius:8px; padding:0.75rem 1rem; ${l.is_active == 1 ? 'border:1px solid #667eea;' : ''}">
                <span style="flex:1; font-weight:${l.is_active == 1 ? '600' : '400'};">
                    ${l.is_active == 1 ? '✓ ' : ''}${escapeHtml(l.name)}
                    <span style="color:rgba(255,255,255,0.4); font-size:0.8rem; margin-left:0.5rem;">${l.entry_count || 0} items</span>
                </span>
                <button class="btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="App.applyLayoutProfile(${l.id})" title="Apply this layout">Apply</button>
                <button class="btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="App.renameLayoutProfile(${l.id}, '${escapeHtml(l.name).replace(/'/g, "\\'")}')" title="Rename">✏️</button>
                <button class="btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="App.duplicateLayoutProfile(${l.id})" title="Duplicate">⧉</button>
                <button class="btn-ghost" style="padding:0.25rem 0.5rem; font-size:0.8rem; color:#ef4444;" onclick="App.deleteLayoutProfile(${l.id})" title="Delete">🗑️</button>
            </div>
        `).join('');
    }

    async function promptSaveCurrentLayout() {
        const name = prompt('Name for this layout:', 'My Layout ' + new Date().toLocaleDateString());
        if (!name) return;
        try {
            const res = await apiCall('create_shelf_layout', { name });
            await apiCall('save_current_to_layout', { layout_id: res.layout_id });
            showToast('Layout "' + name + '" saved!', 'success');
            await loadLayoutProfiles();
            _renderManageLayoutsList();
        } catch (e) {
            showToast('Failed to save layout: ' + e.message, 'error');
        }
    }

    async function applyLayoutProfile(layoutId) {
        if (!confirm('Apply this layout? Your current shelf arrangement will be replaced.')) return;
        try {
            await apiCall('apply_shelf_layout', { layout_id: layoutId });
            await apiCall('set_active_shelf_layout', { layout_id: layoutId });
            showToast('Layout applied!', 'success');
            await refreshAllShelfViews();   // refreshes shelf view cache + sections (v2.8.24)
            closeManageLayoutsModal();
        } catch (e) {
            showToast('Failed to apply layout: ' + e.message, 'error');
        }
    }

    async function deleteLayoutProfile(layoutId) {
        if (!confirm('Delete this layout profile? This cannot be undone.')) return;
        try {
            await apiCall('delete_shelf_layout', { layout_id: layoutId });
            showToast('Layout deleted', 'success');
            // Invalidate cache and clear stale sections from shelf view (v2.8.24)
            await refreshAllShelfViews();
            _renderManageLayoutsList();
        } catch (e) {
            showToast('Failed to delete layout: ' + e.message, 'error');
        }
    }

    async function renameLayoutProfile(layoutId, currentName) {
        const newName = prompt('New name:', currentName);
        if (!newName || newName === currentName) return;
        try {
            await apiCall('rename_shelf_layout', { layout_id: layoutId, name: newName });
            showToast('Layout renamed', 'success');
            await loadLayoutProfiles();
            _renderManageLayoutsList();
        } catch (e) {
            showToast('Failed to rename: ' + e.message, 'error');
        }
    }

    async function duplicateLayoutProfile(layoutId) {
        const name = prompt('Name for the duplicate:', '');
        if (name === null) return; // cancelled
        try {
            await apiCall('duplicate_shelf_layout', { layout_id: layoutId, name });
            showToast('Layout duplicated', 'success');
            await loadLayoutProfiles();
            _renderManageLayoutsList();
        } catch (e) {
            showToast('Failed to duplicate: ' + e.message, 'error');
        }
    }

    // ========================================
    // RECIPE LAYOUT WIZARD (v6.1.0)
    // ========================================

    function showAIWizardModal() {
        const modal = document.getElementById('aiWizardModal');
        if (!modal) return;
        modal.style.display = 'flex';
        // Populate target shelves selector
        const sel = document.getElementById('wizardTargetShelves');
        if (sel && shelves) {
            sel.innerHTML = shelves.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        }
        // Start with one blank section if none exist
        if (_wizardSections.length === 0) wizardAddSection();
        // Non-blocking metadata coverage check
        _checkWizardMetadataStatus();
        _renderWizardSections();
        _aiWizardShowStep(1);
    }

    function closeAIWizardModal() {
        const modal = document.getElementById('aiWizardModal');
        if (modal) modal.style.display = 'none';
    }

    function _aiWizardShowStep(step) {
        document.getElementById('aiWizardStep1').style.display = step === 1 ? 'block' : 'none';
        document.getElementById('aiWizardStep2').style.display = step === 2 ? 'block' : 'none';
        document.getElementById('aiWizardLoading').style.display = step === 'loading' ? 'block' : 'none';
    }

    // ------ chip rendering helpers ------

    function _renderChips(sec) {
        if (!sec.values.length) {
            return '<span style="color:rgba(255,255,255,0.35); font-size:0.78rem; font-style:italic; padding:0.2rem 0;">blank = match all</span>';
        }
        return sec.values.map(v => {
            const safe = escapeHtml(v);
            const escapedJs = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `<span style="display:inline-flex;align-items:center;gap:0.25rem;background:rgba(167,139,250,0.2);border:1px solid rgba(167,139,250,0.5);border-radius:12px;padding:0.15rem 0.45rem;font-size:0.8rem;">
                ${safe}
                <button onmousedown="event.preventDefault();App.wizardRemoveChip('${sec.id}','${escapedJs}')"
                    style="background:none;border:none;color:rgba(255,140,140,0.9);cursor:pointer;padding:0;line-height:1;font-size:0.9rem;">×</button>
            </span>`;
        }).join('');
    }

    function _renderWizardSections() {
        const list = document.getElementById('wizardSectionList');
        if (!list) return;
        if (_wizardSections.length === 0) {
            list.innerHTML = '<p style="color:rgba(255,255,255,0.4); font-size:0.85rem; text-align:center; padding:0.75rem 0;">No sections yet — add one or pick a preset.</p>';
            return;
        }
        // Render each section row. Values use chip+typeahead instead of plain text.
        // Chips are updated in-place by wizardAddChip/wizardRemoveChip without re-rendering
        // the whole list (preserves focus on the typeahead input).
        list.innerHTML = _wizardSections.map((sec, idx) => `
            <div class="wizard-section-row" data-sid="${sec.id}"
                style="background:rgba(255,255,255,0.07); border-radius:8px; padding:0.65rem 0.75rem; display:flex; gap:0.5rem; align-items:flex-start; flex-wrap:wrap;">
                <span style="color:rgba(255,255,255,0.4); font-size:0.8rem; min-width:1.2rem; padding-top:0.35rem;">${idx + 1}.</span>
                <div style="display:flex; flex-direction:column; gap:0.4rem; flex:1; min-width:280px;">
                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                        <select data-sid="${sec.id}" data-field="type"
                            style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:0.3rem 0.4rem; font-size:0.85rem;"
                            onchange="App._wizardSectionChange(this)">
                            <option value="genre"${sec.type==='genre'?' selected':''}>Genre</option>
                            <option value="director"${sec.type==='director'?' selected':''}>Director</option>
                            <option value="studio"${sec.type==='studio'?' selected':''}>Studio</option>
                            <option value="certification"${sec.type==='certification'?' selected':''}>Rating (cert.)</option>
                            <option value="user_tag"${sec.type==='user_tag'?' selected':''}>User Tag</option>
                        </select>
                        <select data-sid="${sec.id}" data-field="sort"
                            style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:0.3rem 0.4rem; font-size:0.85rem;"
                            onchange="App._wizardSectionChange(this)">
                            <option value="title"${sec.sort==='title'?' selected':''}>A-Z</option>
                            <option value="year"${sec.sort==='year'?' selected':''}>Year</option>
                            <option value="rating"${sec.sort==='rating'?' selected':''}>Rating ↓</option>
                        </select>
                        <select data-sid="${sec.id}" data-field="direction"
                            style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:0.3rem 0.4rem; font-size:0.85rem;"
                            onchange="App._wizardSectionChange(this)">
                            <option value="top"${sec.direction==='top'?' selected':''}>Top shelves</option>
                            <option value="bottom"${sec.direction==='bottom'?' selected':''}>Bottom shelves</option>
                        </select>
                    </div>
                    <!-- chip display -->
                    <div id="wz-chips-${sec.id}" style="display:flex; flex-wrap:wrap; gap:0.3rem; align-items:center; min-height:1.6rem;">
                        ${_renderChips(sec)}
                    </div>
                    <!-- typeahead input + pick button -->
                    <div style="display:flex; gap:0.4rem; align-items:center;">
                        <input type="text" id="wz-input-${sec.id}" list="wz-list-${sec.id}"
                            placeholder="Type to search, Enter to add (blank = match all)…"
                            style="flex:1; background:rgba(255,255,255,0.08); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:0.3rem 0.5rem; font-size:0.82rem;"
                            oninput="App._wizardTypeaheadSearch('${sec.id}','${sec.type}',this)"
                            onchange="App.wizardAddChip('${sec.id}',this)"
                            onkeydown="if(event.key==='Enter'){event.preventDefault();App.wizardAddChip('${sec.id}',this);}">
                        <datalist id="wz-list-${sec.id}"></datalist>
                        <button onclick="App.openCloudPicker('${sec.id}','${sec.type}')"
                            style="background:rgba(167,139,250,0.2); border:1px solid rgba(167,139,250,0.5); color:#c4b5fd; border-radius:4px; padding:0.3rem 0.6rem; font-size:0.8rem; cursor:pointer; white-space:nowrap;">Pick…</button>
                    </div>
                </div>
                <button onclick="App.wizardRemoveSection('${sec.id}')" title="Remove section"
                    style="background:transparent; border:none; color:rgba(255,100,100,0.8); font-size:1.1rem; cursor:pointer; padding:0.2rem 0.4rem; line-height:1; align-self:flex-start; margin-top:0.2rem;">&#10005;</button>
            </div>
        `).join('');
    }

    // ------ typeahead helpers ------

    function _wizardTypeaheadSearch(sid, type, inputEl) {
        clearTimeout(_typeaheadTimer);
        _typeaheadTimer = setTimeout(async () => {
            const q = (inputEl.value || '').trim();
            // Map 'certification' → 'cert' for API
            const apiType = type === 'certification' ? 'cert' : type === 'user_tag' ? 'tag' : type;
            try {
                const res = await apiCall('search_metadata_values', { type: apiType, q });
                const listEl = document.getElementById('wz-list-' + sid);
                if (!listEl) return;
                listEl.innerHTML = (res.results || []).map(r => `<option value="${escapeHtml(r.name)}">`).join('');
                if (res.empty_hint && q === '') {
                    // Show hint in the input placeholder
                    const inputEl2 = document.getElementById('wz-input-' + sid);
                    if (inputEl2) inputEl2.placeholder = res.empty_hint;
                }
            } catch (_) { /* typeahead failures are non-fatal */ }
        }, 250);
    }

    function wizardAddChip(sid, inputEl) {
        const val = (inputEl.value || '').trim();
        if (!val) return;
        const sec = _wizardSections.find(s => s.id === sid);
        if (!sec) return;
        if (!sec.values.includes(val)) {
            sec.values.push(val);
            const chipsEl = document.getElementById('wz-chips-' + sid);
            if (chipsEl) chipsEl.innerHTML = _renderChips(sec);
        }
        inputEl.value = '';
    }

    function wizardRemoveChip(sid, val) {
        const sec = _wizardSections.find(s => s.id === sid);
        if (!sec) return;
        sec.values = sec.values.filter(v => v !== val);
        const chipsEl = document.getElementById('wz-chips-' + sid);
        if (chipsEl) chipsEl.innerHTML = _renderChips(sec);
    }

    // ------ metadata status banner ------

    async function _checkWizardMetadataStatus() {
        const banner = document.getElementById('wizardMetadataBanner');
        if (!banner) return;
        try {
            const status = await apiCall('get_metadata_status');
            const total = status.movies_total || 0;
            const enriched = Math.max(
                status.people_enriched || 0,
                status.genres_enriched || 0,
                status.studios_enriched || 0
            );
            if (total > 0 && enriched < total * 0.5) {
                banner.style.display = 'block';
                banner.textContent = `⚠ Metadata incomplete (${enriched}/${total} movies enriched) — run Backfill in Admin Tools for best typeahead results.`;
            } else {
                banner.style.display = 'none';
            }
        } catch (_) { banner.style.display = 'none'; }
    }

    // ==========================================
    // WORD CLOUD PICKER (v6.2.0)
    // ==========================================

    let _cloudPickerSid   = null;   // section ID awaiting selection
    let _cloudPickerType  = null;   // type string
    let _cloudPickerItems = [];     // [{name, cnt}] full list
    let _cloudPickerSel   = new Set(); // selected names

    async function openCloudPicker(sid, type) {
        _cloudPickerSid  = sid;
        _cloudPickerType = type;
        _cloudPickerSel  = new Set();
        _cloudPickerItems = [];

        const modal = document.getElementById('cloudPickerModal');
        if (!modal) return;

        // Set title
        const typeLabels = { genre:'Genre', director:'Director', studio:'Studio',
            certification:'Rating (cert.)', user_tag:'User Tags' };
        const titleEl = document.getElementById('cloudPickerTitle');
        if (titleEl) titleEl.textContent = 'Pick ' + (typeLabels[type] || type);

        // Reset UI
        const searchEl = document.getElementById('cloudPickerSearch');
        if (searchEl) searchEl.value = '';
        const sortEl = document.getElementById('cloudPickerSortAZ');
        if (sortEl) sortEl.checked = false;
        _updateCloudSelCount();

        modal.style.display = 'flex';
        // Deactivate wizard behind picker (z-index 1000 < picker 1100)
        const wizardModal = document.getElementById('aiWizardModal');
        if (wizardModal) wizardModal.classList.add('modal--inactive');
        document.getElementById('cloudPickerList').innerHTML = '<span style="color:rgba(255,255,255,0.4); font-size:0.85rem;">Loading…</span>';

        // Map type to API type
        const apiType = type === 'certification' ? 'cert' : type === 'user_tag' ? 'tag' : type;
        try {
            const res = await apiCall('list_metadata_cloud', { type: apiType, limit: 200 });
            _cloudPickerItems = res.items || [];
            if (_cloudPickerItems.length === 0 && res.empty_hint) {
                document.getElementById('cloudPickerList').innerHTML =
                    `<p style="color:rgba(251,191,36,0.8); font-size:0.85rem;">${escapeHtml(res.empty_hint)}</p>`;
                return;
            }
            _renderCloudPickerList();
        } catch (e) {
            document.getElementById('cloudPickerList').innerHTML =
                `<p style="color:rgba(255,100,100,0.8); font-size:0.85rem;">Error: ${escapeHtml(e.message)}</p>`;
        }
    }

    function closeCloudPicker() {
        const modal = document.getElementById('cloudPickerModal');
        if (modal) modal.style.display = 'none';
        // Re-activate wizard
        const wizardModal = document.getElementById('aiWizardModal');
        if (wizardModal) wizardModal.classList.remove('modal--inactive');
        _cloudPickerSid = null;
    }

    function _renderCloudPickerList(filterQ, sortAZ) {
        const list = document.getElementById('cloudPickerList');
        if (!list) return;
        let items = _cloudPickerItems.slice();
        if (filterQ) {
            const lc = filterQ.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(lc));
        }
        if (sortAZ) items.sort((a, b) => a.name.localeCompare(b.name));

        if (items.length === 0) {
            list.innerHTML = '<span style="color:rgba(255,255,255,0.4); font-size:0.85rem;">No results.</span>';
            return;
        }

        const maxCnt = Math.max(1, ...items.map(i => i.cnt || 0));
        list.innerHTML = items.map(i => {
            const selected = _cloudPickerSel.has(i.name);
            const fontSize = 0.75 + ((i.cnt || 0) / maxCnt) * 0.55; // 0.75–1.3rem
            const safe = escapeHtml(i.name);
            const esc  = i.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `<button onclick="App._cloudPickerToggle('${esc}')"
                style="background:${selected ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.07)'};
                       border:1px solid ${selected ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.18)'};
                       color:${selected ? '#e9d5ff' : 'rgba(255,255,255,0.8)'};
                       border-radius:20px; padding:0.25rem 0.65rem;
                       font-size:${fontSize.toFixed(2)}rem; cursor:pointer; transition:all 0.15s;">
                ${safe} <span style="opacity:0.5; font-size:0.75em;">${i.cnt || 0}</span>
            </button>`;
        }).join('');
    }

    function _cloudPickerToggle(name) {
        if (_cloudPickerSel.has(name)) _cloudPickerSel.delete(name);
        else _cloudPickerSel.add(name);
        _updateCloudSelCount();
        // Re-render to update button styles (filter/sort state preserved)
        const searchEl = document.getElementById('cloudPickerSearch');
        const sortEl   = document.getElementById('cloudPickerSortAZ');
        _renderCloudPickerList(searchEl?.value || '', sortEl?.checked || false);
    }

    function _updateCloudSelCount() {
        const el = document.getElementById('cloudPickerSelCount');
        if (el) el.textContent = _cloudPickerSel.size > 0 ? `${_cloudPickerSel.size} selected` : '';
    }

    function _cloudPickerSearch(q) {
        const sortEl = document.getElementById('cloudPickerSortAZ');
        _renderCloudPickerList(q, sortEl?.checked || false);
    }

    function _cloudPickerSort(az) {
        const searchEl = document.getElementById('cloudPickerSearch');
        _renderCloudPickerList(searchEl?.value || '', az);
    }

    function _cloudPickerConfirm() {
        if (!_cloudPickerSid) { closeCloudPicker(); return; }
        const sec = _wizardSections.find(s => s.id === _cloudPickerSid);
        if (sec) {
            _cloudPickerSel.forEach(v => { if (!sec.values.includes(v)) sec.values.push(v); });
            const chipsEl = document.getElementById('wz-chips-' + _cloudPickerSid);
            if (chipsEl) chipsEl.innerHTML = _renderChips(sec);
        }
        closeCloudPicker();
    }

    function _wizardSectionChange(el) {
        const sid = el.dataset.sid;
        const field = el.dataset.field;
        const sec = _wizardSections.find(s => s.id === sid);
        if (!sec) return;
        if (field === 'type') {
            // Clear chips when switching type — values are type-specific
            sec.type = el.value;
            sec.values = [];
            const chipsEl = document.getElementById('wz-chips-' + sid);
            if (chipsEl) chipsEl.innerHTML = _renderChips(sec);
            // Reset datalist and placeholder
            const listEl = document.getElementById('wz-list-' + sid);
            if (listEl) listEl.innerHTML = '';
            const inputEl = document.getElementById('wz-input-' + sid);
            if (inputEl) {
                inputEl.value = '';
                inputEl.placeholder = 'Type to search, Enter to add (blank = match all)…';
                inputEl.setAttribute('oninput', `App._wizardTypeaheadSearch('${sid}','${el.value}',this)`);
            }
        } else {
            sec[field] = el.value;
        }
    }

    function wizardAddSection() {
        _sectionIdCounter++;
        _wizardSections.push({ id: 's' + _sectionIdCounter, type: 'genre', values: [], sort: 'title', direction: 'top' });
        _renderWizardSections();
    }

    function wizardRemoveSection(id) {
        _wizardSections = _wizardSections.filter(s => s.id !== id);
        _renderWizardSections();
    }

    function wizardApplyPreset(name) {
        _wizardSections = [];
        _sectionIdCounter = 0;
        if (name === 'r-kids-rest') {
            _wizardSections = [
                { id: 's1', type: 'certification', values: ['R'], sort: 'title', direction: 'top' },
                { id: 's2', type: 'certification', values: ['G', 'PG', 'PG-13'], sort: 'title', direction: 'bottom' },
            ];
            _sectionIdCounter = 2;
        } else if (name === 'directors-studios-rest') {
            _wizardSections = [
                { id: 's1', type: 'director', values: [], sort: 'rating', direction: 'top' },
                { id: 's2', type: 'studio', values: [], sort: 'title', direction: 'top' },
            ];
            _sectionIdCounter = 2;
        } else if (name === 'genre-az') {
            _wizardSections = [
                { id: 's1', type: 'genre', values: [], sort: 'title', direction: 'top' },
            ];
            _sectionIdCounter = 1;
        }
        const remSort = document.getElementById('wizardRemainderSort');
        if (remSort) remSort.value = 'title';
        _renderWizardSections();
    }

    async function generateWizardPlan() {
        const sections = _wizardSections.map(s => ({ ...s }));
        const remainderSort = document.getElementById('wizardRemainderSort')?.value || 'title';
        const includeWishlist = document.getElementById('wizardIncludeWishlist')?.checked || false;
        const includeBoxsets = document.getElementById('wizardIncludeBoxsets')?.checked || false;
        const targetSel = document.getElementById('wizardTargetShelves');
        let targetShelves = targetSel ? Array.from(targetSel.selectedOptions).map(o => parseInt(o.value)) : [];

        const sc  = parseInt(document.getElementById('wizardShelfCount')?.value)    || 5;
        const ips = parseInt(document.getElementById('wizardItemsPerShelf')?.value) || 25;

        // if no target shelf selected → always create a fresh master shelf with the specified config
        _wizardMasterShelfId = targetShelves.length === 1 ? targetShelves[0] : null;
        if (targetShelves.length === 0) {
            const masterName = document.getElementById('wizardMasterShelfName')?.value?.trim()
                               || 'Shelf Collection';
            _aiWizardShowStep('loading');
            try {
                const created = await apiCall('create_shelf', {
                    name:            masterName,
                    shelf_count:     sc,
                    items_per_shelf: ips,
                    capacity:        sc * ips,
                });
                _wizardMasterShelfId = created.shelf_id;
                targetShelves = [created.shelf_id];
                await loadShelves(); // refresh shelf list
            } catch (e) {
                _aiWizardShowStep(1);
                showToast('Could not auto-create master shelf: ' + e.message, 'error');
                return;
            }
        }

        const recipe = {
            sections,
            remainder: { sort: remainderSort, include_wishlist: includeWishlist, include_boxsets: includeBoxsets },
        };

        _aiWizardShowStep('loading');
        try {
            const plan = await apiCall('generate_recipe_plan', {
                recipe,
                target_shelves: targetShelves,
            });
            _wizardPlan = plan;
            _renderWizardPreview(plan);
            _aiWizardShowStep(2);
        } catch (e) {
            _aiWizardShowStep(1);
            showToast('Failed to generate plan: ' + e.message, 'error');
        }
    }

    function _wizardPresetLabel() {
        // Derive a human-readable label from current sections for the default layout name
        if (_wizardSections.length === 0) return 'Custom';
        const types = [...new Set(_wizardSections.map(s => {
            if (s.type === 'certification') return 'Rating';
            if (s.type === 'user_tag')      return 'Tags';
            return s.type.charAt(0).toUpperCase() + s.type.slice(1);
        }))];
        return types.join('+');
    }

    function _renderWizardPreview(plan) {
        const summary = document.getElementById('aiWizardPlanSummary');
        const preview = document.getElementById('aiWizardPlanPreview');
        const badge = document.getElementById('aiWizardAIBadge');
        if (badge) badge.style.display = 'none';

        const unplaced = plan.unplaced_estimate || 0;
        if (summary) {
            let txt = `${plan.total_items} items across ${plan.shelves_used} shelf${plan.shelves_used !== 1 ? 'ves' : ''}`;
            if (unplaced > 0) txt += ` · ⚠ ${unplaced} item${unplaced !== 1 ? 's' : ''} overflow (shelf capacity exceeded)`;
            summary.textContent = txt;
            summary.style.color = unplaced > 0 ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.7)';
        }

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const nameInput = document.getElementById('aiWizardLayoutName');
        if (nameInput && !nameInput.value) {
            nameInput.value = `Living Room Movie Shelf – ${_wizardPresetLabel()} – ${dateStr}`;
        }

        if (!preview) return;

        if (plan.blocks && plan.blocks.length > 0) {
            // --- Blocks-based rendering (v2.8.12+) ---
            // Group blocks by shelf_id for indexed lookup
            const blocksByShelf = {};
            plan.blocks.forEach(b => {
                if (!blocksByShelf[b.shelf_id]) blocksByShelf[b.shelf_id] = [];
                blocksByShelf[b.shelf_id].push(b);
            });

            preview.innerHTML = plan.placement.map(p => {
                const shBlocks = blocksByShelf[p.shelf_id] || [];
                const blocksHtml = shBlocks.map(b => {
                    const typeLabel = b.group_type && b.group_value
                        ? (b.group_type.charAt(0).toUpperCase() + b.group_type.slice(1) + ': ' + b.group_value)
                        : (b.group_value || 'Other');
                    const titlesHtml = b.items.map(i => escapeHtml(i.title)).join(' · ');
                    return `<div style="margin-bottom:0.45rem;">
                        <div style="margin-bottom:0.2rem;">
                            <span style="background:rgba(167,139,250,0.18);border:1px solid rgba(167,139,250,0.35);border-radius:3px;padding:1px 7px;font-size:0.75rem;color:#c4b5fd;font-weight:500;">${escapeHtml(typeLabel)}</span>
                            <span style="color:rgba(255,255,255,0.3);font-size:0.72rem;margin-left:5px;">${b.count} item${b.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div style="color:rgba(255,255,255,0.65);font-size:0.82rem;line-height:1.5;padding-left:0.6rem;">${titlesHtml}</div>
                    </div>`;
                }).join('');
                return `
                <div style="margin-bottom:0.75rem;background:rgba(255,255,255,0.06);border-radius:8px;padding:0.75rem;">
                    <div style="font-weight:600;margin-bottom:0.5rem;color:#a78bfa;display:flex;justify-content:space-between;">
                        <span>📚 ${escapeHtml(p.shelf_name)}</span>
                        <span style="font-weight:400;font-size:0.8rem;color:rgba(255,255,255,0.45);">${p.ordered_items.length} item${p.ordered_items.length !== 1 ? 's' : ''}</span>
                    </div>
                    ${blocksHtml}
                </div>`;
            }).join('') || '<p style="color:rgba(255,255,255,0.5);">No items could be placed (no shelves or empty collection).</p>';
        } else {
            // --- Fallback: bucket-chip inline rendering (older API) ---
            preview.innerHTML = plan.placement.map(p => {
                let lastBucket = null;
                const bits = [];
                p.ordered_items.forEach(i => {
                    if (i.bucket_label && i.bucket_label !== lastBucket) {
                        lastBucket = i.bucket_label;
                        if (bits.length > 0) bits.push('<span style="color:rgba(255,255,255,0.25)"> &#x2502; </span>');
                        bits.push(`<span style="background:rgba(167,139,250,0.18);border:1px solid rgba(167,139,250,0.35);border-radius:3px;padding:1px 6px;font-size:0.72rem;color:#c4b5fd;margin-right:3px;">${escapeHtml(i.bucket_label)}</span>`);
                    } else if (bits.length > 0) {
                        bits.push(' · ');
                    }
                    bits.push(escapeHtml(i.title));
                });
                return `
                <div style="margin-bottom:0.75rem;background:rgba(255,255,255,0.06);border-radius:8px;padding:0.75rem;">
                    <div style="font-weight:600;margin-bottom:0.4rem;color:#a78bfa;display:flex;justify-content:space-between;">
                        <span>📚 ${escapeHtml(p.shelf_name)}</span>
                        <span style="font-weight:400;font-size:0.8rem;color:rgba(255,255,255,0.45);">${p.ordered_items.length} item${p.ordered_items.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="color:rgba(255,255,255,0.7);font-size:0.85rem;line-height:1.6;">${bits.join('')}</div>
                </div>`;
            }).join('') || '<p style="color:rgba(255,255,255,0.5);">No items could be placed (no shelves or empty collection).</p>';
        }
    }

    function aiWizardBackToStep1() {
        _wizardPlan = null;
        const nameInput = document.getElementById('aiWizardLayoutName');
        if (nameInput) nameInput.value = '';
        _aiWizardShowStep(1);
    }

    // ---- Shelf Unit Config (v6.2.0) ----

    function updateWizardCapacity() {
        const sc  = parseInt(document.getElementById('wizardShelfCount')?.value)    || 5;
        const ips = parseInt(document.getElementById('wizardItemsPerShelf')?.value) || 25;
        const total = document.getElementById('wizardCapacityTotal');
        if (total) total.textContent = (sc * ips).toLocaleString();
    }

    async function loadWizardShelfUnitConfig() {
        const targetSel = document.getElementById('wizardTargetShelves');
        const selected  = targetSel ? Array.from(targetSel.selectedOptions) : [];
        if (selected.length !== 1) {
            showToast('Select exactly one shelf to load its config', 'info');
            return;
        }
        const shelfId = parseInt(selected[0].value);
        try {
            const cfg = await apiCall('get_shelf_unit_config', { shelf_id: shelfId });
            const scEl  = document.getElementById('wizardShelfCount');
            const ipsEl = document.getElementById('wizardItemsPerShelf');
            if (scEl  && cfg.shelf_count)      scEl.value  = cfg.shelf_count;
            if (ipsEl && cfg.items_per_shelf)  ipsEl.value = cfg.items_per_shelf;
            updateWizardCapacity();
            showToast(`Loaded: ${cfg.shelf_count}×${cfg.items_per_shelf} from "${cfg.name}"`, 'success');
        } catch (e) {
            showToast('Failed to load shelf config: ' + e.message, 'error');
        }
    }

    async function saveWizardShelfUnitConfig() {
        const targetSel = document.getElementById('wizardTargetShelves');
        const selected  = targetSel ? Array.from(targetSel.selectedOptions) : [];
        if (selected.length !== 1) {
            showToast('Select exactly one shelf to save its config', 'info');
            return;
        }
        const shelfId = parseInt(selected[0].value);
        const sc  = parseInt(document.getElementById('wizardShelfCount')?.value)    || 5;
        const ips = parseInt(document.getElementById('wizardItemsPerShelf')?.value) || 25;
        try {
            await apiCall('save_shelf_unit_config', { shelf_id: shelfId, shelf_count: sc, items_per_shelf: ips });
            showToast(`Saved: ${sc} shelves × ${ips} items/shelf`, 'success');
        } catch (e) {
            showToast('Failed to save shelf config: ' + e.message, 'error');
        }
    }

    async function applyWizardPlan() {
        if (!_wizardPlan) return;
        const name = document.getElementById('aiWizardLayoutName')?.value?.trim();
        if (!name) { showToast('Layout name required', 'error'); return; }
        const setActive = document.getElementById('aiWizardSetActive')?.checked ?? true;

        const sc  = parseInt(document.getElementById('wizardShelfCount')?.value)    || 5;
        const ips = parseInt(document.getElementById('wizardItemsPerShelf')?.value) || 25;

        try {
            const res = await apiCall('apply_recipe_as_new_layout', {
                layout_name: name,
                plan: { placement: _wizardPlan.placement },
                blocks: _wizardPlan.blocks || [],
                set_active: setActive,
            });
            const secMsg = (res.sections_created > 0) ? ` (${res.sections_created} sections)` : '';
            showToast(`Layout "${res.name || name}" saved with ${res.entries} entries${secMsg}!`, 'success');
            // Always apply the new layout so shelf view reflects the plan
            await apiCall('apply_shelf_layout', { layout_id: res.layout_id });
            await apiCall('set_active_shelf_layout', { layout_id: res.layout_id });

            // v2.8.27: Materialize real section shelves + assign items
            // This runs after apply_shelf_layout so section shelf assignments correctly overwrite
            // the row-shelf assignments written by apply_shelf_layout.
            if (_wizardPlan.blocks && _wizardPlan.blocks.length > 0) {
                try {
                    const matRes = await apiCall('materialize_wizard_shelves', {
                        master_shelf_id:   _wizardMasterShelfId,
                        master_shelf_name: name,
                        shelf_count:       sc,
                        items_per_shelf:   ips,
                        blocks:            _wizardPlan.blocks,
                    });
                    const matMsg = `Wizard applied: master=${matRes.master_shelf_id}, rows=${matRes.rows_total}, ` +
                        `sections created=${matRes.sections_created} reused=${matRes.sections_reused}, ` +
                        `items assigned=${matRes.assigned_count}, unassigned=${matRes.unassigned_count}`;
                    console.log('[wizard]', matMsg);
                    showToast(
                        `Shelves materialized: ${matRes.sections_created + matRes.sections_reused} sections, ` +
                        `${matRes.assigned_count} items assigned` +
                        (matRes.unassigned_count > 0 ? `, ${matRes.unassigned_count} skipped` : '') + '.',
                        'success'
                    );
                } catch (matErr) {
                    console.error('[wizard] materialize_wizard_shelves failed:', matErr);
                    showToast('Layout saved but section materialization failed: ' + matErr.message, 'error');
                }
            }

            _wizardPlan = null;
            _wizardSections = [];
            _wizardMasterShelfId = null;
            closeAIWizardModal();
            await loadLayoutProfiles();        // must come before refreshAllShelfViews so sections fetch uses updated active layout
            await refreshAllShelfViews();      // reloads shelves + shelf-view browser (including section chips) if on that tab
        } catch (e) {
            showToast('Failed to save layout: ' + e.message, 'error');
        }
    }

    // ========================================================
    // VIEWING CALENDAR (v7.0.0)
    // ========================================================

    let calendarYear  = new Date().getFullYear();
    let calendarMonth = new Date().getMonth() + 1; // 1-based
    let calendarGroupId = null;
    let calendarEvents  = [];

    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    async function calendarInit() {
        // Populate group selects
        await calendarPopulateGroups();
        await calendarLoad();
        await calendarLoadUpcoming();
    }

    async function calendarPopulateGroups() {
        const sel = document.getElementById('calendarGroupSelect');
        const evtSel = document.getElementById('calEventGroup');
        if (!sel) return;
        try {
            const data = await apiCall('list_groups');
            const opts = (data || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
            if (opts) {
                sel.innerHTML = '<option value="">Personal</option>' + opts;
                if (evtSel) evtSel.innerHTML = '<option value="">Personal only</option>' + opts;
            }
        } catch (_) {}
    }

    async function calendarLoad() {
        document.getElementById('calendarMonthLabel').textContent = `${MONTH_NAMES[calendarMonth - 1]} ${calendarYear}`;
        try {
            const params = { year: calendarYear, month: calendarMonth };
            if (calendarGroupId) params.group_id = calendarGroupId;
            calendarEvents = await apiCall('calendar_list', params);
            calendarRender();
        } catch (e) {
            console.error('Calendar load error:', e);
        }
    }

    async function calendarLoadUpcoming() {
        const container = document.getElementById('calendarUpcoming');
        if (!container) return;
        try {
            const params = { limit: 8 };
            if (calendarGroupId) params.group_id = calendarGroupId;
            const events = await apiCall('calendar_upcoming', params);
            if (!events || events.length === 0) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">No upcoming screenings planned.</p>';
                return;
            }
            container.innerHTML = events.map(ev => {
                const d = new Date(ev.planned_date + 'T00:00:00');
                const dateStr = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
                const poster = ev.poster_url || '';
                return `<div class="cal-upcoming-item">
                    ${poster ? `<img src="${poster}" alt="" style="width:40px;height:60px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : '<div style="width:40px;height:60px;background:rgba(255,255,255,0.05);border-radius:4px;flex-shrink:0;"></div>'}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ev.title)}</div>
                        <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">📅 ${dateStr}${ev.notes ? ' · ' + escapeHtml(ev.notes) : ''}</div>
                    </div>
                    <div style="display:flex;gap:0.35rem;flex-shrink:0;">
                        <button class="btn-icon" title="Mark watched" onclick="App.markCalendarComplete(${ev.id})">✅</button>
                        <button class="btn-icon" title="Remove" onclick="App.deleteCalendarEvent(${ev.id})">🗑️</button>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { console.error('Upcoming load error:', e); }
    }

    function calendarRender() {
        const grid = document.getElementById('calendarGrid');
        if (!grid) return;

        // First day of month (0=Sun…6=Sat)
        const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
        const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

        // Map events by day number
        const byDay = {};
        (calendarEvents || []).forEach(ev => {
            const day = parseInt(ev.planned_date.substring(8, 10));
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(ev);
        });

        let html = '';
        // Leading empty cells
        for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell cal-cell-empty"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = dateStr === todayStr;
            const events = byDay[d] || [];
            const isPast = dateStr < todayStr;
            html += `<div class="cal-cell${isToday ? ' cal-today' : ''}${isPast && !isToday ? ' cal-past' : ''}" onclick="App._calDayClick('${dateStr}')">
                <div class="cal-day-num">${d}</div>
                <div class="cal-day-events">
                    ${events.slice(0,3).map(ev => `
                        <div class="cal-event${ev.is_completed ? ' cal-event-done' : ''}" title="${escapeHtml(ev.title)}${ev.notes ? ' – ' + ev.notes : ''}" onclick="event.stopPropagation();">
                            <span>${escapeHtml(ev.title.length > 18 ? ev.title.substring(0,17)+'…' : ev.title)}</span>
                            <button class="cal-event-del" onclick="event.stopPropagation();App.deleteCalendarEvent(${ev.id})" title="Remove">×</button>
                        </div>`).join('')}
                    ${events.length > 3 ? `<div class="cal-event-more">+${events.length - 3} more</div>` : ''}
                </div>
            </div>`;
        }
        grid.innerHTML = html;
    }

    function _calDayClick(dateStr) {
        // Pre-fill date in the add modal and open it
        openAddToCalendarModal(dateStr);
    }

    function calendarPrevMonth() {
        calendarMonth--;
        if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
        calendarLoad();
        calendarLoadUpcoming();
    }

    function calendarNextMonth() {
        calendarMonth++;
        if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
        calendarLoad();
        calendarLoadUpcoming();
    }

    function calendarGroupChanged() {
        const sel = document.getElementById('calendarGroupSelect');
        calendarGroupId = sel ? (sel.value ? parseInt(sel.value) : null) : null;
        calendarLoad();
        calendarLoadUpcoming();
    }

    function openAddToCalendarModal(prefillDate) {
        const modal = document.getElementById('addToCalendarModal');
        if (!modal) return;
        // Reset
        document.getElementById('calSearchInput').value = '';
        document.getElementById('calSearchResults').innerHTML = '';
        document.getElementById('calSelectedMovieId').value = '';
        document.getElementById('calSelectedMovie').style.display = 'none';
        document.getElementById('calEventNotes').value = '';
        // Default date
        const dateEl = document.getElementById('calEventDate');
        if (dateEl) dateEl.value = prefillDate || new Date().toISOString().substring(0, 10);
        modal.classList.add('active');
    }

    function closeAddToCalendarModal() {
        document.getElementById('addToCalendarModal').classList.remove('active');
    }

    function calSearchCollection(query) {
        const q = (query || '').toLowerCase().trim();
        const results = document.getElementById('calSearchResults');
        if (!q) { results.innerHTML = ''; return; }
        const matches = collection.filter(c => (c.movie.title || '').toLowerCase().includes(q) || (c.movie.display_title || '').toLowerCase().includes(q)).slice(0, 8);
        if (!matches.length) { results.innerHTML = '<p style="color:rgba(255,255,255,0.4);padding:0.5rem;font-size:0.85rem;">No results in your collection</p>'; return; }
        results.innerHTML = matches.map(c => {
            const m = c.movie;
            return `<div class="cal-search-result" onclick="App.calSelectMovie(${m.movie_id}, '${escapeHtml((m.display_title || m.title).replace(/'/g, "\\'"))}')">
                ${m.poster_url ? `<img src="${m.poster_url}" style="width:30px;height:45px;object-fit:cover;border-radius:3px;">` : ''}
                <div><div style="font-weight:600;font-size:0.9rem;">${escapeHtml(m.display_title || m.title)}</div><div style="color:rgba(255,255,255,0.4);font-size:0.78rem;">${m.year || ''}</div></div>
            </div>`;
        }).join('');
    }

    function calSelectMovie(movieId, title) {
        document.getElementById('calSelectedMovieId').value = movieId;
        document.getElementById('calSelectedMovieTitle').textContent = title;
        document.getElementById('calSelectedMovie').style.display = 'block';
        document.getElementById('calSearchResults').innerHTML = '';
        document.getElementById('calSearchInput').value = '';
    }

    function calClearMovie() {
        document.getElementById('calSelectedMovieId').value = '';
        document.getElementById('calSelectedMovie').style.display = 'none';
    }

    async function saveCalendarEvent() {
        const movieId = parseInt(document.getElementById('calSelectedMovieId').value);
        const date    = document.getElementById('calEventDate').value;
        const notes   = document.getElementById('calEventNotes').value.trim();
        const groupEl = document.getElementById('calEventGroup');
        const groupId = groupEl && groupEl.value ? parseInt(groupEl.value) : null;

        if (!movieId) { showToast('Please select a movie first', 'error'); return; }
        if (!date)    { showToast('Please pick a date', 'error'); return; }

        try {
            const params = { movie_id: movieId, planned_date: date, notes };
            if (groupId) params.group_id = groupId;
            await apiCall('calendar_add', params);
            showToast('📅 Added to calendar!', 'success');
            closeAddToCalendarModal();
            calendarLoad();
            calendarLoadUpcoming();
        } catch (e) { showToast('Failed to save: ' + e.message, 'error'); }
    }

    async function deleteCalendarEvent(eventId) {
        try {
            await apiCall('calendar_delete', { event_id: eventId });
            showToast('Removed from calendar', 'info');
            calendarLoad();
            calendarLoadUpcoming();
        } catch (e) { showToast('Could not remove event', 'error'); }
    }

    async function markCalendarComplete(eventId) {
        try {
            await apiCall('calendar_complete', { event_id: eventId, completed: 1 });
            showToast('✅ Marked as watched!', 'success');
            calendarLoad();
            calendarLoadUpcoming();
        } catch (e) { showToast('Could not update event', 'error'); }
    }

    function quickAddToCalendar(movieId, title) {
        openAddToCalendarModal();
        calSelectMovie(movieId, title);
    }

    // ========================================================
    // CINESHELF RATING (v7.1.0 — Viewing Party mode)
    // ========================================================

    let _cineRatingMovieId = null;
    let _cineStarValue     = null;   // kept for legacy compat

    // _partyViewers: array of { key, label, memberId|null, selected, rating, comment }
    let _partyViewers = [];

    // Ensure (or get) the user's personal "My Family" group
    async function ensurePersonalGroup() {
        try {
            return await apiCall('ensure_personal_group');
        } catch (_) { return null; }
    }

    // Build viewer chip + rating row HTML for a single viewer entry
    function _buildPartyViewerChip(v) {
        const sel = v.selected ? 'selected' : '';
        return `<div class="party-viewer-chip ${sel}" id="chip_${v.key}" onclick="App._togglePartyViewer('${v.key}')">
            <span class="chip-check">✓</span>
            <span>${v.label}</span>
        </div>`;
    }

    function _buildPartyRatingRow(v) {
        if (!v.selected) return '';
        const stars = [1,2,3,4,5].map(n =>
            `<span class="party-star-btn ${v.rating >= n ? 'active' : ''}"
                   onclick="App._setPartyRating('${v.key}', ${n})">★</span>`
        ).join('');
        return `<div class="party-rating-row" id="ratingrow_${v.key}">
            <div class="party-rating-row-header">
                <span>${v.label}</span>
            </div>
            <div class="party-star-picker">${stars}</div>
            <textarea class="party-comment-input" rows="2"
                placeholder="Comment (optional)"
                oninput="App._setPartyComment('${v.key}', this.value)">${escapeHtml(v.comment || '')}</textarea>
        </div>`;
    }

    function _renderPartyUI() {
        const chipsEl    = document.getElementById('partyViewerChips');
        const ratingsEl  = document.getElementById('partyRatingsSection');
        if (!chipsEl || !ratingsEl) return;

        // Re-render chips (preserve Add button which is in HTML)
        const chips = _partyViewers.map(_buildPartyViewerChip).join('');
        // Insert before the add-member button
        const addBtn = chipsEl.querySelector('.party-add-member-link');
        chipsEl.innerHTML = chips;
        if (addBtn) chipsEl.appendChild(addBtn);

        ratingsEl.innerHTML = _partyViewers.map(_buildPartyRatingRow).join('');
    }

    function _togglePartyViewer(key) {
        const v = _partyViewers.find(x => x.key === key);
        if (!v) return;
        v.selected = !v.selected;
        _renderPartyUI();
    }

    function _setPartyRating(key, val) {
        const v = _partyViewers.find(x => x.key === key);
        if (!v) return;
        v.rating = v.rating === val ? null : val;   // tap same star to clear
        _renderPartyUI();
    }

    function _setPartyComment(key, text) {
        const v = _partyViewers.find(x => x.key === key);
        if (v) v.comment = text;
    }

    async function openCineRatingModal(movieId) {
        _cineRatingMovieId = movieId;
        _cineStarValue = null;

        // Find movie in collection
        const group = collection.find(c => c.movie.movie_id === movieId);
        const movie = group ? group.movie : null;

        if (movie) {
            document.getElementById('cineRatingTitle').textContent = movie.display_title || movie.title;
            document.getElementById('cineRatingYear').textContent  = movie.year || '';
            document.getElementById('cineRatingPoster').src = movie.poster_url || '';
        }
        document.getElementById('cineRatingMovieId').value = movieId;
        document.getElementById('cineWatchedDate').value = new Date().toISOString().substring(0, 10);

        // Build viewer list: "Me" first, then personal family members
        _partyViewers = [{ key: 'me', label: '👤 Me', memberId: null, selected: true, rating: null, comment: '' }];
        try {
            const pg = await ensurePersonalGroup();
            if (pg && pg.id) {
                const members = await apiCall('family_member_list', { group_id: pg.id });
                (members || []).forEach(m => {
                    _partyViewers.push({
                        key: `m_${m.id}`,
                        label: `${m.avatar || '👤'} ${m.name}`,
                        memberId: m.id,
                        selected: false,
                        rating: null,
                        comment: ''
                    });
                });
            }
        } catch (_) {}

        _renderPartyUI();

        // Group selector
        await cineRatingPopulateGroups();

        document.getElementById('cineRatingModal').classList.add('active');
    }

    function closeCineRatingModal() {
        document.getElementById('cineRatingModal').classList.remove('active');
    }

    async function cineRatingPopulateGroups() {
        const sel = document.getElementById('cineRatingGroup');
        if (!sel) return;
        try {
            const groups = (await apiCall('list_groups') || [])
                .filter(g => !g.is_personal);
            sel.innerHTML = '<option value="">Personal only</option>' +
                groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
        } catch (_) {}
    }

    // Kept for legacy callers (movie detail modal star picker if still used)
    function setStarRating(val) {
        _cineStarValue = val;
        document.getElementById('cineRatingValue').value = val;
    }

    async function saveCineRating() {
        const movieId     = parseInt(document.getElementById('cineRatingMovieId').value);
        const watchedDate = document.getElementById('cineWatchedDate').value;
        const groupSel    = document.getElementById('cineRatingGroup');
        const groupId     = groupSel && groupSel.value ? parseInt(groupSel.value) : null;

        if (!movieId) { showToast('No movie selected', 'error'); return; }

        const selected = _partyViewers.filter(v => v.selected);
        if (selected.length === 0) { showToast('Select at least one viewer', 'error'); return; }

        try {
            for (const v of selected) {
                const params = { movie_id: movieId, watched_date: watchedDate };
                if (v.memberId)  params.family_member_id = v.memberId;
                if (groupId)     params.group_id = groupId;
                if (v.rating)    params.rating = v.rating;
                if (v.comment)   params.comment = v.comment.trim();
                await apiCall('log_view', params);
            }
            const names = selected.map(v => v.label).join(', ');
            showToast(`⭐ Logged for ${names}`, 'success');
            closeCineRatingModal();

            // Refresh the rating panel inside the movie detail modal
            if (document.getElementById('movieDetailModal').classList.contains('active')) {
                loadCineRatingsForMovie(movieId);
            }
        } catch (e) { showToast('Failed to save: ' + e.message, 'error'); }
    }

    // Called from the "+ Add family member" button inside the rating modal
    async function openAddMemberFromRating() {
        closeCineRatingModal();
        await openFamilyManager(true); // pass flag to re-open rating modal after
    }

    async function deleteView(viewId, movieId) {
        if (!confirm('Remove this viewing record?')) return;
        try {
            await apiCall('delete_view', { view_id: viewId });
            showToast('Removed', 'info');
            loadCineRatingsForMovie(movieId);
        } catch (e) { showToast('Could not remove', 'error'); }
    }

    async function loadCineRatingsForMovie(movieId) {
        const container = document.getElementById(`cineRatingContent_${movieId}`);
        if (!container) return;
        try {
            const data = await apiCall('get_movie_views', { movie_id: movieId });
            const views = data.views || [];
            const avgRating = data.avg_rating;
            const ratedCount = data.rated_count;

            if (views.length === 0) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">No viewings logged yet. Be the first to rate!</p>';
                return;
            }

            const avgHtml = avgRating
                ? `<div class="cine-avg-rating">
                    <span class="cine-avg-stars">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</span>
                    <span class="cine-avg-score">${avgRating} / 5</span>
                    <span class="cine-avg-count">(${ratedCount} rating${ratedCount !== 1 ? 's' : ''})</span>
                   </div>`
                : '';

            const viewsHtml = views.map(v => {
                const viewer = v.member_name
                    ? `<span class="cine-viewer-badge" style="background:${v.member_color || '#667eea'}">${v.member_avatar || '👤'} ${escapeHtml(v.member_name)}</span>`
                    : `<span class="cine-viewer-badge">${escapeHtml(v.user_display_name || v.user_username || 'Me')}</span>`;
                const stars = v.rating
                    ? `<span class="cine-stars">${'★'.repeat(v.rating)}${'☆'.repeat(5 - v.rating)}</span>`
                    : '<span class="cine-no-rating">No rating</span>';
                const dateStr = v.watched_date
                    ? new Date(v.watched_date + 'T00:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
                    : '';
                return `<div class="cine-view-entry">
                    <div class="cine-view-header">
                        ${viewer}
                        ${stars}
                        ${dateStr ? `<span class="cine-watch-date">${dateStr}</span>` : ''}
                        <button class="cine-view-del" onclick="App.deleteView(${v.id}, ${movieId})" title="Remove">×</button>
                    </div>
                    ${v.comment ? `<div class="cine-view-comment">"${escapeHtml(v.comment)}"</div>` : ''}
                </div>`;
            }).join('');

            container.innerHTML = avgHtml + `<div class="cine-views-list">${viewsHtml}</div>`;
        } catch (e) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Could not load ratings.</p>';
        }
    }

    // ========================================================
    // FAMILY MEMBERS & RATINGS TAB (v7.0.0)
    // ========================================================

    let _currentRatingsGroupId = null;
    let _selectedMemberAvatar  = '👤';
    let _selectedMemberColor   = '#667eea';

    async function ratingsTabInit() {
        // Populate group selector
        const sel = document.getElementById('ratingsGroupSelect');
        if (!sel) return;
        try {
            const groups = await apiCall('list_groups');
            sel.innerHTML = '<option value="">Select a group…</option>' +
                (groups || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
        } catch (_) {}
    }

    async function loadGroupRatings(groupId) {
        _currentRatingsGroupId = groupId ? parseInt(groupId) : null;
        const emptyState = document.getElementById('emptyRatings');
        const membersSection = document.getElementById('familyMembersSection');
        const unseenSection  = document.getElementById('unseenSection');
        const activitySection = document.getElementById('ratingsActivity');

        if (!_currentRatingsGroupId) {
            if (emptyState) emptyState.style.display = '';
            if (membersSection) membersSection.style.display = 'none';
            if (unseenSection)  unseenSection.style.display  = 'none';
            if (activitySection) activitySection.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        // Load family members
        await loadFamilyMembers(_currentRatingsGroupId);
        if (membersSection) membersSection.style.display = '';

        // Load unseen
        await loadUnseenMovies(_currentRatingsGroupId);
        if (unseenSection) unseenSection.style.display = '';

        // Load recent activity
        await loadRatingsActivity(_currentRatingsGroupId);
        if (activitySection) activitySection.style.display = '';
    }

    async function loadFamilyMembers(groupId) {
        const container = document.getElementById('familyMembersList');
        if (!container) return;
        try {
            const members = await apiCall('family_member_list', { group_id: groupId });
            if (!members || members.length === 0) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">No family members yet. Add some!</p>';
                return;
            }
            container.innerHTML = members.map(m => `
                <div class="family-member-card" style="border-color:${m.color || '#667eea'}40;">
                    <div class="family-member-avatar" style="background:${m.color || '#667eea'}30;">${m.avatar || '👤'}</div>
                    <div class="family-member-name">${escapeHtml(m.name)}</div>
                    <button class="cine-view-del" onclick="App.deleteFamilyMember(${m.id})" title="Remove">×</button>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Could not load members.</p>';
        }
    }

    async function loadUnseenMovies(groupId) {
        const container = document.getElementById('unseenContent');
        if (!container) return;
        container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Loading…</p>';
        try {
            const data = await apiCall('family_unseen', { group_id: groupId });
            if (!data || data.length === 0) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;">Everyone has seen everything! 🎉</p>';
                return;
            }
            container.innerHTML = data.slice(0, 20).map(m => {
                const unseenBadges = m.unseen_by.map(u =>
                    `<span class="cine-viewer-badge" style="background:${u.color || '#667eea'}40;">${u.avatar || '👤'} ${escapeHtml(u.name)}</span>`
                ).join('');
                return `<div class="unseen-row">
                    ${m.poster_url ? `<img src="${m.poster_url}" style="width:36px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : ''}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.title)}${m.year ? ` (${m.year})` : ''}</div>
                        <div style="margin-top:0.25rem;display:flex;flex-wrap:wrap;gap:0.3rem;">
                            <span style="color:rgba(255,255,255,0.4);font-size:0.75rem;align-self:center;">Not seen by:</span>
                            ${unseenBadges}
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Could not load data.</p>';
        }
    }

    async function loadRatingsActivity(groupId) {
        const container = document.getElementById('ratingsActivityContent');
        if (!container) return;
        container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Loading…</p>';
        try {
            const data = await apiCall('family_ratings_overview', { group_id: groupId });
            if (!data || data.length === 0) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;">No ratings yet. Open a movie and tap "Log Viewing" to add the first one!</p>';
                return;
            }
            container.innerHTML = data.slice(0, 30).map(v => {
                const viewer = v.member_name
                    ? `<span class="cine-viewer-badge" style="background:${v.member_color || '#667eea'}40;">${v.member_avatar || '👤'} ${escapeHtml(v.member_name)}</span>`
                    : `<span class="cine-viewer-badge">${escapeHtml(v.user_display_name || 'Me')}</span>`;
                const stars = v.rating ? `<span class="cine-stars">${'★'.repeat(v.rating)}${'☆'.repeat(5-v.rating)}</span>` : '';
                const dateStr = v.watched_date ? new Date(v.watched_date + 'T00:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric' }) : '';
                return `<div class="cine-view-entry">
                    <div class="cine-view-header">
                        ${v.poster_url ? `<img src="${v.poster_url}" style="width:28px;height:42px;object-fit:cover;border-radius:3px;flex-shrink:0;">` : ''}
                        <span style="font-weight:600;font-size:0.88rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(v.title)}${v.year ? ` (${v.year})` : ''}</span>
                        ${viewer}
                        ${stars}
                        ${dateStr ? `<span class="cine-watch-date">${dateStr}</span>` : ''}
                    </div>
                    ${v.comment ? `<div class="cine-view-comment">"${escapeHtml(v.comment)}"</div>` : ''}
                </div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Could not load ratings.</p>';
        }
    }

    // ========================================================
    // FAMILY MANAGER MODAL (personal profiles, v7.1.0)
    // ========================================================

    let _familyMgrGroupId        = null;  // personal group id used by the manager
    let _familyMgrReturnToRating = false; // open rating modal after closing manager

    async function openFamilyManager(returnToRating = false) {
        _familyMgrReturnToRating = returnToRating;
        document.getElementById('familyMgrList').innerHTML =
            '<p style="color:rgba(255,255,255,0.35);font-size:0.85rem;">Loading…</p>';
        document.getElementById('familyManagerModal').classList.add('active');

        const pg = await ensurePersonalGroup();
        if (!pg) {
            document.getElementById('familyMgrList').innerHTML =
                '<p style="color:#f5576c;font-size:0.85rem;">Could not load family group.</p>';
            return;
        }
        _familyMgrGroupId = pg.id;
        await _refreshFamilyMgrList();
    }

    function closeFamilyManager() {
        document.getElementById('familyManagerModal').classList.remove('active');
        if (_familyMgrReturnToRating && _cineRatingMovieId) {
            _familyMgrReturnToRating = false;
            openCineRatingModal(_cineRatingMovieId);
        }
    }

    async function _refreshFamilyMgrList() {
        const container = document.getElementById('familyMgrList');
        if (!container || !_familyMgrGroupId) return;
        try {
            const members = await apiCall('family_member_list', { group_id: _familyMgrGroupId });
            if (!members || members.length === 0) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.35);font-size:0.85rem;">No family members yet — add one below.</p>';
                return;
            }
            container.innerHTML = members.map(m => `
                <div class="family-mgr-row" style="border-color:${m.color || '#667eea'}40;">
                    <div class="family-mgr-avatar">${m.avatar || '👤'}</div>
                    <div class="family-mgr-name">${escapeHtml(m.name)}</div>
                    <button class="family-mgr-del" onclick="App.deleteFamilyMemberFromManager(${m.id})" title="Remove">×</button>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Could not load members.</p>';
        }
    }

    async function deleteFamilyMemberFromManager(memberId) {
        if (!confirm('Remove this family member? Their viewing records will also be removed.')) return;
        try {
            await apiCall('family_member_delete', { member_id: memberId });
            showToast('Member removed', 'info');
            await _refreshFamilyMgrList();
            // Also refresh the ratings tab if it's visible
            if (_currentRatingsGroupId) await loadFamilyMembers(_currentRatingsGroupId);
        } catch (e) { showToast('Could not remove member', 'error'); }
    }

    // "Add Member" from the family manager modal — opens addFamilyMemberModal pre-filled
    async function openAddMemberFromManager() {
        if (!_familyMgrGroupId) {
            const pg = await ensurePersonalGroup();
            if (!pg) { showToast('Could not create family group', 'error'); return; }
            _familyMgrGroupId = pg.id;
        }
        _openAddFamilyMemberModalForGroup(_familyMgrGroupId);
    }

    // Internal helper — opens the add-member form for a given group id
    function _openAddFamilyMemberModalForGroup(groupId) {
        _selectedMemberAvatar = '👤';
        _selectedMemberColor  = '#667eea';
        document.getElementById('familyMemberName').value = '';
        document.getElementById('familyMemberAvatar').value = '👤';
        document.getElementById('selectedAvatarDisplay').textContent = '👤';
        document.getElementById('familyMemberColor').value = '#667eea';
        document.getElementById('familyMemberGroupId').value = groupId;
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.avatar-opt').forEach(s => s.classList.remove('active'));
        document.getElementById('addFamilyMemberModal').classList.add('active');
    }

    // Legacy entry-point (Groups > Ratings tab still calls this)
    function openAddFamilyMemberModal() {
        const gid = _currentRatingsGroupId || _familyMgrGroupId;
        if (!gid) { showToast('Select a group first', 'error'); return; }
        _openAddFamilyMemberModalForGroup(gid);
    }

    function closeAddFamilyMemberModal() {
        document.getElementById('addFamilyMemberModal').classList.remove('active');
    }

    function pickAvatar(emoji) {
        _selectedMemberAvatar = emoji;
        document.getElementById('familyMemberAvatar').value = emoji;
        document.getElementById('selectedAvatarDisplay').textContent = emoji;
        document.querySelectorAll('.avatar-opt').forEach(s => s.classList.toggle('active', s.textContent === emoji));
    }

    function pickMemberColor(color) {
        _selectedMemberColor = color;
        document.getElementById('familyMemberColor').value = color;
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.style.background === color));
    }

    async function saveFamilyMember() {
        const groupId = parseInt(document.getElementById('familyMemberGroupId').value);
        const name    = document.getElementById('familyMemberName').value.trim();
        const avatar  = document.getElementById('familyMemberAvatar').value || '👤';
        const color   = document.getElementById('familyMemberColor').value || '#667eea';

        if (!name) { showToast('Enter a name', 'error'); return; }
        if (!groupId) { showToast('No group selected', 'error'); return; }

        try {
            await apiCall('family_member_add', { group_id: groupId, name, avatar, color });
            showToast(`${avatar} ${name} added!`, 'success');
            closeAddFamilyMemberModal();
            // Refresh whichever list is showing
            if (_familyMgrGroupId === groupId) await _refreshFamilyMgrList();
            if (_currentRatingsGroupId === groupId) await loadFamilyMembers(groupId);
        } catch (e) { showToast('Failed: ' + e.message, 'error'); }
    }

    async function deleteFamilyMember(memberId) {
        if (!confirm('Remove this family member? Their ratings will also be removed.')) return;
        try {
            await apiCall('family_member_delete', { member_id: memberId });
            showToast('Member removed', 'info');
            if (_currentRatingsGroupId) await loadFamilyMembers(_currentRatingsGroupId);
        } catch (e) { showToast('Could not remove member', 'error'); }
    }

    // ========================================
    // PUBLIC API
    // ========================================

return {
    init,
    switchTab,
    switchCollectionView,
    setView,
    searchMovies,
    selectMovie,
    addToCollection,
    addToWishlist,
    cancelAdd,
    sortMovies,
    sortCollection,
    filterWishlist,
    openCopyManager,
    closeCopyManager,
    deleteCopy,
    editCopy,
    cancelCopyEdit,
    saveCopyEdit,
    showAddCopyForm,
    hideAddCopyForm,
    lookupBarcode,
    saveNewCopy,
    // Physical Media Editions & Component Tracking (v4.0.0)
    openEditionPicker,
    linkCopyToEdition,
    unlinkCopyEdition,
    showCreateEdition,
    addEditionComponentRow,
    saveNewEdition,
    openComponentChecklist,
    _showAddComponentForm,
    saveAddedComponent,
    addStandardComponents,
    toggleComponent,
    updateComponentCondition,
    // Container component checklist (v2.9.0)
    toggleContainerComponent,
    updateContainerComponentCondition,
    addContainerComponent,
    deleteContainerComponent,
    // UMDB Two-Way Sync (v4.1.0)
    showImportFromUmdb,
    showImportFromAmazon,
    switchAmazonTab,
    fetchAmazonProduct,
    parseAmazonText,
    selectAmazonImage,
    saveAmazonEdition,
    searchUmdbReleases,
    searchUmdbByExternalId,
    importUmdbRelease,
    importUmdbBoxset,
    pushEditionToUmdb,
    pushCopyToUmdb,
    updateUmdbRelease,
    syncEditionFromUmdb,
    pushBoxSetToUmdb,
    syncBoxSetFromUmdb,
    backfillBoxSetReleases,
    pushBoxSetCoverToUmdb,
    unlinkBoxSetFromUmdb,
    syncCollectionToUmdb,
    forceResyncToUmdb,
    linkEditionToUmdb,
    unlinkEditionFromUmdb,
    editDisplayTitle,
    changePoster,
    closePosterSelector,
    selectPoster,
    viewMovieDetails,
    closeMovieDetail,
    removeFromWishlist,
    quickOwnWishlistItem,
    _saveQuickOwn,
    moveToCollection,
    openWishlistScraper,
    closeWishlistScraper,
    runWishlistScrape,
    parseWishlistManual,
    clearScrapeResults,
    addScrapeResultsToWishlist,
    _removeScrapeResult,
    openPresetLists,
    closePresetLists,
    viewPresetList,
    addPresetToWishlist,
    saveSetting,
    updateBrandSize,
    openMovieWithNav,
    showCoverUpload,
    _initCropCanvasEvents,
    closeCoverCrop,
    onCoverFileChange,
    cropZoom,
    saveCroppedCover,
    // Image adjustment & crop controls (v3.0.0)
    setCropAspect,
    applyCropAdjustments,
    resetCropAdjustments,
    autoAdjustCrop,
    extractAverageColor,
    applyPosterSpineColors,
    showShelfWizard,
    closeShelfWizard,
    wizardGoStep2,
    wizardStep1,
    wizardStep2,
    wizardGoStep3,
    wizardStep3,
    wizardCreate,
    wizardToggleMore,
    installPWA,
    initPWAInstallUI,
    switchUser,
    updateDisplayName,
    showStats,
    applyTheme,
    toggleThemeMode,
    openDrawer,
    closeDrawer,
    toggleNavPickerItem,
    renderNavPicker,
    onQuickSearch,
    toggleFloatingSearch,
    closeFloatingSearch,
    onFloatingSearch,
    exportData,
    importCSV,
    loadUnresolved,
    renderUnresolved,
    deleteUnresolved,
    openResolveModal,
    closeResolveModal,
    searchForResolve,
    confirmResolve,
    openSequenceMatcher,
    seqSkip,
    seqPrev,
    fetchAllMissingMetadata,
    toggleIgnoreArticles,
    sortMoviesEnhanced,
    updateFilterUI,
    resetFilters,
    applyFilters,
    toggleFilters,
    onFilterChange,
    updateActiveFilters,
    removeFilter,
    filterByShelf,
    lookupByImdbId,
    // Box Set functions (v2.3.0)
    showAddTypeChoice,
    showAddSingleMovie,
    showAddBoxSet,
    createBoxSetAndAddMovies,
    searchMoviesForBoxSet,
    scanBoxSetTitles,
    addMovieToBoxSet,
    removeMovieFromBoxSet,
    finishBoxSetCreation,
    viewBoxSetDetails,
    updateBoxSetSpinePreview,
    loadBoxSets,
    showBoxSetDetails,
    showBoxSetDetailsWithNav,
    boxSetNav,
    get boxSetNavList() { return boxSetNavList; },
    set boxSetNavList(v) { boxSetNavList = v; },
    loadActiveLayoutSections,
    _shelfDebugSnapshot,
    loadShelfViewBrowse,
    shelfViewDrillIn,
    shelfViewBack,
    shelfViewGoTo,
    moveSectionToShelf,
    // section split / move (v2.8.21)
    toggleShelfSections,
    toggleShowSections,
    toggleShelfSpine,
    openSectionSplitModal,
    closeSectionSplitModal,
    confirmSectionSplitMove,
    splitModalQuickAdd,
    splitModalSetAll,
    renderPhysicalMedia,
    filterPhysicalMedia,
    filterBoxSets,
    setPhysicalView,
    showRelatedMovies,
    closeRelatedMovies,
    viewMovieDetailsWithNav,
    viewCopyDetailsWithNav,
    jumpToCopy,
    shelfMovieNav,
    shelfCopyNav,
    closeBoxSetDetails,
    showCreateBoxSetModal,
    editBoxSet,
    saveBoxSetEdits,
    cancelBoxSetEdit,
    onCustomDropdown,
    deleteBoxSet,
    switchGroupsTab: switchGroupsTab,
       loadGroups: loadGroups,
       showCreateGroupModal: showCreateGroupModal,
       closeCreateGroupModal: closeCreateGroupModal,
       createGroup: createGroup,
       showGroupDetail: showGroupDetail,
       closeGroupDetail: closeGroupDetail,
       generateGroupInviteLink: generateGroupInviteLink,
       generateNewInviteLink: generateNewInviteLink,
       copyGroupInviteLink: copyGroupInviteLink,
       addMemberToGroup: addMemberToGroup,
       removeMember: removeMember,
       leaveGroup: leaveGroup,
       loadFamilyCollection: loadFamilyCollection,
       filterFamilyByMember: filterFamilyByMember,
       viewGroupMovieDetails: viewGroupMovieDetails,
       borrowMovie: borrowMovie,
       returnMovie: returnMovie,
       loadBorrowedItems: loadBorrowedItems,
       loadLentItems: loadLentItems,
       switchGroup: switchGroup,
       loadGroupWishlist: loadGroupWishlist,
       renderGroupWishlist: renderGroupWishlist,
       filterWishlistByMember: filterWishlistByMember,

    // Spreadsheet / Bulk Editor (v2.9.0)
    loadSpreadsheetData,
    renderSpreadsheet,
    filterSpreadsheet,
    saveSpreadsheetChanges,
    onSpreadsheetChange,
    handleSpreadsheetCustomSelect,
    fetchTmdbForCopy,
    fetchMissingTmdbData,
    // Box Set AI Cover Field Detection (v2.9.0)
    scanBoxSetCoverForFields,
    cycleDetectedPhraseField,
    applyDetectedFields,
    closeBoxSetFieldDetect,
    // Box Set Movie Scanner - Camera (v2.9.0)
    openBoxSetScanner,
    boxSetScanCapture,
    removeBoxSetScanItem,
    clearBoxSetScanList,
    processBoxSetScanBatch,
    closeBoxSetScanner,

    // === ADD THESE FOR DEBUGGING ===
    get collection() { return collection; },
    get wishlist() { return wishlist; },
    get unresolvedMovies() { return unresolvedMovies; },

    // ========================================
    // TRIVIA GAME PUBLIC API
    // ========================================
    switchToTrivia,
    showTriviaSettings,
    startTriviaGame,
    answerTriviaQuestion,
    quitTrivia,
    viewTriviaHistory,
    viewTriviaStats,
    switchLeaderboardTab,
    loadGroupLeaderboard,

    // ========================================
    // SHELF MANAGEMENT PUBLIC API
    // ========================================
    loadShelves,
    setShelfView,
    showCreateShelfModal,
    editShelf,
    saveShelf,
    closeShelfModal,
    deleteShelf,
    deleteAllShelves,
    toggleShelfChildren,
    viewShelfContents,
    closeShelfContents,
    removeFromShelf,
    removeContainerFromShelf,
    // Shelf drag-and-drop & sorting (v3.0.0)
    sortShelfContents,
    saveShelfOrder,
    cancelShelfReorder,
    _shelfDragStart,
    _shelfDragOver,
    _shelfDrop,
    _shelfDragEnd,
    viewUnassignedCopies,
    closeUnassignedModal,
    openAssignToShelf,
    confirmAssignToShelf,
    closeAssignToShelf,
    addMoviesToShelf,
    printShelfLayout,
    toggleMovieSelection,
    selectAllUnassigned,
    deselectAllUnassigned,
    onUnassignedFilterChange,

    // ========================================
    // SHELF LAYOUT PROFILES PUBLIC API (v5.0.0)
    // ========================================
    loadLayoutProfiles,
    onLayoutProfileChange,
    showManageLayoutsModal,
    closeManageLayoutsModal,
    promptSaveCurrentLayout,
    deleteLayoutProfile,
    renameLayoutProfile,
    duplicateLayoutProfile,
    applyLayoutProfile,
    // empty layout creation
    showNewEmptyLayoutModal,
    closeNewEmptyLayoutModal,
    confirmNewEmptyLayout,

    // ========================================
    // RECIPE WIZARD PUBLIC API (v6.2.0)
    // ========================================
    showAIWizardModal,
    closeAIWizardModal,
    generateWizardPlan,
    aiWizardBackToStep1,
    applyWizardPlan,
    wizardApplyPreset,
    wizardAddSection,
    wizardRemoveSection,
    _wizardSectionChange,
    // typeahead
    _wizardTypeaheadSearch,
    wizardAddChip,
    wizardRemoveChip,
    // word cloud picker
    openCloudPicker,
    closeCloudPicker,
    _cloudPickerToggle,
    _cloudPickerSearch,
    _cloudPickerSort,
    _cloudPickerConfirm,
    // shelf unit config
    updateWizardCapacity,
    loadWizardShelfUnitConfig,
    saveWizardShelfUnitConfig,

    // ======================================================
    // VIEWING CALENDAR PUBLIC API (v7.0.0)
    // ======================================================
    calendarInit,
    calendarPrevMonth,
    calendarNextMonth,
    calendarGroupChanged,
    openAddToCalendarModal,
    closeAddToCalendarModal,
    calSearchCollection,
    calClearMovie,
    calSelectMovie,
    saveCalendarEvent,
    deleteCalendarEvent,
    markCalendarComplete,
    quickAddToCalendar,

    // ======================================================
    // CINESHELF RATING PUBLIC API (v7.1.0)
    // ======================================================
    openCineRatingModal,
    closeCineRatingModal,
    setStarRating,
    saveCineRating,
    deleteView,
    loadCineRatingsForMovie,
    _togglePartyViewer,
    _setPartyRating,
    _setPartyComment,
    openAddMemberFromRating,

    // ======================================================
    // FAMILY MANAGER PUBLIC API (v7.1.0)
    // ======================================================
    openFamilyManager,
    closeFamilyManager,
    openAddMemberFromManager,
    deleteFamilyMemberFromManager,

    // ======================================================
    // FAMILY MEMBERS & RATINGS TAB PUBLIC API (v7.0.0)
    // ======================================================
    loadGroupRatings,
    openAddFamilyMemberModal,
    closeAddFamilyMemberModal,
    pickAvatar,
    pickMemberColor,
    saveFamilyMember,
    deleteFamilyMember,

    // ======================================================
    // COVER ART SOURCES PUBLIC API (v7.0.0)
    // ======================================================
    applyCustomPosterUrl,
    uploadCoverFile,

    // ======================================================
    // PUBLIC COLLECTION + ONBOARDING PUBLIC API (v8.1.0)
    // ======================================================
    onPublicToggleChange,
    savePublicSettings,
    copyShareUrl,
    closeOnboarding,

    // internal calendar helper used by day cells
    _calDayClick
};

})();

// Note: App.init() is now called by the script loader in index.html
// after all scripts have finished loading.
// Run VersionGuard after DOM ready (non-blocking).
document.addEventListener('DOMContentLoaded', () => checkVersionGuard());