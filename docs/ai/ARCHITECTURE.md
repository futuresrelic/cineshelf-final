# ARCHITECTURE — CineShelf

## Stack

- **Runtime**: PHP 7.4+ (served via nixpacks on Railway)
- **Database**: SQLite 3 (WAL mode, persisted on Railway volume at `$DB_PATH`)
- **Frontend**: Vanilla JS + HTML (SPA, no framework, no build step)
- **Auth**: Google OAuth 2.0 → server-side sessions (30-day tokens in `sessions` table)
- **Hosting**: Railway (app + volume), domain `cineshelf.futuresrelic.com`

## Request Flow

```
Browser
  └─ GET /index.html          → SPA shell loads
  └─ POST /api/api.php        → JSON API (action= param in body)
       └─ auth-middleware.php  → validates session token
       └─ config/config.php    → DB + API keys loaded
       └─ config/oauth-config.php (for OAuth routes)
       └─ SQLite (cineshelf.sqlite)
       └─ TMDB API (external, for search/metadata)
       └─ OpenAI API (external, optional, for AI features)
       └─ UMDB API (external, optional, for edition push)

Browser
  └─ GET /api/auth.php        → Google OAuth callback handler
```

## API Pattern

All API calls are `POST /api/api.php` with JSON body `{ "action": "...", ...params }`.

Auth token passed as `Authorization: Bearer <token>` header or `cineshelf_auth_token` cookie.

## Configuration Loading Order

For each secret (e.g. TMDB key):
1. `getenv('TMDB_API_KEY')` — Railway env var (production)
2. `config/secrets.php` — local dev file (gitignored)
3. Placeholder/empty string — feature disabled gracefully

## Schema Migration Strategy

No migration runner. Migrations are inline `try { ALTER TABLE ... } catch {}` blocks at the bottom of `config.php → getDb()`. Safe to run on every request (no-ops after first run).

## PWA

- `service-worker.js` — offline caching
- `manifest.json` / `manifest.php` — Web App Manifest
- `pwa-register.js` — SW registration
