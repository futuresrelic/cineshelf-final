# CHANGELOG_AI — CineShelf

AI-made changes only. Human changes are in `/CHANGELOG.md`.

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
