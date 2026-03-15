# FEATURE_REGISTRY — CineShelf

Tracks which features exist, their status, and where their code lives.

## Core Features

| Feature | Status | Frontend | Backend |
|---------|--------|----------|---------|
| Movie/TV search (TMDB) | ✅ Live | `index.html` | `api.php` → `search_tmdb` |
| Add to collection | ✅ Live | `index.html` | `api.php` → `add_movie` |
| Copy management | ✅ Live | `index.html` | `api.php` → `add_copy`, `update_copy` |
| Box sets / containers | ✅ Live | `index.html` | `api.php` → `add_container` |
| Physical media editions | ✅ Live | `index.html` | `api.php` → `add_edition` |
| UMDB edition push | ✅ Live | `index.html` | `api.php` → `push_edition_to_umdb` |
| Wishlist | ✅ Live | `index.html` | `api.php` → `*_wishlist` actions |
| Groups / shared shelves | ✅ Live | `join-group.html` | `api.php` → `*_group` actions |
| Google OAuth login | ✅ Live | `login.html` | `api/auth.php` |
| AI cover scan (GPT-4o) | ✅ Live | `index.html` | `api.php` → `scan_boxset_cover_fields` |
| Cover Scanner — Scan Cover (batch) | ✅ Live | `index.html` + `js/cover-scanner.js` | `api.php` → `scan_cover_image`, `add_unresolved` |
| Cover Scanner — Scan & Match | ✅ Live | `index.html` + `js/cover-scanner.js` | `api.php` → `scan_cover_image`, `search_multi`, `search_omdb`, `find_by_imdb`, `add_copy` |
| AI article extract | ✅ Live | `index.html` | `api.php` → `extract_article_with_ai` |
| Bulk editor | ✅ Live | `index.html` | `api.php` → `list_all_copies_detailed`, `bulk_update_copies` |
| TV show support | ✅ Live | `index.html` | `api.php` (TMDB multi-search) |
| PWA installability | ✅ Live | `service-worker.js`, `manifest.json` | — |
| Admin seed data | ✅ Live | — | `api.php` → `admin_seed_fight_club` |
| User data export | ✅ Live | `user-data-manager.html` | `api.php` |

| Shelf Layout Profiles | ✅ Live | `index.html` (selector + manage modal + ➕ New Empty Layout dialog) | `api.php` → `list/create/rename/delete/duplicate/set_active/save/apply_shelf_layout`, `create_empty_layout` |
| AI Organization Wizard | ✅ Live | `index.html` (AI Wizard modal) | `api.php` → `generate_shelf_plan`, `generate_shelf_plan_ai`, `apply_wizard_plan` |
| Recipe Layout Wizard | ✅ Live | `index.html` (`#aiWizardModal` — chip typeahead builder) | `api.php` → `generate_recipe_plan`, `apply_recipe_as_new_layout`, `search_metadata_values` |
| Persistent Metadata Tables | ✅ Live | — (backfill via API) | `api.php` → `backfill_movie_metadata`, `get_metadata_status` |
| User Tagging | ✅ Live | — (tags used as wizard section criteria) | `api.php` → `list/create/delete_user_tag`, `set/get_entity_tags` |
| Version Auto-Sync | ✅ Live | `admin/version-manager.html` (3-column version grid) | `get-version.php` (auto-sync on request), `api.php` → `admin_sync_version` |
| Word Cloud Picker | ✅ Live | `index.html` (`#cloudPickerModal` — per-section "Pick…" button) | `api.php` → `list_metadata_cloud`, `search_metadata_cloud` |
| Shelf Unit Capacity Config | ✅ Live | `index.html` (wizard Step 1 Shelf Unit Capacity panel) | `api.php` → `get_shelf_unit_config`, `save_shelf_unit_config` |

## Optional / Conditional Features

| Feature | Requires | Graceful if missing? |
|---------|----------|----------------------|
| AI scanning | `OPENAI_API_KEY` | Yes — button hidden |
| UMDB push | `UMDB_API_KEY` | Yes — push disabled |
| Google login | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | No — app requires auth |
| AI Wizard names | `OPENAI_API_KEY` | Yes — falls back to deterministic grouping |
| TMDB metadata backfill | `TMDB_API_KEY` | Yes — falls back to parsing existing text fields |
| OMDB tab in Scan & Match | `OMDB_API_KEY` | Yes — tab shows setup instructions (free key at omdbapi.com) |

## Versions (from CHANGELOG.md)

- v2.9.1 — Cover Scanner Scan & Match (multi-source: TMDB/UMDB/IMDb/OMDB tabs), OMDB API integration
- v2.9.0 — Bulk editor, Box Set AI Cover Scanning, Camera Box Set Scanner
- v2.8.0 — TV show support
- v4.0.0 — Physical media editions system
- v4.1.0 — UMDB two-way linking
- v5.0.0 — Shelf Layout Profiles + AI Organization Wizard
- v6.0.0 — Recipe Layout Wizard, Persistent Metadata Tables, User Tagging
- v6.1.0 / v2.8.1-2 — SQL bind fix, typeahead chip selectors, VersionGuard, metadata status banner
- v6.2.0 / v2.8.3-6 — Version auto-sync, wizard preview improvements, word cloud picker, shelf unit capacity config
- v6.3.0 / v2.8.7-8 — Pick modal z-index fix, new empty layout creation flow, empty layout state UX
