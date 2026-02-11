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
    let currentCollectionSubview = 'movies'; // 'movies' | 'wishlist' | 'physical'
    let collection = [];
    let originalCollection = []; // Store full collection for filtering
    let wishlist = [];
    let containerMemberships = {}; // movie_id → [container_name, ...] for 📦 badge
    let shelves = []; // Store shelves for filtering
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
    loadShelves(); // Load shelves to populate dropdown

        // Apply saved view preferences
        if (settings.defaultView) {
            setView(settings.defaultView);
        }

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
                        `<button class="btn-icon" onclick="event.stopPropagation(); App.deleteCopy(${group.copies[0].copy_id});" title="Delete">🗑️</button>`
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

        // Capture ordered list for prev/next nav
        wishlistNavList = wishlist.map(w => w.movie_id);

        grid.innerHTML = wishlist.map(item => {
            const posterUrl = item.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'300\'%3E%3Crect fill=\'%23333\' width=\'200\' height=\'300\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\'%3ENo Poster%3C/text%3E%3C/svg%3E';
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
                        <h3 class="movie-title">${safeTitle}</h3>
                        <div class="movie-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${item.rating.toFixed(1)}</span>` : ''}
                        </div>
                        ${item.target_format ? `<div class="movie-format">Want: ${item.target_format}</div>` : ''}
                    </div>
                    <div class="movie-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); App.openMovieWithNav(${item.movie_id}, 'wishlist');" title="Details">👁️</button>
                        <button class="btn-icon" onclick="event.stopPropagation(); App.moveToCollection(${item.movie_id});" title="Add to Collection">➕</button>
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
                        <div class="hover-title">${safeTitle}</div>
                        <div class="hover-meta">
                            ${item.year ? `<span>${item.year}</span>` : ''}
                            ${item.rating ? `<span>⭐ ${item.rating.toFixed(1)}</span>` : ''}
                        </div>
                        ${item.target_format ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 0.25rem;">Want: ${item.target_format}</div>` : ''}
                        <div class="hover-actions">
                            <button class="hover-btn" onclick="event.stopPropagation(); App.openMovieWithNav(${item.movie_id}, 'wishlist');" title="Details">👁️</button>
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
            
            // Switch to wishlist sub-view inside Collection tab
            switchTab('collection');
            switchCollectionView('wishlist');
            
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
        const posterUrl = movie.poster_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'450\'%3E%3Crect fill=\'%23333\' width=\'300\' height=\'450\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' fill=\'white\' font-size=\'20\'%3ENo Poster%3C/text%3E%3C/svg%3E';

        content.innerHTML = `
            <div class="movie-detail-layout">
                <div class="movie-detail-poster">
                    <img src="${posterUrl}" alt="${movie.title}">
                </div>
                <div class="movie-detail-info">
                    <div style="display: flex; align-items: center; gap: 1rem;">
    <h2>${movie.display_title || movie.title}</h2>
    ${!isWishlistOnly ? `<button class="btn-icon" onclick="App.editDisplayTitle(${movieId})" title="Edit Display Name">✏️</button>
    <button class="btn-icon" onclick="App.changePoster(${movieId})" title="Change Poster">🖼️</button>` : ''}
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
                    `}
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
        // Clear shelf nav context when closing
        shelfNavMovieList = [];
        shelfNavIndex = -1;
        const nav = document.getElementById('movieDetailNav');
        if (nav) nav.style.display = 'none';
    }

    // ========================================
    // SHELF VIEW MOVIE NAVIGATION
    // Prev / next through movies while in shelf view modal
    // ========================================

    let shelfNavMovieList = []; // array of movie_ids in current shelf level
    let shelfNavIndex = -1;     // current position in that list

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
        shelfNavMovieList = movieList;
        shelfNavIndex = movieList.indexOf(movieId);
        viewMovieDetails(movieId);
        _updateShelfNavUI();
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
        } else {
            nav.style.display = 'none';
        }
    }

    // Keyboard arrow navigation (only when modal is open and nav is active)
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('movieDetailModal');
        if (!modal || !modal.classList.contains('active')) return;
        if (!shelfNavMovieList.length) return;
        if (e.key === 'ArrowLeft')  { e.preventDefault(); shelfMovieNav(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); shelfMovieNav(1); }
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
            if (!shelfNavMovieList.length) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            // Only trigger if horizontal swipe is dominant and > 60px
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0) shelfMovieNav(1);  // swipe left → next
                else        shelfMovieNav(-1); // swipe right → prev
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

        // Load shelves when switching to shelves tab
        if (tabName === 'shelves') {
            loadShelves();
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
            movies:    document.getElementById('subviewMovies'),
            wishlist:  document.getElementById('subviewWishlist'),
            boxsets:   document.getElementById('subviewBoxSets'),
            shelfview: document.getElementById('subviewShelf')
        };
        Object.entries(panels).forEach(([key, el]) => {
            if (el) el.style.display = key === view ? 'block' : 'none';
        });

        // Show shelf filter and main sort only for Movies sub-view
        const shelfFilter = document.getElementById('shelfFilter');
        const sortBy = document.getElementById('sortBy');
        const filterBar = document.getElementById('filterBar');
        if (shelfFilter) shelfFilter.style.display = view === 'movies' ? '' : 'none';
        if (sortBy)      sortBy.style.display      = view === 'movies' ? '' : 'none';
        if (filterBar)   filterBar.style.display    = view === 'movies' ? '' : 'none';

        // Update the section heading
        const header = document.getElementById('collectionHeader');
        if (header) {
            if (view === 'movies')    header.textContent = `Your Collection (${collection.length})`;
            if (view === 'wishlist')  header.textContent = `Your Wishlist (${wishlist.length})`;
            if (view === 'boxsets')   header.textContent = 'Box Sets';
            if (view === 'shelfview') header.textContent = 'Shelf View';
        }

        // Load data for the selected sub-view
        if (view === 'wishlist') {
            loadWishlist();
        } else if (view === 'boxsets') {
            loadBoxSets();
        } else if (view === 'shelfview') {
            loadShelfViewBrowse();
        }
    }

    // ========================================
    // SHELF VIEW BROWSER (inside Collection tab)
    // Hierarchical shelf navigation with back button
    // ========================================

    let shelfViewStack = []; // [{id: null, name: 'All Shelves'}, {id:5, name:'Living Room'}, ...]
    let shelfViewMoviesCache = {}; // keyed by shelf_id → array of items

    // Format → spine color mapping
    const SPINE_FORMAT_COLORS = {
        '4k': '#c0a020', 'uhd': '#c0a020', 'blu-ray': '#1a6fd4', 'bluray': '#1a6fd4',
        'blu_ray': '#1a6fd4', 'dvd': '#c0392b', 'vhs': '#27ae60', 'laserdisc': '#8e44ad',
        '16mm': '#d35400', 'digital': '#2980b9'
    };

    function spineColorForItem(item, shelfColor) {
        if (item.is_container) return null; // handled separately
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

    async function loadShelfViewBrowse(reset = true) {
        if (reset || shelfViewStack.length === 0) {
            shelfViewStack = [{ id: null, name: 'All Shelves' }];
        }
        if (!shelves || shelves.length === 0) {
            try { shelves = await apiCall('list_shelves'); } catch(e) {}
        }

        // Pre-fetch ALL shelf contents in parallel and cache
        const content = document.getElementById('shelfViewContent');
        if (content) content.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,0.5)">Loading shelves…</div>';

        shelfViewMoviesCache = {};
        await Promise.all(shelves.map(async shelf => {
            try {
                const items = await apiCall('get_shelf_contents', { shelf_id: shelf.id });
                shelfViewMoviesCache[shelf.id] = items || [];
            } catch(e) {
                shelfViewMoviesCache[shelf.id] = [];
            }
        }));

        await renderShelfViewLevel();
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

    function renderSpineStrip(items, shelfColor) {
        if (!items || items.length === 0) {
            return `<span class="spine-empty-msg">Empty</span>`;
        }
        const navIds = _shelfNavIds(items);
        return items.map(item => {
            if (item.is_container) {
                const count = item.container_movie_count || 0;
                const label = item.container_spine_label || item.container_name || 'Box Set';
                return `<div class="spine-item spine-container"
                             title="${(item.container_name || '').replace(/"/g,'&quot;')} · ${count} films"
                             onclick="App.showBoxSetDetails(${item.container_id})">
                            <span class="spine-title">${label}</span>
                            ${count > 0 ? `<span class="spine-badge">${count}</span>` : ''}
                        </div>`;
            } else {
                const color = spineColorForItem(item, shelfColor);
                const title = (item.display_title || item.title || '').replace(/"/g,'&quot;');
                return `<div class="spine-item"
                             title="${title} (${item.year || '?'}) · ${item.format || ''}"
                             onclick="App.viewMovieDetailsWithNav(${item.movie_id}, ${navIds})"
                             style="--spine-color:${color}">
                            <span class="spine-title">${item.display_title || item.title}</span>
                        </div>`;
            }
        }).join('');
    }

    function renderPosterGrid(items) {
        if (!items || items.length === 0) return '';
        const navIds = _shelfNavIds(items);
        let html = `<div class="shelf-view-movies-grid">`;
        items.forEach(item => {
            if (item.is_container) {
                html += `<div class="shelf-view-movie-card container-card" onclick="App.showBoxSetDetails(${item.container_id})">
                    <div class="shelf-view-poster-placeholder" style="font-size:2.5rem">📦</div>
                    <div class="shelf-view-movie-title">${item.container_name}</div>
                    <div class="shelf-view-movie-meta">Box Set · ${item.container_movie_count || 0} films</div>
                </div>`;
            } else {
                html += `<div class="shelf-view-movie-card" onclick="App.viewMovieDetailsWithNav(${item.movie_id}, ${navIds})">
                    ${item.poster_url
                        ? `<img src="${item.poster_url}" alt="${(item.display_title||item.title||'').replace(/"/g,'')}" class="shelf-view-poster" onerror="this.parentElement.classList.add('no-poster');this.style.display='none'">`
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
            childShelves.forEach(shelf => {
                const shelfMovies = getShelfMoviesRecursive(shelf.id);
                const subSectionCount = shelves.filter(s => s.parent_shelf_id === shelf.id).length;
                const safeName = shelf.name.replace(/'/g, "\\'");
                html += `
                <div class="shelf-row">
                    <div class="shelf-row-header" onclick="App.shelfViewDrillIn(${shelf.id}, '${safeName}')"
                         style="border-left-color:${shelf.color || '#667eea'}">
                        <span class="shelf-row-icon">${shelf.icon || '📂'}</span>
                        <span class="shelf-row-name">${shelf.name}</span>
                        <span class="shelf-row-meta">
                            ${shelfMovies.length} film${shelfMovies.length !== 1 ? 's' : ''}
                            ${subSectionCount > 0 ? ` · ${subSectionCount} section${subSectionCount !== 1 ? 's' : ''}` : ''}
                        </span>
                        <span class="shelf-row-arrow">›</span>
                    </div>
                    <div class="shelf-spine-row" style="--shelf-color:${shelf.color || '#667eea'}">
                        ${renderSpineStrip(shelfMovies, shelf.color || '#667eea')}
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
    }

    function shelfViewGoTo(stackIndex) {
        shelfViewStack = shelfViewStack.slice(0, stackIndex + 1);
        renderShelfViewLevel();
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
    
        function updateBadges() {
    const collectionCount = collection.length;
    const wishlistCount = wishlist.length;
    
    // Update tab badges
    document.getElementById('collectionCount').textContent = collectionCount;
    document.getElementById('wishlistCount').textContent = wishlistCount;
    
    // Update section header based on active sub-view
    const collectionHeader = document.getElementById('collectionHeader');
    if (collectionHeader) {
        if (currentCollectionSubview === 'wishlist') {
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
                format,
                edition,
                region,
                condition,
                notes
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
            }
        } catch (error) {
            console.error('Failed to create box set:', error);
            showToast('Failed to create box set', 'error');
        }
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
                        <img src="${movie.poster_path ? 'https://image.tmdb.org/t/p/w92' + movie.poster_path : '/placeholder.png'}" alt="${movie.title}">
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
            const movieData = await apiCall('get_or_create_movie', { tmdb_id: tmdbId });
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
                notes: ''
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
                <img src="${movie.poster_url || '/placeholder.png'}"
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

    function showCoverUpload(containerId) {
        currentContainerId = containerId;
        document.getElementById('coverCropModal').classList.add('active');
        // Reset state
        _cropImg = null;
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
            // Scale image to cover the canvas
            const scaleX = canvas.width  / img.width;
            const scaleY = canvas.height / img.height;
            _cropScale   = Math.max(scaleX, scaleY);
            _cropOffsetX = (canvas.width  - img.width  * _cropScale) / 2;
            _cropOffsetY = (canvas.height - img.height * _cropScale) / 2;
            document.getElementById('cropZoomSlider').value = 100;
            document.getElementById('cropSaveBtn').disabled = false;
            _drawCrop();
        };
        img.src = src;
    }

    function _drawCrop() {
        const canvas = document.getElementById('cropCanvas');
        const ctx    = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        if (_cropImg) {
            ctx.drawImage(_cropImg,
                _cropOffsetX, _cropOffsetY,
                _cropImg.width * _cropScale, _cropImg.height * _cropScale);
        }

        // Crop frame dimensions (2:3 poster ratio)
        const frameW = W * CROP_W_RATIO;
        const frameH = frameW * (3 / 2);
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
        const newScale = (val / 100) * Math.max(canvas.width / _cropImg.width,
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

    async function saveCroppedCover() {
        if (!_cropImg) return;
        const sourceCanvas = document.getElementById('cropCanvas');
        const W = sourceCanvas.width, H = sourceCanvas.height;

        const frameW = W * CROP_W_RATIO;
        const frameH = frameW * (3 / 2);
        const frameX = (W - frameW) / 2;
        const frameY = (H - frameH) / 2;

        // Build output canvas at a clean resolution
        const outW = 400, outH = 600;
        const out  = document.createElement('canvas');
        out.width  = outW;
        out.height = outH;
        const ctx  = out.getContext('2d');

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
                // Re-render box set modal cover if open
                if (document.getElementById('boxSetDetailsModal').classList.contains('active')) {
                    document.getElementById('boxSetCoverImg').src = result.url;
                    document.getElementById('boxSetCoverImg').style.display = '';
                    document.getElementById('boxSetCoverPlaceholder').style.display = 'none';
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

            container.innerHTML = boxSetsWithMovies.map(boxSet => {
                // Thumbnail: custom cover > movie poster grid > color placeholder
                const posterMovies = boxSet.movies.slice(0, 4);
                const hasCustomCover = boxSet.spine_image_type === 'custom' && boxSet.spine_image_url;
                const hasPosters = posterMovies.length > 0;

                const thumbnail = hasCustomCover
                    ? `<img src="${boxSet.spine_image_url}" alt="${boxSet.name}" style="width:120px;height:160px;flex-shrink:0;border-radius:8px;object-fit:cover;">`
                    : hasPosters
                    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;width:120px;height:160px;flex-shrink:0;background:rgba(0,0,0,0.3);border-radius:8px;overflow:hidden;">
                            ${posterMovies.map(movie => `
                                <div style="position:relative;overflow:hidden;background:rgba(0,0,0,0.5);">
                                    <img src="${movie.poster_url || '/placeholder.png'}" alt="${movie.title}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">
                                </div>`).join('')}
                            ${posterMovies.length < 4 ? Array(4 - posterMovies.length).fill('<div style="background:rgba(0,0,0,0.3);"></div>').join('') : ''}
                        </div>`
                    : `<div style="width:120px;height:160px;flex-shrink:0;background:${boxSet.spine_color||'#667eea'};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>`;

                return `
                    <div class="box-set-card" onclick="App.showBoxSetDetails(${boxSet.id})">
                        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                            ${thumbnail}
                            <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                                <div>
                                    <h3 style="margin: 0 0 0.5rem 0;">${boxSet.name}</h3>
                                    <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">
                                        ${boxSet.format || 'Box Set'} ${boxSet.edition ? `• ${boxSet.edition}` : ''}
                                    </div>
                                </div>
                                <div style="display: flex; gap: 1.5rem; margin-top: 1rem;">
                                    <div class="box-set-stat">
                                        <strong>${boxSet.total_movies || 0}</strong>
                                        <span>Movie${boxSet.total_movies !== 1 ? 's' : ''}</span>
                                    </div>
                                    ${boxSet.spine_color ? `
                                        <div class="box-set-stat">
                                            <div style="width: 20px; height: 20px; background: ${boxSet.spine_color}; border-radius: 4px; margin: 0 auto;"></div>
                                            <span style="font-size: 0.75rem;">Spine</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load box sets:', error);
            showToast('Failed to load box sets', 'error');
        }
    }

    // Show box set details modal
    async function showBoxSetDetails(containerId) {
        try {
            console.log('[Box Set Details] Fetching container ID:', containerId);
            const data = await apiCall('get_container_contents', { container_id: containerId });
            console.log('[Box Set Details] API response:', data);

            const { container, movies } = data;
            console.log('[Box Set Details] Container:', container);
            console.log('[Box Set Details] Movies:', movies);
            console.log('[Box Set Details] FULL MOVIE DATA:', movies.map(m => ({
                content_id: m.content_id,
                container_id: m.container_id,
                cc_copy_id: m.cc_copy_id,
                copy_id: m.copy_id,
                c_movie_id: m.c_movie_id,
                movie_id: m.movie_id,
                tmdb_id: m.tmdb_id,
                title: m.title
            })));

            if (!container) {
                showToast('Box set not found', 'error');
                return;
            }

            currentContainerId = containerId;
            currentContainer = container; // Store full container data for editing

            // Update modal title and info
            document.getElementById('boxSetDetailsTitle').textContent = container.name;
            document.getElementById('boxSetName').textContent = container.name;
            document.getElementById('boxSetFormatDisplay').textContent = `${container.format || 'Box Set'}${container.edition ? ` • ${container.edition}` : ''}`;
            document.getElementById('boxSetStats').innerHTML = `
                ${container.spine_label ? `<div><strong>Spine Label:</strong> ${container.spine_label}</div>` : ''}
                ${container.condition ? `<div><strong>Condition:</strong> ${container.condition}</div>` : ''}
            `;

            // Cover image
            const coverImg = document.getElementById('boxSetCoverImg');
            const coverPlaceholder = document.getElementById('boxSetCoverPlaceholder');
            if (container.spine_image_type === 'custom' && container.spine_image_url) {
                coverImg.src = container.spine_image_url;
                coverImg.style.display = '';
                coverPlaceholder.style.display = 'none';
            } else {
                coverImg.style.display = 'none';
                coverPlaceholder.style.display = '';
                coverPlaceholder.style.background = container.spine_color || '#667eea';
            }
            // Wire up the change-cover button
            const coverBtn = document.getElementById('boxSetChangeCoverBtn');
            if (coverBtn) {
                coverBtn.onclick = () => {
                    _initCropCanvasEvents();
                    showCoverUpload(containerId);
                };
            }

            // Update movie count badge
            document.getElementById('movieCount').textContent = movies ? movies.length : 0;

            // Render movies list (use boxSetDetailsMoviesList to avoid collision with creation panel)
            const moviesList = document.getElementById('boxSetDetailsMoviesList');
            if (!movies || movies.length === 0) {
                moviesList.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center;">No movies in this box set yet.</p>';
            } else {
                console.log('[Box Set Details] Rendering movies:', movies.map(m => ({
                    title: m.title || m.display_title,
                    poster: m.poster_url,
                    year: m.year
                })));

                moviesList.innerHTML = movies.map(movie => `
                    <div class="box-set-movie-item">
                        ${movie.poster_url ? `
                            <img src="${movie.poster_url}"
                                 alt="${movie.display_title || movie.title}"
                                 class="box-set-movie-poster"
                                 onerror="this.style.display='none'; this.parentElement.classList.add('no-poster')">
                        ` : `
                            <div class="box-set-movie-poster" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 2rem;">
                                🎬
                            </div>
                        `}
                        <div class="box-set-movie-info">
                            <h5>${movie.display_title || movie.title}</h5>
                            <p>${movie.year || 'N/A'}${movie.director ? ` • ${movie.director}` : ''}</p>
                            ${movie.disc_label ? `<p style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">Disc: ${movie.disc_label}</p>` : ''}
                        </div>
                        <div class="box-set-movie-actions">
                            ${!movie.is_present ? '<span style="color: #ff6b6b; font-size: 0.85rem;">Missing</span>' : ''}
                        </div>
                    </div>
                `).join('');
            }

            // Show modal
            document.getElementById('boxSetDetailsModal').classList.add('active');
        } catch (error) {
            console.error('Failed to load box set details:', error);
            showToast('Failed to load box set details', 'error');
        }
    }

    // Close box set details modal
    function closeBoxSetDetails() {
        document.getElementById('boxSetDetailsModal').classList.remove('active');

        // DON'T clear currentContainerId if we're in the middle of box set creation
        // (Check if boxSetStep2 is visible, which means we're adding movies)
        const step2 = document.getElementById('boxSetStep2');
        const isCreating = step2 && step2.style.display !== 'none';

        if (!isCreating) {
            // Only clear if we're NOT in creation mode
            currentContainerId = null;
            currentContainer = null;
        }
    }

    // Show create box set modal (redirect to add tab)
    function showCreateBoxSetModal() {
        switchTab('add');
        showAddBoxSet();
    }

    // Edit box set - opens interface to continue adding movies
    async function editBoxSet() {
        if (!currentContainerId || !currentContainer) return;

        // Close the details modal
        document.getElementById('boxSetDetailsModal').classList.remove('active');

        // Switch to Add tab
        switchTab('add');

        // Show box set section
        document.getElementById('addTypeChoice').style.display = 'none';
        document.getElementById('addSingleMovieSection').style.display = 'none';
        document.getElementById('addBoxSetSection').style.display = 'block';

        // Show Step 2 (adding movies)
        document.getElementById('boxSetStep1').style.display = 'none';
        document.getElementById('boxSetStep2').style.display = 'block';

        // Fetch current movies in this box set
        try {
            const data = await apiCall('get_container_contents', { container_id: currentContainerId });
            const { movies } = data;

            // Populate boxSetMovies with existing movies
            boxSetMovies = movies.map((m, index) => ({
                movie_id: m.movie_id,
                title: m.title,
                year: m.year,
                poster_url: m.poster_url,
                tmdb_id: m.tmdb_id,
                copy_id: m.copy_id,
                disc_number: m.disc_number || (index + 1)
            }));

            // Update UI
            const createdNameEl = document.getElementById('boxSetCreatedName');
            if (createdNameEl) {
                createdNameEl.textContent = `📦 ${currentContainer.name} (Editing)`;
            }

            // Clear search
            const searchInput = document.getElementById('boxSetMovieSearch');
            const searchResults = document.getElementById('boxSetSearchResults');
            if (searchInput) searchInput.value = '';
            if (searchResults) searchResults.innerHTML = '';

            // Update the movie list
            updateBoxSetMoviesList();

            showToast(`Continue adding movies to "${currentContainer.name}"`, 'info');
        } catch (error) {
            console.error('Failed to load box set for editing:', error);
            showToast('Failed to open box set for editing', 'error');
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

        await loadShelves();
    }

    // ----------------------------------------
    // END SHELF SETUP WIZARD
    // ----------------------------------------

    let currentShelf = null;
    let assignCopyId = null;
    let unassignedMovies = [];
    let filteredUnassignedMovies = []; // Track filtered results for "Select All"
    let selectedCopyIds = new Set();
    let shelfView = 'list';
    let unassignedFilter = {
        search: '',
        sort: 'title',
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
            if (emptyState) emptyState.style.display = 'block';
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
                const uniqueId = movie.is_container ? `container_${movie.container_id}` : `movie_${movie.movie_id}`;

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

                                return `
                                    <div class="movie-spine ${movie.is_container ? 'container-spine' : ''}"
                                         style="background: ${movie.is_container ? (movie.container_spine_color || '#764ba2') : (shelf.color || '#667eea')}"
                                         title="${icon}${title}${year}"
                                         onclick="App.viewShelfContents(${shelf.id})">
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

            // Reload and re-render based on current view
            await loadShelves();
            if (shelfView === 'visual') {
                await renderShelvesVisual();
            }
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

            // Reload and re-render based on current view
            await loadShelves();
            if (shelfView === 'visual') {
                await renderShelvesVisual();
            }
        } catch (error) {
            console.error('Failed to delete shelf:', error);
            showToast('Failed to delete shelf', 'error');
        }
    }

    async function viewShelfContents(shelfId) {
        const shelf = shelves.find(s => s.id === shelfId);
        if (!shelf) return;

        currentShelf = shelf;

        try {
            const contents = await apiCall('get_shelf_contents', { shelf_id: shelfId });

            document.getElementById('shelfContentsTitle').textContent = `📚 ${shelf.name}`;

            const container = document.getElementById('shelfContentsList');
            const emptyState = document.getElementById('emptyShelfContents');

            if (!contents || contents.length === 0) {
                container.innerHTML = '';
                if (emptyState) emptyState.style.display = 'block';
            } else {
                if (emptyState) emptyState.style.display = 'none';

                container.innerHTML = contents.map(item => {
                    // Handle both containers (box sets) and regular movies
                    const isContainer = item.is_container === 1 || item.is_container === true;

                    if (isContainer) {
                        // Render container/box set
                        return `
                            <div class="shelf-movie-card container-card" onclick="App.showBoxSetDetails(${item.container_id})">
                                <div class="container-poster" style="background: ${item.container_spine_color || '#667eea'}; display: flex; align-items: center; justify-content: center; font-size: 3rem;">
                                    📦
                                </div>
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
                        // Render regular movie
                        return `
                            <div class="shelf-movie-card">
                                <img src="${item.poster_url || '/placeholder.png'}"
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

            document.getElementById('shelfContentsModal').classList.add('active');
        } catch (error) {
            console.error('Failed to load shelf contents:', error);
            showToast('Failed to load shelf contents', 'error');
        }
    }

    function closeShelfContents() {
        document.getElementById('shelfContentsModal').classList.remove('active');
        currentShelf = null;
    }

    async function removeFromShelf(copyId) {
        if (!confirm('Remove this movie from the shelf?')) {
            return;
        }

        try {
            await apiCall('remove_from_shelf', { copy_id: copyId });
            showToast('Movie removed from shelf', 'success');

            // Reload shelf contents and shelf list
            if (currentShelf) {
                viewShelfContents(currentShelf.id);
            }
            loadShelves();
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

            // Reload shelf contents and shelf list
            if (currentShelf) {
                viewShelfContents(currentShelf.id);
            }
            loadShelves();
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
                    // Render box set / container
                    return `
                        <div class="unassigned-movie-card ${isSelected ? 'selected' : ''} container-card" data-item-id="${itemId}">
                            <input type="checkbox"
                                   class="movie-checkbox"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="App.toggleMovieSelection('${itemId}')"
                                   onclick="event.stopPropagation()">
                            <div class="container-poster" style="background: ${item.spine_color || '#667eea'}; display: flex; align-items: center; justify-content: center; font-size: 3rem;"
                                 onclick="App.toggleMovieSelection('${itemId}')">
                                📦
                            </div>
                            <div class="unassigned-movie-info" onclick="App.toggleMovieSelection('${itemId}')">
                                <h4>${item.name}</h4>
                                <p style="color: rgba(255,255,255,0.8);">${item.movie_count} movie${item.movie_count !== 1 ? 's' : ''}</p>
                                <div class="unassigned-movie-format">${item.format || 'Box Set'}</div>
                            </div>
                        </div>
                    `;
                } else {
                    // Render regular movie copy
                    return `
                        <div class="unassigned-movie-card ${isSelected ? 'selected' : ''}" data-item-id="${itemId}">
                            <input type="checkbox"
                                   class="movie-checkbox"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="App.toggleMovieSelection(${item.copy_id})"
                                   onclick="event.stopPropagation()">
                            <img src="${item.poster_url || '/placeholder.png'}"
                                 alt="${item.title}"
                                 class="unassigned-movie-poster"
                                 onclick="App.toggleMovieSelection(${item.copy_id})">
                            <div class="unassigned-movie-info" onclick="App.toggleMovieSelection(${item.copy_id})">
                                <h4>${item.display_title || item.title}</h4>
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
                director: 'all',
                genre: 'all',
                studio: 'all'
            };

            // Reset filter UI controls
            const searchInput = document.getElementById('unassignedSearch');
            if (searchInput) searchInput.value = '';

            const sortSelect = document.getElementById('unassignedSortFilter');
            if (sortSelect) sortSelect.value = 'title';

            const directorSelect = document.getElementById('unassignedDirectorFilter');
            if (directorSelect) directorSelect.value = 'all';

            const genreSelect = document.getElementById('unassignedGenreFilter');
            if (genreSelect) genreSelect.value = 'all';

            const studioSelect = document.getElementById('unassignedStudioFilter');
            if (studioSelect) studioSelect.value = 'all';

            renderUnassignedMovies();

            // Reload shelves to update counts
            await loadShelves();
            if (shelfView === 'visual') {
                await renderShelvesVisual();
            }
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
    openMovieWithNav,
    showCoverUpload,
    closeCoverCrop,
    onCoverFileChange,
    cropZoom,
    saveCroppedCover,
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
    filterByShelf,
    lookupByImdbId,
    // Box Set functions (v2.3.0)
    showAddTypeChoice,
    showAddSingleMovie,
    showAddBoxSet,
    createBoxSetAndAddMovies,
    searchMoviesForBoxSet,
    addMovieToBoxSet,
    removeMovieFromBoxSet,
    finishBoxSetCreation,
    viewBoxSetDetails,
    updateBoxSetSpinePreview,
    loadBoxSets,
    showBoxSetDetails,
    loadShelfViewBrowse,
    shelfViewDrillIn,
    shelfViewBack,
    shelfViewGoTo,
    viewMovieDetailsWithNav,
    shelfMovieNav,
    closeBoxSetDetails,
    showCreateBoxSetModal,
    editBoxSet,
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
    toggleShelfChildren,
    viewShelfContents,
    closeShelfContents,
    removeFromShelf,
    removeContainerFromShelf,
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
    onUnassignedFilterChange
};

})();

// Note: App.init() is now called by the script loader in index.html
// after all scripts have finished loading