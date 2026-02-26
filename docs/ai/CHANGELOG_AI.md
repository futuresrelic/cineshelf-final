# CHANGELOG_AI — CineShelf

AI-made changes only. Human changes are in `/CHANGELOG.md`.

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
