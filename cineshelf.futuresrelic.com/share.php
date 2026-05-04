<?php
/**
 * CineShelf — Public Collection Viewer
 * URL pattern: /share/{handle}
 *
 * Reads the handle from the URL path (via rewrite) or from ?u= query param.
 * No authentication required.
 */

// Get handle from URL
$handle = '';
$pathInfo = $_SERVER['PATH_INFO'] ?? '';
if ($pathInfo) {
    $handle = strtolower(trim(ltrim($pathInfo, '/'), '/'));
}
if (!$handle && isset($_GET['u'])) {
    $handle = strtolower(trim($_GET['u']));
}
// Sanitize
$handle = preg_replace('/[^a-z0-9\-]/', '', $handle);

if (!$handle) {
    http_response_code(404);
    die('<h1>Not found</h1>');
}
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>CineShelf — <?= htmlspecialchars($handle) ?>'s Collection</title>
    <meta name="theme-color" content="#667eea">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --purple: #667eea;
            --bg: #0a0a12;
            --bg2: #12121f;
            --card: #1a1a2e;
            --border: rgba(102,126,234,0.18);
            --text: #f1f1f5;
            --muted: #8888aa;
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

        /* Header */
        header {
            background: var(--bg2);
            border-bottom: 1px solid var(--border);
            padding: 1rem 1.5rem;
            display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
        }
        .header-left { display: flex; align-items: center; gap: 0.75rem; }
        .logo { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--text); font-weight: 700; }
        .logo img { width: 28px; height: 28px; border-radius: 6px; }
        .owner-name { font-size: 0.9rem; color: var(--muted); }
        .owner-name strong { color: var(--text); }
        .header-right { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .pill {
            background: rgba(102,126,234,0.15); border: 1px solid var(--border);
            border-radius: 100px; padding: 0.25rem 0.75rem;
            font-size: 0.78rem; color: #a8b8ff; font-weight: 600;
        }
        .btn-cta {
            background: var(--purple); color: #fff;
            padding: 0.45rem 1rem; border-radius: 8px;
            text-decoration: none; font-weight: 600; font-size: 0.85rem;
            transition: background 0.2s;
        }
        .btn-cta:hover { background: #5568d3; }

        /* Controls */
        .controls {
            position: sticky; top: 0; z-index: 10;
            background: rgba(10,10,18,0.92); backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 1.5rem;
            display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
        }
        .search-input {
            flex: 1; min-width: 180px;
            background: var(--card); border: 1px solid var(--border);
            border-radius: 8px; padding: 0.5rem 0.85rem;
            color: var(--text); font-size: 0.9rem; outline: none;
        }
        .search-input:focus { border-color: var(--purple); }
        .sort-select {
            background: var(--card); border: 1px solid var(--border);
            border-radius: 8px; padding: 0.5rem 0.75rem;
            color: var(--text); font-size: 0.85rem; outline: none; cursor: pointer;
        }
        .view-btns { display: flex; gap: 0.25rem; }
        .view-btn {
            background: var(--card); border: 1px solid var(--border);
            border-radius: 6px; padding: 0.4rem 0.6rem;
            color: var(--muted); font-size: 0.95rem; cursor: pointer;
            transition: all 0.15s;
        }
        .view-btn.active, .view-btn:hover { background: rgba(102,126,234,0.2); color: var(--text); border-color: var(--purple); }
        .count-label { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }

        /* Grid */
        #grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 0.6rem;
            padding: 1.25rem 1.5rem;
        }
        #grid.view-list {
            grid-template-columns: 1fr;
            max-width: 900px; margin: 0 auto;
        }
        #grid.view-gallery {
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 0.3rem; padding: 0.5rem;
        }

        /* Card */
        .card {
            position: relative;
            border-radius: 8px; overflow: hidden;
            background: var(--card);
            border: 1px solid var(--border);
            cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
        }
        .card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; background: #1a1a2e; }
        .card-info { padding: 0.5rem 0.6rem 0.6rem; }
        .card-title { font-size: 0.8rem; font-weight: 600; line-height: 1.3; margin-bottom: 0.2rem; }
        .card-meta { font-size: 0.72rem; color: var(--muted); }
        .format-badge {
            position: absolute; top: 0.3rem; right: 0.3rem;
            background: rgba(0,0,0,0.75); border-radius: 4px;
            padding: 1px 5px; font-size: 0.65rem; font-weight: 700; color: #fff;
        }
        /* Gallery — hide info */
        .view-gallery .card-info { display: none; }
        .view-gallery .format-badge { display: none; }

        /* List view */
        .view-list .card {
            display: flex; align-items: center; gap: 0.75rem;
            border-radius: 8px; padding: 0.5rem 0.75rem;
        }
        .view-list .card img { width: 40px; height: 60px; border-radius: 4px; flex-shrink: 0; aspect-ratio: unset; }
        .view-list .card-info { flex: 1; padding: 0; }
        .view-list .card-title { font-size: 0.9rem; }
        .view-list .format-badge { position: static; background: rgba(102,126,234,0.2); color: #a8b8ff; border-radius: 4px; padding: 1px 6px; font-size: 0.7rem; display: inline-block; margin-top: 0.2rem; }

        /* Loading / empty */
        .state { text-align: center; padding: 5rem 2rem; color: var(--muted); }
        .state-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
        .state h2 { font-size: 1.3rem; margin-bottom: 0.5rem; color: var(--text); }

        /* Detail modal */
        .modal-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.75); z-index: 100;
            align-items: center; justify-content: center; padding: 1rem;
        }
        .modal-overlay.open { display: flex; }
        .modal {
            background: var(--bg2); border: 1px solid var(--border);
            border-radius: 16px; width: 100%; max-width: 480px;
            max-height: 90vh; overflow-y: auto;
        }
        .modal-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1.25rem 1.5rem 0;
        }
        .modal-header h2 { font-size: 1.1rem; }
        .modal-close { background: none; border: none; color: var(--muted); font-size: 1.4rem; cursor: pointer; line-height: 1; }
        .modal-body { padding: 1rem 1.5rem 1.5rem; }
        .modal-poster { width: 100%; max-width: 180px; border-radius: 8px; margin: 0 auto 1rem; display: block; aspect-ratio: 2/3; object-fit: cover; }
        .detail-row { display: flex; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.85rem; }
        .detail-label { color: var(--muted); min-width: 80px; }
        .detail-value { color: var(--text); font-weight: 500; }
        .copies-list { margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem; }
        .copy-item { background: var(--card); border-radius: 8px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; font-size: 0.82rem; }
        .copy-format { font-weight: 700; margin-bottom: 0.2rem; }
        .copy-details { color: var(--muted); }

        @media (max-width: 480px) {
            header { flex-direction: column; align-items: flex-start; }
            #grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); padding: 0.75rem; }
        }
    </style>
</head>
<body>

<header>
    <div class="header-left">
        <a href="/about" class="logo">
            <img src="/app-icon-192.png" alt="CineShelf">
            <span>CineShelf</span>
        </a>
        <div class="owner-name"><strong id="ownerName">…</strong>'s Collection</div>
    </div>
    <div class="header-right">
        <span class="pill" id="countPill">Loading…</span>
        <a href="/" class="btn-cta">Manage My Collection →</a>
    </div>
</header>

<div class="controls">
    <input type="search" class="search-input" id="searchInput" placeholder="Search collection…" oninput="applyFilters()">
    <select class="sort-select" id="sortSelect" onchange="applyFilters()">
        <option value="title">A → Z</option>
        <option value="year_desc">Newest first</option>
        <option value="year_asc">Oldest first</option>
        <option value="rating">Top rated</option>
    </select>
    <div class="view-btns">
        <button class="view-btn active" onclick="setView('grid', this)" title="Grid">▦</button>
        <button class="view-btn" onclick="setView('gallery', this)" title="Gallery">⊞</button>
        <button class="view-btn" onclick="setView('list', this)" title="List">☰</button>
    </div>
    <span class="count-label" id="filterCount"></span>
</div>

<div id="grid"></div>
<div id="stateEl" class="state" style="display:none"></div>

<!-- Detail modal -->
<div class="modal-overlay" id="detailModal" onclick="if(event.target===this) closeModal()">
    <div class="modal">
        <div class="modal-header">
            <h2 id="modalTitle"></h2>
            <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
    </div>
</div>

<script>
const HANDLE = <?= json_encode($handle) ?>;
let allItems = [];
let currentView = 'grid';

async function loadCollection() {
    showState('spinner', '⏳', 'Loading collection…');
    try {
        const res = await fetch('/api/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_public_collection', handle: HANDLE })
        });
        const json = await res.json();
        if (!json.ok) {
            showState('error', '🔒', json.error || 'Collection not found', 'This collection may be private or the link may be incorrect.');
            return;
        }
        allItems = json.collection;
        document.getElementById('ownerName').textContent = json.owner;
        document.getElementById('countPill').textContent = json.total + ' films';
        document.title = `${json.owner}'s Collection — CineShelf`;
        // Set open graph meta dynamically for bots: can't do this in JS, but the PHP head is fine for sharing
        applyFilters();
    } catch (e) {
        showState('error', '⚠️', 'Could not load collection', 'Check your connection and try again.');
    }
}

function showState(type, icon, title, sub) {
    const el = document.getElementById('stateEl');
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    el.style.display = 'block';
    el.innerHTML = `<span class="state-icon">${icon}</span><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}`;
}

function applyFilters() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const sort = document.getElementById('sortSelect').value;

    let items = allItems.filter(m => {
        if (!q) return true;
        return (m.title || '').toLowerCase().includes(q)
            || (m.director || '').toLowerCase().includes(q)
            || (m.genre || '').toLowerCase().includes(q);
    });

    items = [...items].sort((a, b) => {
        if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
        if (sort === 'year_desc') return (b.year || 0) - (a.year || 0);
        if (sort === 'year_asc') return (a.year || 0) - (b.year || 0);
        if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
        return 0;
    });

    renderGrid(items);
    document.getElementById('filterCount').textContent =
        items.length !== allItems.length ? `${items.length} of ${allItems.length}` : '';
}

function formatBadge(copies) {
    if (!copies || !copies.length) return '';
    const fmts = [...new Set(copies.map(c => c.format).filter(Boolean))];
    if (!fmts.length) return '';
    const short = { 'Blu-ray': 'BD', '4K UHD': '4K', 'DVD': 'DVD', 'VHS': 'VHS', 'LaserDisc': 'LD', 'Digital': 'DIG', '4K Ultra HD': '4K', 'Betamax': 'BX', 'HD-DVD': 'HD' };
    return fmts.map(f => short[f] || f.substring(0, 4)).join(' · ');
}

function renderGrid(items) {
    const grid = document.getElementById('grid');
    const stateEl = document.getElementById('stateEl');
    stateEl.style.display = 'none';

    if (!items.length) {
        showState('empty', '🎬', 'No films found', 'Try a different search term.');
        return;
    }

    grid.innerHTML = items.map((m, i) => {
        const poster = m.poster_url || '';
        const badge = formatBadge(m.copies);
        const title = (m.title || 'Unknown').replace(/</g, '&lt;');
        return `<div class="card" onclick="openDetail(${allItems.indexOf(m)})">
            <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='/app-icon.png'">
            ${badge ? `<span class="format-badge">${badge}</span>` : ''}
            <div class="card-info">
                <div class="card-title">${title}</div>
                <div class="card-meta">${m.year || ''}</div>
            </div>
        </div>`;
    }).join('');
}

function setView(view, btn) {
    currentView = view;
    document.getElementById('grid').className = view === 'grid' ? '' : `view-${view}`;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function openDetail(idx) {
    const m = allItems[idx];
    if (!m) return;
    document.getElementById('modalTitle').textContent = m.title || 'Unknown';

    const copies = m.copies || [];
    const copiesHtml = copies.map(c => {
        const extras = [
            c.has_slipcover ? 'Slipcover' : '',
            c.has_booklet ? 'Booklet' : '',
            c.has_bonus_disc ? `${c.bonus_disc_count > 1 ? c.bonus_disc_count + '× ' : ''}Bonus Disc` : '',
            c.has_digital_copy ? 'Digital Copy' : '',
            c.has_3d ? '3D' : '',
        ].filter(Boolean).join(', ');
        return `<div class="copy-item">
            <div class="copy-format">${c.format || '?'}${c.edition ? ' — ' + c.edition : ''}</div>
            <div class="copy-details">
                ${c.package_type ? c.package_type : ''}
                ${c.edition_publisher ? ' · ' + c.edition_publisher : ''}
                ${extras ? '<br>' + extras : ''}
            </div>
        </div>`;
    }).join('');

    document.getElementById('modalBody').innerHTML = `
        ${m.poster_url ? `<img class="modal-poster" src="${m.poster_url}" alt="${(m.title||'').replace(/</g,'&lt;')}">` : ''}
        <div class="detail-row"><span class="detail-label">Year</span><span class="detail-value">${m.year || '—'}</span></div>
        ${m.director ? `<div class="detail-row"><span class="detail-label">Director</span><span class="detail-value">${m.director}</span></div>` : ''}
        ${m.genre ? `<div class="detail-row"><span class="detail-label">Genre</span><span class="detail-value">${m.genre}</span></div>` : ''}
        ${m.rating ? `<div class="detail-row"><span class="detail-label">Rating</span><span class="detail-value">⭐ ${parseFloat(m.rating).toFixed(1)}</span></div>` : ''}
        ${m.certification ? `<div class="detail-row"><span class="detail-label">Rated</span><span class="detail-value">${m.certification}</span></div>` : ''}
        ${copies.length ? `<div class="copies-list"><strong style="font-size:0.85rem;">${copies.length} copy in collection</strong>${copiesHtml}</div>` : ''}
    `;
    document.getElementById('detailModal').classList.add('open');
}

function closeModal() {
    document.getElementById('detailModal').classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

loadCollection();
</script>
</body>
</html>
