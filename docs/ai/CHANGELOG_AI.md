# CHANGELOG_AI — CineShelf

AI-made changes only. Human changes are in `/CHANGELOG.md`.

---

## 2026-02-27 (branch: claude/continue-cineshelf-setup-acofW)

### feat: persist wizard blocks as layout sections on save (v2.8.15)

**Goal B — save wizard blocks as layout_sections + new get_layout_sections action:**

1. `api/api.php` — block derivation pass: block items now include `container_id` so containers
   (box sets) can be matched back to their layout_entry during section linking.

2. `api/api.php` — `apply_recipe_as_new_layout` action:
   - Now accepts `blocks[]` in the request body (wizard blocks from `generate_shelf_plan`).
   - Tracks `lastInsertId()` per entry keyed by `"p{copy_id}"` / `"c{container_id}"` per shelf
     (stored in `$entryIdsByShelfAndItem`).
   - After inserting all entries, iterates blocks to INSERT `layout_sections` rows and then
     UPDATE `shelf_layout_entries.layout_section_id` for each matched entry.

3. `api/api.php` — new `get_layout_sections(layout_id)` action: returns all sections for a
   layout ordered by `(shelf_id, sort_index)`, verifying user ownership before returning.

4. `js/app.js` — `applyWizardPlan()`: now sends `blocks: _wizardPlan.blocks || []` alongside
   the placement plan so the backend can persist section metadata.

---

### feat(db): add persisted layout sections (v2.8.14)

**Goal A — additive DB migration for layout sections:**

1. New `layout_sections` table in `config/config.php` (v6.3.0 migration block):
   - Columns: `id`, `layout_id` (FK → `shelf_layout_profiles`), `shelf_id` (FK → `shelves`),
     `section_key` (block_id from wizard), `group_type`, `group_value`, `label`,
     `sort_index`, `item_count`, `created_at`
   - Indexed by `layout_id` and `(layout_id, shelf_id)` for fast per-layout/per-shelf queries
   - Cascade-deletes when the parent `shelf_layout_profiles` or `shelves` row is removed

2. New nullable `layout_section_id INTEGER DEFAULT NULL` column on `shelf_layout_entries` —
   links each placement entry back to its originating wizard block once the layout is saved.

Both migrations are idempotent (`CREATE TABLE IF NOT EXISTS` + try/catch ALTER TABLE).

---

### fix: plan from physical items + correct box-set inclusion + named blocks (v2.8.13)

**Goal A — physical inventory as planning candidates:**

1. `$includeBoxsets` / `$includeWishlist` were always false because the frontend nests
   them in `recipe.remainder` but backend read them from `$input` top-level. Fixed: now
   read from `$recipe['remainder']` first, then fall back to legacy locations.

2. Container query extended: adds `contained_count` via LEFT JOIN on
   `container_contents` so box-set items carry their disc count.

3. New: after building `$allCopies`, query `container_contents` to identify copy IDs
   that are physically inside a box set. These are filtered out of `$allCopies`
   unconditionally — they're part of the container physical object and can't be placed
   independently. If `include_boxsets=true`, the container itself is placed instead.

4. Empty-pool check updated: fail only when BOTH `$allCopies` and `$allContainers` are
   empty (previously failed if copies empty even when containers were present).

5. All item objects now carry: `movie_id`, `year`, `rating`, `item_type`
   (`single`|`boxset`). Box-set items also carry `contained_count`.

**Goal B — named per-shelf blocks (auto-bucketing flat sections):**

6. New `$getPrimaryValue` helper: for flat sections (`values=[]`), extracts the primary
   director/studio/genre/cert from enriched metadata (falls back to `movies` table).

7. Flat sections now set `bucket_label` from `$getPrimaryValue`. Items are sorted
   bucket_label-first (contiguous groups per value), then secondary sort within each
   bucket. This means `generate_recipe_plan` now produces meaningful block labels
   (e.g. "Director: Christopher Nolan") even when no explicit values were specified.

8. Box-set items in remainder carry `bucket_label: 'Box Sets'` so they form a distinct
   named block in the preview rather than "Other".

| File | Change |
|------|--------|
| `api/api.php` | 7 edits in `generate_recipe_plan` (param fix, container filter, item enrichment, auto-bucketing) |
| `js/app.js` | APP_VERSION → 2.8.13 |
| `version.json` | 2.8.12 → 2.8.13 |

---

### feat: per-shelf grouping blocks in wizard plan (v2.8.12)

API now returns `blocks` (grouped runs) per child shelf to support future block-moving UI.

**API change** (`generate_recipe_plan`, api.php):
- Items in the section assignment loop now carry `group_type` (e.g. `"director"`,
  `"studio"`) so block derivation can label them correctly.
- After `$recipePlacementOut` is built, a new pass walks each shelf's `ordered_items`
  in sequence. A new block starts whenever `group_type::bucket_label` changes. Each
  block has: `block_id` (stable string like `blk_3`), `shelf_id`, `shelf_name`,
  `group_type`, `group_value`, `label` (e.g. `"Director: Nolan — Shelf 1"`), `count`,
  and `items[]` (title + copy_id).
- `blocks` added as a new field in the `jsonResponse`; all existing fields unchanged.

**Frontend change** (`_renderWizardPreview`, app.js):
- When `plan.blocks` is present and non-empty, preview renders each shelf as a list
  of named blocks (purple chip header + indented titles), rather than the flat
  inline chip style.
- Falls back to v2.8.11 inline chip behavior when `blocks` is absent (older API).

| File | Change |
|------|--------|
| `api/api.php` | `group_type` on items; block derivation loop; `blocks` in response |
| `js/app.js` | `_renderWizardPreview` blocks branch + fallback; APP_VERSION → 2.8.12 |
| `version.json` | 2.8.11 → 2.8.12 |

---

### fix: bucketed grouping + unplaced count in wizard plan (v2.8.11)

**Root cause — two bugs in `generate_recipe_plan` (api.php)**:

1. **Flat section assignment**: When a section had `values=["Nolan","Spielberg"]`,
   all matching items were gathered into a single sorted list. Director/studio
   boundaries were lost — items were globally sorted across all selected values.

2. **`$unplaced` always 0**: Formula was `($placedTop + $totalBottom) > $totalCapacity`
   but `$placedTop` is the count of *placed* items (not *attempted*), so the
   difference was always ≤ 0.

**Fix** (api.php):
- Section assignment loop now checks `empty($values)`. When non-empty, iterates
  each value individually, building a separate `$bucketItems` array per value
  (claims from `$allCopies` one value at a time). Each bucket gets its own
  `['name'=>$singleValue, ...]` entry in `$topSections`/`$bottomSections`.
  Items carry a `bucket_label` field for frontend rendering.
- Added `$totalTopRemainder` counter (sum of items in top+remainder sections)
  before fill loop.
- Added `$placedBottom` counter in bottom fill loop.
- New formula: `$unplaced = max(0, ($totalTopRemainder - $placedTop) + ($totalBottom - $placedBottom));`

**Fix** (js/app.js `_renderWizardPreview`):
- Replaced flat `.map(i => escapeHtml(i.title)).join(' · ')` with a loop that
  detects `bucket_label` transitions and inserts a purple chip (e.g. `Nolan`)
  with a `│` visual separator before the first item of each new bucket.

| File | Change |
|------|--------|
| `api/api.php` | Per-value bucketing in section assignment; `$totalTopRemainder`; `$placedBottom`; fixed `$unplaced` formula |
| `js/app.js` | `_renderWizardPreview` bucket chip rendering; APP_VERSION → 2.8.11 |
| `version.json` | 2.8.10 → 2.8.11 |

---

## 2026-02-26 (branch: claude/continue-cineshelf-setup-acofW)

### fix: distribute wizard plan across shelf unit shelves by capacity (v2.8.10)

**Root cause — two bugs in `generate_recipe_plan` (api.php)**:

1. **Param name mismatch** (line 7091): Backend read `$input['target_shelf_ids']` but
   frontend (`generateWizardPlan`) sends `target_shelves`. So `$targetShelves` was
   always `[]`, falling to the "get all parent shelves" default.

2. **No parent→children expansion**: Both code paths returned only parent-level shelf
   rows (`parent_shelf_id IS NULL`). A shelf unit with `shelf_count=8` is a single row,
   so all 688 items were crammed into 1 `shelf_id` → "688 items across 1 shelf".

**Fix** (api.php, ~lines 7091 and 7274–7340):
- Accept `target_shelves` with `target_shelf_ids` as fallback.
- SELECT now includes `shelf_count` and `items_per_shelf` from the shelf record.
- New expansion loop: for each shelf in the raw list, if `shelf_count > 1`, fetch its
  child shelves. If fewer than `shelf_count` exist, auto-create the missing ones
  (`INSERT INTO shelves` with `parent_shelf_id`, `capacity = items_per_shelf`). Then
  use the full list of child shelf IDs for placement distribution.
- Single shelves (no unit config) pass through unchanged.

**Before**: unique `shelf_id` count in plan = 1 (always)
**After**: unique `shelf_id` count = `shelf_count` of the unit (e.g. 8 for 8×65 config)

| File | Change |
|------|--------|
| `api/api.php` | 2 edits in `generate_recipe_plan`: param name fix + shelf expansion block |
| `js/app.js` | APP_VERSION → 2.8.10 |
| `version.json` | 2.8.9 → 2.8.10 |


### fix: pick modal layered above wizard modal (v2.8.7)

**Root cause**: `.modal` CSS class sets `z-index: 2000`. `#aiWizardModal` inherits
this. `#cloudPickerModal` had an inline `z-index: 1100` which is less than 2000,
so the wizard overlays the picker.

**Fix**:
- `css/styles.css`: Override `#aiWizardModal { z-index: 1000; }` and
  `#cloudPickerModal { z-index: 1100; }`. Add `.modal--inactive { pointer-events: none; }`.
- `index.html`: Remove now-redundant inline `z-index:1100` from `#cloudPickerModal`.
- `js/app.js`:
  - `openCloudPicker()`: adds `modal--inactive` class to wizard so it can't
    receive clicks while picker is open.
  - `closeCloudPicker()`: removes `modal--inactive` class, restoring wizard interaction.
  - New global ESC key handler closes topmost open modal in order:
    cloud picker → wizard → new-empty-layout dialog.

### feat: new empty layout from layout selector + empty layout state UI (v2.8.8)

#### Part 2 — New Empty Layout UI (index.html + app.js)
- `#layoutProfileSelect` now has `➕ New Empty Layout…` option (`value="__new__"`).
- Selecting it resets the dropdown and opens `#newEmptyLayoutModal`.
- `#newEmptyLayoutModal`: name input (required), "Set as active immediately" checkbox,
  Create + Cancel buttons. Enter key submits.
- New JS functions: `showNewEmptyLayoutModal`, `closeNewEmptyLayoutModal`,
  `confirmNewEmptyLayout` (calls `create_empty_layout` API → refresh list + shelves).

#### Part 3 — create_empty_layout API (api.php)
| Action | Params | Returns |
|--------|--------|---------|
| `create_empty_layout` | `name` (required), `set_active` (bool, optional) | `{layout_id, name, is_active}` |

- Inserts a new `shelf_layout_profiles` row with NO entries (empty layout).
- If `set_active=true`: deactivates all other layouts first.
- Does NOT clone shelves or layout entries.

#### Part 4 — Empty layout state UX (index.html + app.js)
- `#emptyShelves` heading and text are now dynamic (IDs: `emptyShelvesHeading`,
  `emptyShelvesText`).
- `renderShelves()`: when `shelves.length === 0`, checks `layoutProfiles` for an
  active profile. If found → "This layout has no shelves yet." / wizard tip.
  If not → original "No shelves yet" message.
- Both states show **Create Shelf** + **✨ Run Wizard** buttons.

| File | Change |
|------|--------|
| `css/styles.css` | z-index stack rules for wizard/picker modals |
| `index.html` | #newEmptyLayoutModal; enhanced #emptyShelves; cloudPickerModal inline z-index removed |
| `js/app.js` | openCloudPicker/closeCloudPicker modal--inactive; ESC handler; _renderLayoutSelector option; onLayoutProfileChange handler; show/close/confirmNewEmptyLayout; renderShelves empty-state logic; APP_VERSION → 2.8.7 → 2.8.8 |
| `api/api.php` | create_empty_layout action |
| `version.json` | 2.8.7 → 2.8.8 |

---

## 2026-02-26 (branch: claude/version-sync-wizard-shelfunit-livingroom)

### fix: unify version system and auto-sync on deploy (v2.8.3)

**Root cause**: `get-version.php` only read `data/version.json` (Railway
volume), so a fresh deploy with new code still reported the old volume
version.  The version-manager was showing 2.2.27 while app code was 2.8.x.

**Fix**: `get-version.php` is now the single source of truth:
1. Reads `version.json` (repo) → `$repoVersion`
2. Reads/creates `data/version.json` → `$persistedVersion`
3. If data file missing → seed from repo
4. If `repo > persisted` (via `version_compare`) → auto-upgrade data file
5. Returns full diagnostic payload: `{version, effective_version,
   repo_version, persisted_version, source, updated, auto_upgraded, seeded}`

| File | Change |
|------|--------|
| `get-version.php` | Fully rewritten — single source of truth with auto-sync |
| `admin/version-manager.html` | Shows Repo / Persisted / Effective in 3-column grid; mismatch banner + "Sync to Repo Version" button |
| `api/api.php` | Added `admin_sync_version` action (admin-only) |
| `version.json` | Bumped to 2.8.3 |

### feat: wizard preview improvements (v2.8.4)

- Default layout name: `"Living Room Movie Shelf – <preset> – <date>"`
  instead of plain `"Recipe: My Layout <date>"`.
- Overflow count in summary: `⚠ N items overflow (shelf capacity exceeded)`
  shown in amber when `plan.unplaced_estimate > 0`.
- Per-shelf item count shown on each shelf row in the preview.
- Added `_wizardPresetLabel()` helper in `app.js`.

| File | Change |
|------|--------|
| `js/app.js` | `_renderWizardPreview` + `_wizardPresetLabel`; APP_VERSION → 2.8.4 |
| `version.json` | Bumped to 2.8.4 |

### feat: word cloud picker modal (v2.8.5)

Per-section "Pick…" button opens a modal with a word cloud of all values
for that type (director / studio / genre / cert / tag). Font size scales
0.75–1.3 rem proportional to count.  Multi-select with toggle, search
filter, and A-Z / count sort.  "Add Selected" appends to chip list.

#### New API actions
| Action | Params | Returns |
|--------|--------|---------|
| `list_metadata_cloud` | `type` | `[{name, cnt}]` sorted by cnt desc, top 200 |
| `search_metadata_cloud` | `type`, `q` | filtered `[{name, cnt}]` |

Both use `COUNT(DISTINCT copies.id)` with fallback to `movies` text columns.

#### New JS functions
| Function | Purpose |
|----------|---------|
| `openCloudPicker(sid,type)` | Fetches cloud, renders modal |
| `closeCloudPicker()` | Hides modal, clears state |
| `_renderCloudPickerList(q,az)` | Renders size-weighted toggle buttons |
| `_cloudPickerToggle(name)` | Toggle selected state |
| `_cloudPickerSearch(q)` | Re-renders with filter |
| `_cloudPickerSort(az)` | Re-renders with sort |
| `_cloudPickerConfirm()` | Appends selected values as chips, closes modal |

| File | Change |
|------|--------|
| `api/api.php` | Added `list_metadata_cloud`, `search_metadata_cloud` |
| `js/app.js` | Cloud picker state + 7 functions; APP_VERSION → 2.8.5 |
| `index.html` | Added `#cloudPickerModal` |
| `version.json` | Bumped to 2.8.5 |

### feat: shelf unit capacity config (defaults 5×25) (v2.8.6)

New wizard "Shelf Unit Capacity" panel lets users configure how many
physical shelves their unit has (`shelf_count`) and how many items fit per
shelf (`items_per_shelf`), then save those as defaults on the shelf record.
Supports user's real-world case of 8×65.

`capacity_mode = 'quantity'` column is a placeholder for a future
"width-based" mode — no implementation yet.

#### DB changes (additive auto-migrations on `shelves` table)
| Column | Default |
|--------|---------|
| `shelf_count` | 5 |
| `items_per_shelf` | 25 |
| `capacity_mode` | `'quantity'` |

#### New API actions
| Action | Params | Returns |
|--------|--------|---------|
| `get_shelf_unit_config` | `shelf_id` | `{shelf_id, name, shelf_count, items_per_shelf, capacity_mode, total_capacity}` |
| `save_shelf_unit_config` | `shelf_id`, `shelf_count`, `items_per_shelf` | `{ok:true}` |

`create_shelf` also now accepts `shelf_count`, `items_per_shelf`,
`capacity_mode` on creation.

#### New JS functions
| Function | Purpose |
|----------|---------|
| `updateWizardCapacity()` | Live total = shelf_count × items_per_shelf |
| `loadWizardShelfUnitConfig()` | Calls `get_shelf_unit_config`, fills inputs |
| `saveWizardShelfUnitConfig()` | Calls `save_shelf_unit_config` |

| File | Change |
|------|--------|
| `config/config.php` | 3 auto-migrations for new shelves columns |
| `api/api.php` | `get_shelf_unit_config`, `save_shelf_unit_config`; updated `create_shelf` |
| `index.html` | Shelf Unit Capacity panel in wizard Step 1 |
| `js/app.js` | 3 new functions; APP_VERSION → 2.8.6 |
| `version.json` | Bumped to 2.8.6 |

---

## 2026-02-26 (branch: claude/fix-wizard-sql-typeahead-version-auto)

### fix: wizard plan SQL binding and validation (v2.8.1)

**Root cause of `SQLSTATE[HY000]: General error: 25`:**
`array_unique()` preserves original array keys. PHP PDO uses the numeric
key as the 1-based SQLite bind index when executing positional `?`
statements. With non-sequential keys (e.g. `[0, 2]` for 2 unique movies
from 3 copies) PDO tries to bind at index 3 for a 2-placeholder query →
`SQLITE_RANGE` (error 25). Fix: `array_values(array_unique(...))`.

**Other fixes in `api.php` → `generate_recipe_plan`:**
- Empty `values[]` in a recipe section now matches any item that HAS any
  value for that type (instead of matching nothing). Makes Genre A-Z and
  R/Kids presets work as expected.
- Added clear `400` errors: "No items found" and "No shelves found".
- Clamped shelf capacity to `max(1, ...)` everywhere in fill logic.
- Fixed operator-precedence bug in fill-loop condition (added parens).

**New API actions:**
- `search_metadata_values` — `{type, q}` → `{results:[{id,name}], empty_hint?}`
- `list_metadata_values` — alias of above with `q=''`
  Both fall back to `movies` table text fields when metadata tables are
  empty, and include `empty_hint` pointing to Admin Backfill.

### feat: metadata typeahead selectors + VersionGuard + status banner (v2.8.2)

#### VersionGuard rule (new mandatory rule for all future commits)
Every commit that changes JS, HTML, CSS, service worker, or API
behaviour affecting frontend data **must** bump `version.json` PATCH +1
and update `APP_VERSION` in `app.js` to match.

`checkVersionGuard()` runs on `DOMContentLoaded`, fetches
`/get-version.php`, and `console.warn`s if server version ≠ script
version.

#### Typeahead chip selectors (wizard section builder)
| Function | File | Purpose |
|----------|------|---------|
| `_renderChips(sec)` | `app.js` | Renders removable purple chip spans |
| `_wizardTypeaheadSearch(sid,type,el)` | `app.js` | Debounced 250ms, calls `search_metadata_values`, populates `<datalist>` |
| `wizardAddChip(sid,el)` | `app.js` | Adds chip in-place (no full re-render) |
| `wizardRemoveChip(sid,val)` | `app.js` | Removes chip in-place |
| `_wizardSectionChange` | `app.js` | Now clears chips + datalist on type switch |

Section rows now use chip display + `<input list="...">` + `<datalist>`
instead of a plain comma-separated text field.
Empty chip list shows "blank = match all" hint.

#### Metadata status banner (Part 4)
- `#wizardMetadataBanner` added to `index.html` (hidden by default)
- `_checkWizardMetadataStatus()` called on `showAIWizardModal()`; shows
  amber warning if < 50% of movies are enriched — never blocks.

---

## 2026-02-25

### chore: add AI project memory system
- Created `/docs/ai/` directory with 8 files:
  - `AI_START_HERE.md` — session entry point, repo overview, key rules
  - `PROJECT_MAP.md` — full feature and file index, env var reference
  - `ARCHITECTURE.md` — stack, request flow, config loading order
  - `DEV_GUIDE.md` — local dev setup, adding features, deploy guide
  - `API_CONTRACTS.md` — API endpoint reference, response shapes
  - `FEATURE_REGISTRY.md` — feature inventory with status and code locations
  - `ADMIN_GUIDE.md` — admin users, Railway deployment, secret rotation
  - `CHANGELOG_AI.md` — this file

### chore: remove secrets from repository docs and examples
- **`cineshelf.futuresrelic.com/config/config.php`** — removed hardcoded TMDB API key fallback value; fallback now uses placeholder string. Runtime behavior unchanged (Railway env var is primary source).
- **`cineshelf.futuresrelic.com/config/oauth-config.php`** — removed hardcoded Google CLIENT_ID and CLIENT_SECRET fallback values; replaced with empty string placeholders. Runtime behavior unchanged (Railway env var is primary source; secrets.php is local-dev fallback).
- **`RAILWAY_DEPLOY.md`** — replaced three real key values in the "Configure Environment Variables" section with `YOUR_TMDB_API_KEY`, `YOUR_GOOGLE_CLIENT_ID`, `YOUR_GOOGLE_CLIENT_SECRET` placeholders.
- **`HANDOFF_DOCUMENT.md`** — replaced real TMDB API key in the External Services section with `YOUR_TMDB_API_KEY` placeholder.

**⚠ ROTATE THESE CREDENTIALS** — the following were previously committed to git history and should be considered compromised:
- TMDB API key (was `8039283176a74ffd71a1658c6f84a051`)
- Google OAuth Client ID (was `754407099284-tqu...`)
- Google OAuth Client Secret (was `GOCSPX-pXo1t...`)

To rotate: regenerate on each provider's dashboard, then update Railway env vars.

---

## 2026-02-26 (branch: claude/layout-recipe-wizard-metadata-volume)

### fix: repair wizard runtime errors

- **`js/app.js`** — added top-level `escapeHtml()` function (outside the App IIFE) so it can be called globally; was previously undefined causing modal render failures.
- **`api/api.php`** — fixed all wrong SQL column names in `generate_shelf_plan` and `generate_shelf_plan_ai`: `m.genre_ids` → `m.genre`, `m.vote_average` → `m.rating`, `m.release_date` → `m.year`, `m.production_company` → `m.studio`; `containers.title` → `containers.name`.
- **`config/config.php`** — added safe auto-migrations for `shelves.parent_shelf_id`, `shelf_assignments.container_id`, `shelf_assignments.is_container`, `shelf_layout_profiles.recipe_json`.
- **`config/config.php`** — changed `DEFAULT_CAPACITY` from 25 → **65** (user preference for personal shelf limit).

### feat: add persistent metadata tables and backfill actions

#### New DB tables (auto-migrated, additive)
| Table | Columns |
|-------|---------|
| `movie_people` | id, movie_id, name, role, role_detail |
| `movie_studios` | id, movie_id, studio_name |
| `movie_genres` | id, movie_id, genre_name |
| `movie_certifications` | id, movie_id, certification, country |
| `user_tags` | id, user_id, name, color, created_at |
| `user_tag_links` | id, tag_id, entity_type, entity_id |

#### New API actions
- `get_metadata_status` — counts of enriched movies
- `backfill_movie_metadata` — seeds normalized tables from TMDB API or existing text fields
- `list_user_tags`, `create_user_tag`, `delete_user_tag`
- `set_entity_tags`, `get_entity_tags`
- `generate_recipe_plan` — deterministic planner using recipe JSON format
- `apply_recipe_as_new_layout` — saves a recipe plan as a new layout profile

#### New helper
- `_backfillFromExistingFields($db, $movie)` in `api.php` — seeds metadata from existing `movies.director`/`genre`/`studio`/`certification` text fields without any TMDB API call (zero-cost fallback).

### feat: add recipe-based shelf layout wizard

Upgraded the AI wizard from single-strategy to a multi-section recipe builder.

#### Files touched
| File | Change |
|------|--------|
| `index.html` | Replaced simple strategy-picker `#aiWizardModal` with full recipe builder modal |
| `js/app.js` | Rewrote wizard JS; new state: `_wizardSections[]`, `_sectionIdCounter` |

#### New/updated JS functions
| Function | Purpose |
|----------|---------|
| `wizardApplyPreset(name)` | Pre-fills sections from named preset |
| `wizardAddSection()` | Appends blank section to builder |
| `wizardRemoveSection(id)` | Removes section by ID |
| `_wizardSectionChange(el)` | Syncs DOM field change back to `_wizardSections` state |
| `_renderWizardSections()` | Re-renders `#wizardSectionList` from state |
| `generateWizardPlan()` | Builds recipe JSON → calls `generate_recipe_plan` API |
| `applyWizardPlan()` | Calls `apply_recipe_as_new_layout` API → saves layout |

#### Presets
| Preset ID | Sections |
|-----------|---------|
| `r-kids-rest` | cert=R (top) · cert=G/PG/PG-13 (bottom) · remainder A-Z |
| `directors-studios-rest` | director=all (top, rating sort) · studio=all (top) · remainder A-Z |
| `genre-az` | genre=all (top, A-Z sort) · remainder A-Z |

---

## 2026-02-25 (branch: claude/shelf-layouts-ai-wizard-2026-02-25)

### feat: Shelf Layout Profiles + AI Organization Wizard (v5.0.0)

All four slices committed as one combined feature on this branch.

#### Files touched
| File | Change |
|------|--------|
| `config/config.php` | Added auto-migrations for `shelf_layout_profiles` and `shelf_layout_entries` tables |
| `api/api.php` | Added 11 new API actions (see API_CONTRACTS.md) |
| `index.html` | Added Layout selector dropdown + gear button in Shelves toolbar; added `manageLayoutsModal` + `aiWizardModal` |
| `js/app.js` | Added layout profile manager JS + AI Wizard JS; exposed 12 new public functions |
| `docs/ai/API_CONTRACTS.md` | Updated with all new actions |
| `docs/ai/FEATURE_REGISTRY.md` | Added Shelf Layout Profiles + AI Wizard entries |

#### DB changes (additive, no schema breakage)
- `shelf_layout_profiles` (id, user_id, name, is_active, created_at, updated_at)
- `shelf_layout_entries` (id, layout_id, shelf_id, copy_id, container_id, is_container, position_in_shelf)

#### Safety notes
- Existing `shelf_assignments` table and all existing shelf API actions are untouched.
- If no layouts exist, the Shelf view behaves exactly as before.
- Layout application is reversible: switching back to "Default" re-enables manual arrangement.
- AI planner has a full deterministic fallback (no OpenAI key required for basic use).
