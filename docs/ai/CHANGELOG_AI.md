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
