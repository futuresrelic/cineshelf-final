// CineShelf - Frontend Application
// Clean architecture inspired by ChoreQuest
// Version: Managed by version-manager.html (see version.json)

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

const App = (function() {
    
    // State
    let currentUser = localStorage.getItem('cineshelf_user') || 'default';
    let currentTab = 'collection';
    let currentView = 'grid';
    let collection = [];
    let wishlist = [];
    let settings = {};
    let selectedMovie = null;
    
    // API Configuration
    const API_URL = '/api/api.php';
    
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
        }

        // Load settings
    loadSettings();

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
    
    // Load data (sorting will be applied automatically)
    loadCollection();
    loadWishlist();
    loadGroups();

        // Apply saved view preferences
        if (settings.defaultView) {
            setView(settings.defaultView);
        }

        // Apply saved card styles from Card Style Configurator
        loadSavedCardStyles();

        console.log('CineShelf ready!');
    }
    
    // ========================================
    // API CALLS
    // ========================================
    
    async function apiCall(action, data = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include', // Include auth cookie
            body: JSON.stringify({
                action: action,
                // OAuth: user authentication via session cookie, no user parameter needed
                // Legacy support maintained on backend
                ...data
            })
        });

        const result = await response.json();

        if (!result.ok) {
            const error = new Error(result.error || 'API request failed');
            error.data = result.data; // Preserve data from API response
            throw error;
        }

        return result.data;

    } catch (error) {
        console.error('API Error:', error);
        showToast('Error: ' + error.message, 'error');
        throw error;
    }
}
    
    // ========================================
    // COLLECTION MANAGEMENT
    // ========================================
    
    async function loadCollection() {
    try {
        const data = await apiCall('list_collection');
        
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

// Current filter state
let currentFilters = {
    search: '',
    director: 'all',
    actor: 'all',
    studio: 'all',
    genre: 'all',
    certification: 'all',
    yearMin: null,
    yearMax: null
};

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

// Enhanced sort function with new options
function sortMoviesEnhanced(sortBy) {
    let filtered = applyFilters();
    
    filtered.sort((a, b) => {
        const movieA = a.movie;
        const movieB = b.movie;
        
        switch (sortBy) {
            case 'title':
                return (movieA.title || '').localeCompare(movieB.title || '');
            case 'title-desc':
                return (movieB.title || '').localeCompare(movieA.title || '');
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
    currentFilters = {
        search: '',
        director: 'all',
        actor: 'all',
        studio: 'all',
        genre: 'all',
        certification: 'all',
        yearMin: null,
        yearMax: null
    };

    const searchInput = document.getElementById('filterSearch');
    if (searchInput) searchInput.value = '';

    document.getElementById('filterDirector').value = 'all';
    document.getElementById('filterActor').value = 'all';
    document.getElementById('filterStudio').value = 'all';
    document.getElementById('filterGenre').value = 'all';
    document.getElementById('filterCertification').value = 'all';
    document.getElementById('filterYearMin').value = '';
    document.getElementById('filterYearMax').value = '';

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
    
    grid.innerHTML = collection.map(group => {
        const movie = group.movie;
        const copyCount = group.copies.length;
        const posterUrl = movie.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
        const displayTitle = movie.display_title || movie.title || 'Unknown';
        const safeTitle = displayTitle.replace(/"/g, '&quot;');
        const mediaIcon = movie.media_type === 'tv' ? '📺' : '🎬';

        // Get genre emojis
        const genreEmojis = getGenreEmojis(movie.genre);

        // Get cert color
        const certColor = movie.certification ? getCertColor(movie.certification) : '#666';

        // Format runtime
        const runtimeFormatted = formatRuntime(movie.runtime);

        // Conditional rendering based on currentView
        if (currentView === 'list') {
            // Wishlist-style for list view (always-visible metadata)
            return `
            <div class="movie-card collection-card" data-movie-id="${movie.movie_id}" onclick="App.viewMovieDetails(${movie.movie_id})" style="cursor: pointer;">
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
                    <button class="btn-icon" onclick="event.stopPropagation(); App.viewMovieDetails(${movie.movie_id});" title="Details">👁️</button>
                    ${copyCount > 1 ?
                        `<button class="btn-icon" onclick="event.stopPropagation(); App.openCopyManager(${movie.movie_id});" title="Manage">📋</button>` :
                        `<button class="btn-icon" onclick="event.stopPropagation(); App.deleteCopy(${group.copies[0].copy_id});" title="Delete">🗑️</button>`
                    }
                </div>
            </div>
            `;
        } else {
            // Netflix-style for grid and compact views (hover overlay)
            return `
            <div class="movie-card" data-movie-id="${movie.movie_id}" onclick="App.viewMovieDetails(${movie.movie_id})" style="cursor: pointer;">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                    ${copyCount > 1 ? `<div class="copy-count-badge">${copyCount} copies</div>` : ''}
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
                        <button class="hover-btn" onclick="event.stopPropagation(); App.viewMovieDetails(${movie.movie_id});" title="Details">👁️</button>
                        ${copyCount > 1 ?
                            `<button class="hover-btn" onclick="event.stopPropagation(); App.openCopyManager(${movie.movie_id});" title="Manage">📋</button>` :
                            `<button class="hover-btn" onclick="event.stopPropagation(); App.deleteCopy(${group.copies[0].copy_id});" title="Delete">🗑️</button>`
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
    
    // Backward compatibility wrapper for old HTML
    function sortCollection() {
        const sortBy = document.getElementById('sortBy')?.value || 'title';
        // Use enhanced sorting to support filters
        if (typeof sortMoviesEnhanced === 'function') {
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
        
        // ✅ FIX: Apply default sort AFTER loading data
        const defaultSort = settings.defaultSort || 'title';
        sortMovies('wishlist', defaultSort);
        
        updateBadges();
        
    } catch (error) {
        console.error('Failed to load wishlist:', error);
    }
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
        
        grid.innerHTML = wishlist.map(item => {
            const posterUrl = item.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
            const safeTitle = (item.title || 'Unknown').replace(/"/g, '&quot;');
            const isPriority = item.priority > 0;

            // Conditional rendering based on currentView
            if (currentView === 'list') {
                // Wishlist-style for list view (always-visible metadata)
                return `
                <div class="movie-card wishlist-card" data-movie-id="${item.movie_id}">
                    <div class="movie-poster-container">
                        <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                        ${isPriority ? `<div class="priority-badge">⭐ Priority</div>` : ''}
                    </div>
                    <div class="movie-info">
                        <h3 class="movie-title">${safeTitle}</h3>
                        <div class="movie-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${item.rating.toFixed(1)}</span>` : ''}
                        </div>
                        ${item.target_format ? `<div class="movie-format">Want: ${item.target_format}</div>` : ''}
                    </div>
                    <div class="movie-actions">
                        <button class="btn-icon" onclick="App.moveToCollection(${item.movie_id})" title="Add to Collection">➕</button>
                        <button class="btn-icon" onclick="App.removeFromWishlist(${item.movie_id})" title="Remove">🗑️</button>
                    </div>
                </div>
                `;
            } else {
                // Netflix-style for grid and compact views (hover overlay)
                return `
                <div class="movie-card" data-movie-id="${item.movie_id}">
                    <div class="movie-poster-container">
                        <img src="${posterUrl}" alt="${safeTitle}" class="movie-poster">
                        ${isPriority ? `<div class="priority-badge">⭐ Priority</div>` : ''}
                    </div>

                    <div class="hover-overlay">
                        <div class="hover-title">${safeTitle}</div>
                        <div class="hover-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${item.rating.toFixed(1)}</span>` : ''}
                        </div>
                        ${item.target_format ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">Want: ${item.target_format}</div>` : ''}
                        <div class="hover-actions">
                            <button class="hover-btn" onclick="event.stopPropagation(); App.moveToCollection(${item.movie_id});" title="Add to Collection">➕</button>
                            <button class="hover-btn" onclick="event.stopPropagation(); App.removeFromWishlist(${item.movie_id});" title="Remove">🗑️</button>
                        </div>
                    </div>

                    <div class="movie-info">
                        <h3 class="movie-title">${safeTitle}</h3>
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
        }
    }

    async function moveToCollection(movieId) {
        const item = wishlist.find(w => w.movie_id === movieId);
        if (!item) return;
        
        // Now wishlist includes tmdb_id thanks to API fix!
        selectedMovie = {
            id: item.tmdb_id,
            title: item.title,
            poster_path: item.poster_url
        };
        
        // Switch to add tab and show form
        switchTab('add');
        
        document.getElementById('selectedMovieTitle').textContent = item.title;
        document.getElementById('selectedMoviePoster').src = item.poster_url || '';
        
        if (item.target_format) {
            document.getElementById('copyFormat').value = item.target_format;
        }
        
        document.getElementById('addMovieForm').style.display = 'block';
        document.getElementById('searchResults').style.display = 'none';
        
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

    // Load presets when app initializes
    loadPresets();

    async function openPresetLists() {
        const modal = document.getElementById('presetListsModal');
        const container = document.getElementById('presetListsContainer');

        // Reload presets from server to get latest changes
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">Loading presets...</div>';
        modal.style.display = 'flex';

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
        document.getElementById('presetListsModal').style.display = 'none';
    }

    async function viewPresetList(listKey) {
        const list = PRESET_LISTS[listKey];
        if (!list) return;

        const movieList = list.movies.map(m => `• ${m.title} (${m.year})`).join('\n');
        alert(`${list.icon} ${list.name}\n\n${movieList}`);
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
                            media_type: 'movie'
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
                            media_type: 'movie'
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
            const results = await apiCall('search_movie', { query: query });
            
            const resultsDiv = document.getElementById('searchResults');
            resultsDiv.style.display = 'grid';
            
            if (results.length === 0) {
                resultsDiv.innerHTML = '<p>No results found</p>';
                return;
            }
            
            resultsDiv.innerHTML = results.map(movie => {
                const posterUrl = movie.poster_path ? 'https://image.tmdb.org/t/p/w300' + movie.poster_path : '';
                return `
                <div class="search-result-card" 
                     data-movie-id="${movie.id}"
                     data-movie-title="${(movie.title || '').replace(/"/g, '&quot;')}"
                     data-poster-path="${movie.poster_path || ''}">
                    <img src="${posterUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'92\' height=\'138\'%3E%3Crect fill=\'%23333\' width=\'92\' height=\'138\'/%3E%3C/svg%3E'}" alt="${movie.title}">
                    <div class="search-result-info">
                        <h4>${movie.title}</h4>
                        <p>${movie.release_date ? movie.release_date.substring(0, 4) : 'Unknown'}</p>
                        ${movie.vote_average ? `<p>⭐ ${movie.vote_average.toFixed(1)}</p>` : ''}
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
                    selectMovie(id, title, posterPath);
                });
            });
            
            showToast(`Found ${results.length} results`, 'success');
            
        } catch (error) {
            console.error('Search failed:', error);
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
        // Use TMDB's "find" endpoint with IMDb ID
        const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=8039283176a74ffd71a1658c6f84a051&external_source=imdb_id`;
        console.log('CineShelf: Fetching from:', findUrl);
        
        const findResponse = await fetch(findUrl);
        const findData = await findResponse.json();
        
        console.log('CineShelf: TMDB find response:', findData);

        // Check BOTH movie_results and tv_results
        let result = null;
        let mediaType = 'movie';
        
        if (findData.movie_results && findData.movie_results.length > 0) {
            result = findData.movie_results[0];
            mediaType = 'movie';
            console.log('CineShelf: Found movie via IMDB ID:', result);
        } else if (findData.tv_results && findData.tv_results.length > 0) {
            result = findData.tv_results[0];
            mediaType = 'tv';
            console.log('CineShelf: Found TV series via IMDB ID:', result);
        }

        if (result) {
            console.log(`CineShelf: Found ${mediaType} via IMDB ID ${imdbId}:`, result);
            
            // Fetch full details
            const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
            const detailsUrl = `https://api.themoviedb.org/3/${endpoint}/${result.id}?api_key=8039283176a74ffd71a1658c6f84a051&append_to_response=credits,release_dates,content_ratings`;
            console.log('CineShelf: Fetching details from:', detailsUrl);
            
            const response = await fetch(detailsUrl);
            const details = await response.json();
            
            console.log('CineShelf: Details:', details);

            // Build movie data object
            let movieData = {
                id: details.id.toString(),        // ← ADD THIS LINE!
                tmdb_id: details.id.toString(),
                title: mediaType === 'tv' ? details.name : details.title,
                year: null,
                poster_url: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
                overview: details.overview || '',
                rating: details.vote_average || 0,
                media_type: mediaType,
                genre: details.genres?.map(g => g.name).join(', ') || '',
                director: null,
                runtime: null,
                certification: null
            };

            // Get year based on media type
            if (mediaType === 'tv') {
                movieData.year = details.first_air_date ? new Date(details.first_air_date).getFullYear() : null;
                movieData.runtime = details.episode_run_time?.[0] || null;
                
                // Get TV rating
                if (details.content_ratings?.results) {
                    const usRating = details.content_ratings.results.find(r => r.iso_3166_1 === 'US');
                    movieData.certification = usRating?.rating || null;
                }
            } else {
                movieData.year = details.release_date ? new Date(details.release_date).getFullYear() : null;
                movieData.runtime = details.runtime || null;
                
                // Get director
                if (details.credits?.crew) {
                    const director = details.credits.crew.find(person => person.job === 'Director');
                    movieData.director = director?.name || null;
                }
                
                // Get US certification
                if (details.release_dates?.results) {
                    const usRelease = details.release_dates.results.find(r => r.iso_3166_1 === 'US');
                    if (usRelease?.release_dates?.[0]) {
                        movieData.certification = usRelease.release_dates[0].certification || null;
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
            
            document.getElementById('selectedMovieTitle').textContent = movieData.title;
            document.getElementById('selectedMoviePoster').src = movieData.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';

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

    function selectMovie(id, title, posterPath) {
        selectedMovie = { id, title: title, poster_path: posterPath };
        
        document.getElementById('selectedMovieTitle').textContent = selectedMovie.title;
        document.getElementById('selectedMoviePoster').src = posterPath ? 'https://image.tmdb.org/t/p/w300' + posterPath : '';
        
        document.getElementById('addMovieForm').style.display = 'block';
        document.getElementById('searchResults').style.display = 'none';
    }
    
    async function addToCollection() {
        if (!selectedMovie) return;
        
        const format = document.getElementById('copyFormat').value;
        const edition = document.getElementById('copyEdition').value;
        const region = document.getElementById('copyRegion').value;
        const condition = document.getElementById('copyCondition').value;
        const notes = document.getElementById('copyNotes').value;
        
        try {
            await apiCall('add_copy', {
                tmdb_id: selectedMovie.id,
                format: format,
                edition: edition,
                region: region,
                condition: condition,
                notes: notes
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
        }
    }
    
    async function addToWishlist() {
        if (!selectedMovie) return;
        
        try {
            await apiCall('add_wishlist', {
                tmdb_id: selectedMovie.id,
                priority: 0,
                target_format: document.getElementById('copyFormat').value,
                notes: document.getElementById('copyNotes').value
            });
            
            showToast('Added to wishlist!', 'success');
            
            // Clear form
            cancelAdd();
            
            // Reload wishlist
            loadWishlist();
            
            // Switch to wishlist tab
            switchTab('wishlist');
            
        } catch (error) {
            console.error('Failed to add to wishlist:', error);
        }
    }

    function cancelAdd() {
        selectedMovie = null;
        document.getElementById('movieSearch').value = '';
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('addMovieForm').style.display = 'none';
        document.getElementById('copyFormat').value = 'DVD';
        document.getElementById('copyEdition').value = '';
        document.getElementById('copyRegion').value = '';
        document.getElementById('copyCondition').value = 'Good';
        document.getElementById('copyNotes').value = '';

        // Show search results again
        document.getElementById('searchResults').style.display = 'grid';
    }
    
    // ========================================
    // COPY MANAGEMENT
    // ========================================
    
    async function openCopyManager(movieId) {
    try {
        const copies = await apiCall('get_movie_copies', { movie_id: movieId });
        
        if (copies.length === 0) {
            showToast('No copies found', 'error');
            return;
        }
        
        const firstCopy = copies[0];
        const movieTitle = firstCopy && firstCopy.movie ? 
            firstCopy.movie.title : 'this movie';
        
        const content = document.getElementById('copyManagerContent');
        
        content.innerHTML = `
            <h4>All Copies of ${movieTitle}</h4>
            <div class="copies-list">
                ${copies.map((copy, index) => `
                    <div class="copy-item" id="copy-item-${copy.id}">
                        <div class="copy-header">
                            <strong>Copy #${index + 1}</strong>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-icon" onclick="App.editCopy(${copy.id})" title="Edit">✏️</button>
                                <button class="btn-icon" onclick="App.deleteCopy(${copy.id})" title="Delete">🗑️</button>
                            </div>
                        </div>
                        
                        <!-- View Mode -->
                        <div id="copy-view-${copy.id}" class="copy-details">
                            <div><strong>Format:</strong> ${copy.format}</div>
                            ${copy.edition ? `<div><strong>Edition:</strong> ${copy.edition}</div>` : ''}
                            ${copy.region ? `<div><strong>Region:</strong> ${copy.region}</div>` : ''}
                            ${copy.condition ? `<div><strong>Condition:</strong> ${copy.condition}</div>` : ''}
                            ${copy.notes ? `<div><strong>Notes:</strong> ${copy.notes}</div>` : ''}
                        </div>
                        
                        <!-- Edit Mode (Hidden by default) -->
                        <div id="copy-edit-${copy.id}" class="copy-edit-form" style="display: none;">
                            <div class="form-group">
                                <label>Format *</label>
                                <select id="edit-format-${copy.id}" class="form-control">
                                    <option value="DVD" ${copy.format === 'DVD' ? 'selected' : ''}>DVD</option>
                                    <option value="Blu-ray" ${copy.format === 'Blu-ray' ? 'selected' : ''}>Blu-ray</option>
                                    <option value="4K Ultra HD" ${copy.format === '4K Ultra HD' ? 'selected' : ''}>4K Ultra HD</option>
                                    <option value="Digital" ${copy.format === 'Digital' ? 'selected' : ''}>Digital</option>
                                    <option value="VHS" ${copy.format === 'VHS' ? 'selected' : ''}>VHS</option>
                                    <option value="LaserDisc" ${copy.format === 'LaserDisc' ? 'selected' : ''}>LaserDisc</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Edition</label>
                                <input type="text" id="edit-edition-${copy.id}" 
                                       class="form-control" 
                                       value="${copy.edition || ''}" 
                                       placeholder="e.g., Director's Cut">
                            </div>
                            
                            <div class="form-group">
                                <label>Region</label>
                                <input type="text" id="edit-region-${copy.id}" 
                                       class="form-control" 
                                       value="${copy.region || ''}" 
                                       placeholder="e.g., Region 1">
                            </div>
                            
                            <div class="form-group">
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
        `;
        
        document.getElementById('copyManagerModal').classList.add('active');
        
    } catch (error) {
        console.error('Failed to load copies:', error);
    }
}

function closeCopyManager() {
    document.getElementById('copyManagerModal').classList.remove('active');
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
            notes
        });
        
        showToast('Copy updated successfully!', 'success');
        
        // Reload the copy manager to show updated values
        await openCopyManager(movieId);
        
        // Also reload collection to refresh the main view
        loadCollection();
        
    } catch (error) {
        console.error('Failed to update copy:', error);
        showToast('Failed to update copy', 'error');
    }
}

async function deleteCopy(copyId) {
    if (!confirm('Delete this copy?')) return;
    
    try {
        await apiCall('delete_copy', { copy_id: copyId });
        showToast('Copy deleted', 'success');
        loadCollection();
        closeCopyManager();
    } catch (error) {
        console.error('Failed to delete copy:', error);
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
    
    title.textContent = `Select Poster for "${movie.display_title || movie.title}"`;
    
    grid.innerHTML = posters.map(poster => {
        const posterUrl = 'https://image.tmdb.org/t/p/w342' + poster.file_path;
        const isCurrent = movie.poster_url && movie.poster_url.includes(poster.file_path);
        
        return `
            <div class="poster-option ${isCurrent ? 'current-poster' : ''}" 
                 onclick="App.selectPoster(${movieId}, '${poster.file_path}')"
                 style="cursor: pointer; position: relative;">
                <img src="${posterUrl}" 
                     alt="Poster option" 
                     style="width: 100%; border-radius: 8px; transition: all 0.2s;"
                     onmouseover="this.style.transform='scale(1.05)'"
                     onmouseout="this.style.transform='scale(1)'">
                ${isCurrent ? '<div style="position: absolute; top: 5px; right: 5px; background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">CURRENT</div>' : ''}
                <div style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; color: rgba(255,255,255,0.7);">
                    ${poster.width}×${poster.height}
                    ${poster.vote_average ? `<br>⭐ ${poster.vote_average.toFixed(1)}` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    modal.classList.add('active');
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

async function viewMovieDetails(movieId) {
    try {
        const group = collection.find(c => c.movie.movie_id === movieId);
        if (!group) return;
        
        const movie = group.movie;
        
        // Get all copies for this movie
        const copies = await apiCall('get_movie_copies', { movie_id: movieId });
        
        const content = document.getElementById('movieDetailContent');
        const posterUrl = movie.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\'%3E%3Crect fill=\'%23333\' width=\'300\' height=\'450\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'20\'%3ENo Poster%3C/text%3E%3C/svg%3E';
        
        content.innerHTML = `
            <div class="movie-detail-layout">
                <div class="movie-detail-poster">
                    <img src="${posterUrl}" alt="${movie.title}">
                </div>
                <div class="movie-detail-info">
                    <div style="display: flex; align-items: center; gap: 1rem;">
    <h2>${movie.display_title || movie.title}</h2>
    <button class="btn-icon" onclick="App.editDisplayTitle(${movieId})" title="Edit Display Name">✏️</button>
    <button class="btn-icon" onclick="App.changePoster(${movieId})" title="Change Poster">🖼️</button>
</div>
${movie.display_title ? `<div style="color: rgba(255,255,255,0.5); font-size: 0.9rem; margin-top: -0.5rem;">Original: ${movie.title}</div>` : ''}
                    <div class="movie-detail-meta">
                        ${movie.year ? `<span>${movie.year}</span>` : ''}
                        ${movie.runtime ? `<span>${movie.runtime} min</span>` : ''}
                        ${movie.rating ? `<span>⭐ ${movie.rating.toFixed(1)}</span>` : ''}
                        ${movie.certification ? `<span class="cert-badge" style="background: ${getCertColor(movie.certification)};">${movie.certification}</span>` : ''}
                    </div>
                    ${movie.genre ? `<div class="movie-detail-genre">${movie.genre}</div>` : ''}
                    ${movie.director ? `<div class="movie-detail-director">🎬 Directed by ${movie.director}</div>` : ''}
                    ${movie.overview ? `<p class="movie-detail-overview">${movie.overview}</p>` : ''}
                    
                    <div class="movie-detail-section">
                        <h3>Your Copies (${copies.length})</h3>
                        
                        ${copies.length > 0 ? `
                            <div class="copies-summary">
                                ${copies.map((copy, i) => `
                                    <div class="copy-summary-item">
                                        <div class="copy-number">Copy ${i + 1}</div>
                                        <div class="copy-details">
                                            ${copy.format}${copy.edition ? ` - ${copy.edition}` : ''}${copy.condition ? ` (${copy.condition})` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            
                            ${copies.length > 0 ? `
                                <button class="btn" onclick="App.openCopyManager(${movieId})" style="margin-top: 1rem;">
                                    ✏️ Manage Copies
                                </button>
                            ` : ''}
                        ` : `
                            <p style="color: rgba(255,255,255,0.6);">No copies in your collection</p>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('movieDetailModal').classList.add('active');
        
    } catch (error) {
        console.error('Failed to load movie details:', error);
        showToast('Failed to load movie details', 'error');
    }
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
        document.getElementById('movieDetailModal').classList.remove('active');
    }
    
    // ========================================
    // UI HELPERS
    // ========================================
    
    function switchTab(tabName) {
        currentTab = tabName;

        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabName).classList.add('active');

        // Update tab navigation buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Load unresolved movies when switching to resolve tab
        if (tabName === 'resolve') {
            loadUnresolved();
        }
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
            grid.classList.remove('grid-view', 'compact-view', 'list-view');

            // Add the selected view class
            if (viewType === 'list') {
                grid.classList.add('list-view');
            } else if (viewType === 'compact') {
                grid.classList.add('compact-view');
            } else {
                grid.classList.add('grid-view');
            }
        });

        // Trigger re-renders to update HTML structure based on view
        renderCollection();
        renderWishlist();

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

    // Load and apply saved card styles from Card Style Configurator
    function loadSavedCardStyles() {
        try {
            const savedConfigs = JSON.parse(localStorage.getItem('cineshelf_card_styles_all') || '{}');

            if (Object.keys(savedConfigs).length === 0) {
                console.log('No saved card styles found');
                return;
            }

            // Generate CSS for each saved grid configuration
            let cssText = '/* CineShelf - Auto-loaded Card Styles from localStorage */\n\n';

            for (const [gridType, config] of Object.entries(savedConfigs)) {
                const gridSelector = getGridSelectorForStyle(gridType);
                const gridName = getGridName(gridType);

                cssText += `/* ${gridName} */\n`;

                // CSS Variables for Grid/Compact/List Views
                if (config.gridMinWidth || config.gridGap || config.compactMinWidth || config.compactGap || config.listGap) {
                    cssText += `${gridSelector} {\n`;
                    if (config.gridMinWidth) cssText += `    --grid-min-width: ${config.gridMinWidth}px;\n`;
                    if (config.gridGap) cssText += `    --grid-gap: ${config.gridGap}rem;\n`;
                    if (config.compactMinWidth) cssText += `    --compact-min-width: ${config.compactMinWidth}px;\n`;
                    if (config.compactGap) cssText += `    --compact-gap: ${config.compactGap}rem;\n`;
                    if (config.listGap) cssText += `    --list-gap: ${config.listGap}rem;\n`;
                    cssText += `}\n\n`;
                }

                // List View Styling
                const gridPrefix = gridType === 'all' ? '' : `${gridSelector} `;

                if (config.titleSize) {
                    cssText += `${gridPrefix}.movie-grid.list-view .movie-title {\n    font-size: ${config.titleSize}rem !important;\n}\n\n`;
                }

                if (config.metaSize || config.metaGap) {
                    cssText += `${gridPrefix}.movie-meta {\n`;
                    if (config.metaSize) cssText += `    font-size: ${config.metaSize}rem !important;\n`;
                    if (config.metaGap) cssText += `    gap: ${config.metaGap}rem !important;\n`;
                    cssText += `}\n\n`;
                }

                if (config.directorSize || config.elementSpacing || config.showDirector === false) {
                    cssText += `${gridPrefix}.movie-director {\n`;
                    if (config.directorSize) cssText += `    font-size: ${config.directorSize}rem !important;\n`;
                    if (config.elementSpacing) cssText += `    margin-top: ${config.elementSpacing}rem !important;\n`;
                    if (config.showDirector === false) cssText += `    display: none !important;\n`;
                    cssText += `}\n\n`;
                }

                if (config.genreSize || config.elementSpacing || config.showGenres === false) {
                    cssText += `${gridPrefix}.movie-genres {\n`;
                    if (config.genreSize) cssText += `    font-size: ${config.genreSize}rem !important;\n`;
                    if (config.elementSpacing) cssText += `    margin-top: ${config.elementSpacing}rem !important;\n`;
                    if (config.showGenres === false) cssText += `    display: none !important;\n`;
                    cssText += `}\n\n`;
                }

                if (config.cardHeight) {
                    cssText += `${gridPrefix}.movie-grid.list-view .movie-card {\n    min-height: ${config.cardHeight}px !important;\n    max-height: ${config.cardHeight}px !important;\n}\n\n`;
                }

                if (config.posterWidth) {
                    cssText += `${gridPrefix}.movie-grid.list-view .movie-poster-container {\n    width: ${config.posterWidth}px !important;\n}\n\n`;
                }

                if (config.cardPadding) {
                    cssText += `${gridPrefix}.movie-info {\n    padding: ${config.cardPadding}rem !important;\n}\n\n`;
                    cssText += `${gridPrefix}.movie-actions {\n    padding: ${config.cardPadding}rem !important;\n}\n\n`;
                }
            }

            // Inject the CSS into the page
            const styleElement = document.createElement('style');
            styleElement.id = 'cineshelf-saved-card-styles';
            styleElement.textContent = cssText;

            // Remove old styles if they exist
            const oldStyle = document.getElementById('cineshelf-saved-card-styles');
            if (oldStyle) oldStyle.remove();

            document.head.appendChild(styleElement);
            console.log('Saved card styles applied successfully');
        } catch (error) {
            console.error('Error loading saved card styles:', error);
        }
    }

    function getGridSelectorForStyle(gridType) {
        const gridMap = {
            'all': '.movie-grid',
            'collection': '#collectionGrid',
            'wishlist': '#wishlistGrid',
            'family': '#familyCollectionGrid',
            'groupwishlist': '#groupWishlistGrid'
        };
        return gridMap[gridType] || '.movie-grid';
    }

    function getGridName(gridType) {
        const nameMap = {
            'all': 'All Grids',
            'collection': 'Collection',
            'wishlist': 'Wishlist',
            'family': 'Family Collection',
            'groupwishlist': 'Group Wishlist'
        };
        return nameMap[gridType] || gridType;
    }

        function updateBadges() {
    const collectionCount = collection.length;
    const wishlistCount = wishlist.length;
    
    // Update tab badges
    document.getElementById('collectionCount').textContent = collectionCount;
    document.getElementById('wishlistCount').textContent = wishlistCount;
    
    // Update section headers (if they exist)
    const collectionHeader = document.getElementById('collectionHeader');
    if (collectionHeader) {
        collectionHeader.textContent = `Your Collection (${collectionCount})`;
    }
    
    const wishlistHeader = document.getElementById('wishlistHeader');
    if (wishlistHeader) {
        wishlistHeader.textContent = `Your Wishlist (${wishlistCount})`;
    }
}
    
    function showToast(message, type = 'info') {
        // Simple alert for now - can be enhanced
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // You can add a proper toast notification system here
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:1rem;background:#333;color:white;border-radius:8px;z-index:9999;';
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
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

    async function showStats() {
        try {
            const stats = await apiCall('get_stats');

            let message = `📊 Collection Statistics\n\n`;
            message += `Total Copies: ${stats.total_copies}\n`;
            message += `Unique Movies: ${stats.unique_movies}\n`;
            message += `Wishlist: ${stats.wishlist_count}\n\n`;

            if (stats.by_format && stats.by_format.length > 0) {
                message += `By Format:\n`;
                stats.by_format.forEach(item => {
                    message += `  ${item.format}: ${item.count}\n`;
                });
            }

            alert(message);

        } catch (error) {
            console.error('Failed to load stats:', error);
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
                                        barcode: movie.barcode
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
            <button class="btn-resolve" data-movie-id="${movie.movie_id}" data-title="${safeTitle}">
                🔍 Match
            </button>
        `;

        list.appendChild(item);
    });

    // Add event listeners to all resolve buttons
    list.querySelectorAll('.btn-resolve').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const movieId = parseInt(e.target.dataset.movieId);
            const title = e.target.dataset.title;
            openResolveModal(movieId, title);
        });
    });
}

function toggleFilters() {
    const controls = document.getElementById('filterControls');
    const btn = document.getElementById('filterToggleBtn');
    
    if (controls.style.display === 'none') {
        controls.style.display = 'grid';
        btn.textContent = '🔍 Hide Filters';
        updateFilterUI(); // Populate dropdowns
    } else {
        controls.style.display = 'none';
        btn.textContent = '🔍 Filters & Sort';
    }
}

function onFilterChange(filterType, value) {
    // Update filter state
    if (filterType === 'yearMin' || filterType === 'yearMax') {
        currentFilters[filterType] = value ? parseInt(value) : null;
    } else {
        currentFilters[filterType] = value;
    }
    
    // Apply filters and re-render
    const sortBy = document.getElementById('sortBySelect').value || 'title';
    sortMoviesEnhanced(sortBy);
    
    // Update active filters display
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
        
        modalTitle.textContent = `Match Movie: ${title}`;
        searchInput.value = title; // Pre‑fill with current title
        resultsDiv.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 2rem;">Enter a search term and click \"Search TMDB\"</p>';
        
        modal.classList.add('active');
        
        // Auto‑focus search input
        setTimeout(() => searchInput.focus(), 100);
    }
    
    function closeResolveModal() {
        const modal = document.getElementById('resolveModal');
        if (modal) {
            modal.classList.remove('active');
        }
        currentResolvingMovie = null;
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
        
        resultsDiv.innerHTML = results.slice(0, 10).map(item => {
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
    
    const mediaIcon = mediaType === 'tv' ? '📺' : '🎬';
    const mediaLabel = mediaType === 'tv' ? 'TV Series' : 'Movie';
    
    if (!confirm(`Match "${currentResolvingMovie.title}" with:\n\n${mediaIcon} "${title}" (${year})\nType: ${mediaLabel}\n\nThis will update the movie with full TMDB data.`)) {
        return;
    }
    
    try {
        showToast('Resolving...', 'info');
        
        const result = await apiCall('resolve_movie', {
            movie_id: currentResolvingMovie.movieId,
            tmdb_id: String(tmdbId),
            media_type: mediaType
        });
        
        showToast(`✅ Matched "${title}"!`, 'success');
        
        // Close modal and reload
        closeResolveModal();
        loadUnresolved();
        loadCollection();
        
    } catch (error) {
        console.error('Resolve failed:', error);
        
        // Check if it's a duplicate movie error
        if (error.message && error.message.includes('already exists')) {
            // Parse the error data (API returns it in error.data when ok=false)
            const errorData = error.data;
            
            if (errorData && errorData.already_exists) {
                // Show confirmation for adding another copy
                const existingTitle = errorData.existing_movie.title;
                const confirmMerge = confirm(
                    `⚠️ "${existingTitle}" already exists in your collection!\n\n` +
                    `Do you want to add your unresolved copies to the existing movie?\n\n` +
                    `YES = Merge unresolved copies with existing movie\n` +
                    `NO = Cancel (you can delete the unresolved entry manually)`
                );
                
                if (confirmMerge) {
                    // Call again with confirm_merge flag
                    try {
                        showToast('Merging copies...', 'info');
                        
                        const mergeResult = await apiCall('resolve_movie', {
                            movie_id: currentResolvingMovie.movieId,
                            tmdb_id: String(tmdbId),
                            media_type: mediaType,
                            confirm_merge: true
                        });
                        
                        const copiesCount = mergeResult.copies_moved || 0;
                        showToast(`✅ Merged ${copiesCount} ${copiesCount === 1 ? 'copy' : 'copies'} to existing movie!`, 'success');
                        
                        closeResolveModal();
                        loadUnresolved();
                        loadCollection();
                        
                    } catch (mergeError) {
                        console.error('Merge failed:', mergeError);
                        showToast('Failed to merge copies', 'error');
                    }
                }
            } else {
                showToast('Failed to resolve movie', 'error');
            }
        } else {
            showToast('Failed to resolve movie', 'error');
        }
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
            const groupSelectorDiv = document.getElementById('groupSelector');
            if (groupSelectorDiv) groupSelectorDiv.style.display = 'block';
            
            groupSelector.innerHTML = '<option value="">My Collection</option>';
            familyGroupSelect.innerHTML = '<option value="">Select a group...</option>';
            wishlistGroupSelect.innerHTML = '<option value="">Select a group...</option>';

            userGroups.forEach(group => {
                groupSelector.innerHTML += `<option value="${group.id}">${group.name}</option>`;
                familyGroupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
                wishlistGroupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
            });
        } else {
            const groupSelectorDiv = document.getElementById('groupSelector');
            if (groupSelectorDiv) groupSelectorDiv.style.display = 'none';
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
                        ${movie.certification ? `<span class="cert-badge" style="background: ${getCertColor(movie.certification)};">${movie.certification}</span>` : ''}
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
    // PUBLIC API
    // ========================================

return {
    init,
    switchTab,
    setView,
    searchMovies,
    selectMovie,
    addToCollection,
    addToWishlist,
    cancelAdd,
    sortMovies,
    sortCollection,
    openCopyManager,
    closeCopyManager,
    deleteCopy,
    editCopy,              // ← ADD
    cancelCopyEdit,        // ← ADD
    saveCopyEdit,          // ← ADD
    editDisplayTitle,
    changePoster,
    closePosterSelector,
    selectPoster,
    viewMovieDetails,
    closeMovieDetail,
    removeFromWishlist,
    moveToCollection,
    openPresetLists,
    closePresetLists,
    viewPresetList,
    addPresetToWishlist,
    saveSetting,
    switchUser,
    updateDisplayName,
    showStats,
    exportData,
    importCSV,
    loadUnresolved,
    renderUnresolved,
    openResolveModal,
    closeResolveModal,
    searchForResolve,
    confirmResolve,
    sortMoviesEnhanced,
    updateFilterUI,
    resetFilters,
    applyFilters,
    toggleFilters,
    onFilterChange,
    updateActiveFilters,
    removeFilter,
    lookupByImdbId,
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
    loadGroupLeaderboard
};

})();

// Note: App.init() is now called by the script loader in index.html
// after all scripts have finished loading