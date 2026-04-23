# Task: Add Crop Tool to CineShelf Icon Manager

## Context

CineShelf is a PHP 8.1 + SQLite3 single-file SPA located at
`cineshelf.futuresrelic.com/`. The admin panel lives at `/admin/`.

The icon manager is at **`admin/icon-manager.html`** — a self-contained
vanilla-JS page that uses HTML5 Canvas to upload, adjust, and save app
icons and favicons. It already works end-to-end except for one missing
feature: **image cropping**.

Your job is to add a crop tool to that page. Everything else (upload,
color/filter adjustments, multi-size preview, save to server) already
works — do not break it.

---

## What already exists

### Frontend — `admin/icon-manager.html`

Single HTML file, no build step, no npm, no framework. Vanilla JS only.

**Upload:** drag-and-drop + click-to-browse via `FileReader`. Loaded image
is drawn onto a `<canvas id="mainCanvas">` (512×512).

**Color/effect controls:** range inputs wired to a `redrawCanvas()` function
that uses CSS filter strings: `brightness()`, `contrast()`, `saturate()`,
`hue-rotate()`, `blur()`, `grayscale()`, `sepia()`, `invert()`, plus a
background color fill and padding/corner-radius mask.

**Previews:** three `<canvas>` elements at 16, 192, and 512px that re-render
from mainCanvas on every change.

**Save to server:** `fetch('/api/api.php', { method:'POST', body: FormData })`
with `action=save_icon`, `type=favicon|app`, `data=<base64 PNG>`,
`target=main|admin`. The PHP handler writes the file to disk.

**Download:** `canvas.toDataURL('image/png')` → `<a download>` click.

### Backend — `api/api.php` (action `save_icon`)

Accepts POST with fields:
- `action` = `"save_icon"`
- `type` = `"favicon"` → writes `/favicon.png` and `/favicon.ico`
- `type` = `"app"`, `target` = `"main"` → writes `/app-icon.png` + `/app-icon-192.png`
- `type` = `"app"`, `target` = `"admin"` → writes `/admin/admin-icon.png` etc.
- `data` = base64-encoded PNG (the `data:image/png;base64,` prefix must be
  stripped before `base64_decode`)

No changes needed to the PHP backend.

---

## What you need to build

### Crop tool — requirements

1. After uploading an image, the user can enter **Crop Mode**.
2. In Crop Mode, the original image is shown at a comfortable display size
   (not the 512×512 output canvas — a separate display canvas or `<img>`).
3. The user drags a **resizable rectangular selection** over the image.
4. A real-time **crop preview** (small, ~120×120) shows what the cropped
   region will look like.
5. An **"Apply Crop"** button extracts the selected region, scales it to
   512×512 on `mainCanvas`, and exits Crop Mode.
6. A **"Cancel"** button exits Crop Mode without changing anything.
7. The crop selection should maintain a **1:1 aspect ratio** (square) since
   all output icons are square — lock it so the selection is always square.

### UI placement

Add a **"✂ Crop"** button next to the existing upload controls (near the
top of the page, before the adjustment sliders). It only appears after an
image is loaded.

---

## Implementation guide

### Step 1 — Read the file first

```
Read: admin/icon-manager.html
```

Understand the existing structure before touching anything. Key things to
locate:
- Where `loadedImage` (or equivalent) is stored after upload
- The `redrawCanvas()` function signature
- The existing button/control layout so you place the crop button sensibly

### Step 2 — Add the Crop Mode overlay HTML

Add inside `<body>`, hidden by default:

```html
<!-- Crop overlay (hidden until crop mode activated) -->
<div id="cropOverlay" style="display:none; position:fixed; inset:0;
     background:rgba(0,0,0,0.82); z-index:1000; align-items:center;
     justify-content:center; flex-direction:column; gap:1rem;">

  <div style="color:#fff; font-size:1rem; opacity:0.7;">
    Drag to select · Square crop · Scroll to zoom
  </div>

  <div style="position:relative; display:inline-block;">
    <!-- Source image drawn here for selection -->
    <canvas id="cropSourceCanvas"></canvas>
    <!-- Selection rectangle drawn on top -->
    <canvas id="cropSelCanvas" style="position:absolute;top:0;left:0;
         cursor:crosshair;"></canvas>
  </div>

  <div style="display:flex; gap:0.5rem; align-items:center;">
    <canvas id="cropPreview" width="120" height="120"
            style="border:2px solid #fff; border-radius:8px;"></canvas>
    <div style="display:flex; flex-direction:column; gap:0.5rem;">
      <button id="cropApplyBtn" style="padding:0.6rem 1.4rem;
              background:#6c63ff; color:#fff; border:none;
              border-radius:8px; cursor:pointer; font-size:0.95rem;">
        ✓ Apply Crop
      </button>
      <button id="cropCancelBtn" style="padding:0.6rem 1.4rem;
              background:rgba(255,255,255,0.12); color:#fff; border:none;
              border-radius:8px; cursor:pointer; font-size:0.95rem;">
        ✕ Cancel
      </button>
    </div>
  </div>
</div>
```

### Step 3 — Add the "✂ Crop" button

Find the upload controls section and add:

```html
<button id="openCropBtn" onclick="openCropMode()"
        style="display:none; /* shown after image loads */">
  ✂ Crop
</button>
```

Show it when an image loads: after the existing image-load handler sets up
mainCanvas, add `document.getElementById('openCropBtn').style.display = ''`.

### Step 4 — Crop Mode JavaScript

Add a `<script>` block (or append to the existing one) with this logic:

```js
// ── Crop tool ────────────────────────────────────────────────────────
let _cropSourceImage = null; // ImageBitmap or HTMLImageElement
let _cropDispScale = 1;      // display scale (source → cropSourceCanvas)

// Selection state
let _sel = { x:0, y:0, size:0 };  // in SOURCE image coords
let _drag = null;                   // { startX, startY, origSel }
let _handle = null;                 // which resize handle is active

function openCropMode() {
    // Grab the current mainCanvas content as the source
    const overlay = document.getElementById('cropOverlay');
    const srcCanvas = document.getElementById('cropSourceCanvas');
    const selCanvas = document.getElementById('cropSelCanvas');

    // Use the original loaded image if available, else mainCanvas
    const src = window._originalLoadedImage || document.getElementById('mainCanvas');

    // Fit source into ~600px display
    const maxDisplay = Math.min(window.innerWidth - 280, window.innerHeight - 200, 600);
    const srcW = src.naturalWidth || src.width;
    const srcH = src.naturalHeight || src.height;
    _cropDispScale = maxDisplay / Math.max(srcW, srcH);

    const dispW = Math.round(srcW * _cropDispScale);
    const dispH = Math.round(srcH * _cropDispScale);

    srcCanvas.width  = dispW;
    srcCanvas.height = dispH;
    selCanvas.width  = dispW;
    selCanvas.height = dispH;

    // Draw source image
    const ctx = srcCanvas.getContext('2d');
    ctx.drawImage(src, 0, 0, dispW, dispH);

    // Initial selection: centred square, 80% of shorter side
    const initSize = Math.round(Math.min(srcW, srcH) * 0.8);
    _sel = {
        x: Math.round((srcW - initSize) / 2),
        y: Math.round((srcH - initSize) / 2),
        size: initSize
    };

    drawSelection();
    updateCropPreview();

    // Show overlay as flex
    overlay.style.display = 'flex';

    // Wire pointer events
    selCanvas.onmousedown  = onCropMouseDown;
    selCanvas.onmousemove  = onCropMouseMove;
    selCanvas.onmouseup    = onCropMouseUp;
    selCanvas.ontouchstart = e => { onCropMouseDown(e.touches[0]); e.preventDefault(); };
    selCanvas.ontouchmove  = e => { onCropMouseMove(e.touches[0]); e.preventDefault(); };
    selCanvas.ontouchend   = e => { onCropMouseUp();                e.preventDefault(); };
}

function closeCropMode() {
    document.getElementById('cropOverlay').style.display = 'none';
}

document.getElementById('cropCancelBtn').onclick = closeCropMode;
document.getElementById('cropApplyBtn').onclick  = applyCrop;

// ── Selection drawing ─────────────────────────────────────────────────
function drawSelection() {
    const selCanvas = document.getElementById('cropSelCanvas');
    const ctx = selCanvas.getContext('2d');
    ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);

    const dx = Math.round(_sel.x    * _cropDispScale);
    const dy = Math.round(_sel.y    * _cropDispScale);
    const ds = Math.round(_sel.size * _cropDispScale);

    // Darken outside selection
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, selCanvas.width, selCanvas.height);
    ctx.clearRect(dx, dy, ds, ds);

    // Selection border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(dx + 1, dy + 1, ds - 2, ds - 2);
    ctx.setLineDash([]);

    // Rule-of-thirds grid (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
        const t = Math.round(dx + (ds * i) / 3);
        ctx.beginPath(); ctx.moveTo(t, dy); ctx.lineTo(t, dy + ds); ctx.stroke();
        const u = Math.round(dy + (ds * i) / 3);
        ctx.beginPath(); ctx.moveTo(dx, u); ctx.lineTo(dx + ds, u); ctx.stroke();
    }

    // Corner handles
    const hs = 10;
    ctx.fillStyle = '#fff';
    [[dx,dy],[dx+ds-hs,dy],[dx,dy+ds-hs],[dx+ds-hs,dy+ds-hs]].forEach(([hx,hy]) => {
        ctx.fillRect(hx, hy, hs, hs);
    });
}

function updateCropPreview() {
    const src = window._originalLoadedImage || document.getElementById('mainCanvas');
    const prev = document.getElementById('cropPreview');
    const ctx = prev.getContext('2d');
    ctx.clearRect(0, 0, 120, 120);
    if (_sel.size > 0) {
        ctx.drawImage(src, _sel.x, _sel.y, _sel.size, _sel.size, 0, 0, 120, 120);
    }
}

// ── Drag / resize logic ────────────────────────────────────────────────
function _dispToSrc(v) { return v / _cropDispScale; }

function _hitTest(ex, ey) {
    // ex, ey in display coords
    const dx = _sel.x * _cropDispScale, dy = _sel.y * _cropDispScale;
    const ds = _sel.size * _cropDispScale;
    const hs = 14; // handle hit area
    const corners = [
        { name:'nw', x:dx,       y:dy       },
        { name:'ne', x:dx+ds-hs, y:dy       },
        { name:'sw', x:dx,       y:dy+ds-hs },
        { name:'se', x:dx+ds-hs, y:dy+ds-hs },
    ];
    for (const c of corners) {
        if (ex >= c.x && ex <= c.x+hs && ey >= c.y && ey <= c.y+hs) return c.name;
    }
    if (ex >= dx && ex <= dx+ds && ey >= dy && ey <= dy+ds) return 'move';
    return null;
}

function _evCoords(e) {
    const rect = document.getElementById('cropSelCanvas').getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onCropMouseDown(e) {
    const { x, y } = _evCoords(e);
    const hit = _hitTest(x, y);
    if (!hit) {
        // Start new selection
        _drag = { type:'new', startX: _dispToSrc(x), startY: _dispToSrc(y) };
    } else {
        _drag = { type: hit, startX: x, startY: y, origSel: { ..._sel } };
    }
}

function onCropMouseMove(e) {
    if (!_drag) return;
    const { x, y } = _evCoords(e);
    const selCanvas = document.getElementById('cropSelCanvas');
    const srcW = selCanvas.width  / _cropDispScale;
    const srcH = selCanvas.height / _cropDispScale;

    if (_drag.type === 'new') {
        const sx = _dispToSrc(x), sy = _dispToSrc(y);
        const rawSize = Math.max(Math.abs(sx - _drag.startX), Math.abs(sy - _drag.startY));
        const size = Math.max(20, rawSize);
        _sel = {
            x:    Math.max(0, Math.min(_drag.startX, _drag.startX - size + (sx > _drag.startX ? size : 0))),
            y:    Math.max(0, Math.min(_drag.startY, _drag.startY - size + (sy > _drag.startY ? size : 0))),
            size: size
        };
    } else if (_drag.type === 'move') {
        const dx = _dispToSrc(x - _drag.startX);
        const dy = _dispToSrc(y - _drag.startY);
        _sel = {
            x:    Math.max(0, Math.min(srcW - _drag.origSel.size, _drag.origSel.x + dx)),
            y:    Math.max(0, Math.min(srcH - _drag.origSel.size, _drag.origSel.y + dy)),
            size: _drag.origSel.size
        };
    } else {
        // Corner resize — keep selection square, anchor opposite corner
        const os = _drag.origSel;
        const newX = _dispToSrc(x), newY = _dispToSrc(y);
        let nx = os.x, ny = os.y, ns = os.size;
        if (_drag.type === 'se') {
            ns = Math.max(20, Math.max(newX - os.x, newY - os.y));
        } else if (_drag.type === 'nw') {
            ns = Math.max(20, Math.max((os.x + os.size) - newX, (os.y + os.size) - newY));
            nx = os.x + os.size - ns;
            ny = os.y + os.size - ns;
        } else if (_drag.type === 'ne') {
            ns = Math.max(20, Math.max(newX - os.x, (os.y + os.size) - newY));
            ny = os.y + os.size - ns;
        } else if (_drag.type === 'sw') {
            ns = Math.max(20, Math.max((os.x + os.size) - newX, newY - os.y));
            nx = os.x + os.size - ns;
        }
        _sel = { x: Math.max(0, nx), y: Math.max(0, ny), size: ns };
    }

    // Clamp to image bounds
    _sel.x    = Math.max(0, Math.min(srcW - _sel.size, _sel.x));
    _sel.y    = Math.max(0, Math.min(srcH - _sel.size, _sel.y));
    _sel.size = Math.min(_sel.size, srcW - _sel.x, srcH - _sel.y);

    drawSelection();
    updateCropPreview();
}

function onCropMouseUp() { _drag = null; }

// ── Apply crop to mainCanvas ───────────────────────────────────────────
function applyCrop() {
    const src = window._originalLoadedImage || document.getElementById('mainCanvas');
    const mainCanvas = document.getElementById('mainCanvas');
    const ctx = mainCanvas.getContext('2d');
    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    ctx.drawImage(src, _sel.x, _sel.y, _sel.size, _sel.size,
                  0, 0, mainCanvas.width, mainCanvas.height);
    // Store the cropped result as the new "original" for future crops
    createImageBitmap(mainCanvas).then(bmp => { window._originalLoadedImage = bmp; });
    closeCropMode();
    // Re-apply filters/effects if the page has a redraw function
    if (typeof redrawCanvas === 'function') redrawCanvas();
    else if (typeof updatePreviews === 'function') updatePreviews();
}
```

### Step 5 — Preserve the original image on upload

The crop tool needs access to the *unfiltered* original image (not the
filtered mainCanvas) so cropping doesn't compound filter artifacts.

Find where the file upload handler draws to mainCanvas and add:

```js
// After img.onload draws to mainCanvas, store original:
createImageBitmap(img).then(bmp => { window._originalLoadedImage = bmp; });
// Also show the crop button:
document.getElementById('openCropBtn').style.display = '';
```

If there's already a variable storing the loaded image (e.g. `loadedImage`,
`sourceImage`, `originalImg`) — use that instead of creating a new one.
Match the existing naming convention in the file.

---

## Key Canvas API patterns used throughout this file

```js
// Draw with filters
ctx.filter = 'brightness(1.2) contrast(1.1) saturate(0.9)';
ctx.drawImage(source, 0, 0, w, h);
ctx.filter = 'none';

// Rounded corner mask
ctx.beginPath();
ctx.roundRect(0, 0, w, h, cornerRadius);
ctx.clip();

// Export as base64 for server save
const base64 = canvas.toDataURL('image/png').split(',')[1];

// Scale down for preview sizes
const tmpCanvas = document.createElement('canvas');
tmpCanvas.width = targetSize; tmpCanvas.height = targetSize;
tmpCanvas.getContext('2d').drawImage(mainCanvas, 0, 0, targetSize, targetSize);
```

---

## What NOT to change

- The existing upload handler and `redrawCanvas()` / `updatePreviews()` pipeline
- The Save Favicon / Save App Icon / Download buttons and their fetch calls
- The color/filter slider UI
- The PHP backend (`api/api.php`) — no changes needed there

---

## Definition of done

1. A "✂ Crop" button appears after an image is uploaded
2. Clicking it opens the crop overlay with the source image at a comfortable size
3. A square selection box is visible with draggable corners and a move handle
4. A real-time 120×120 preview updates as the selection changes
5. "Apply Crop" writes the cropped region to mainCanvas at 512×512
6. "Cancel" closes the overlay with no changes
7. All existing functionality (filters, save, download, previews) still works
8. No new dependencies added — vanilla JS and Canvas only
