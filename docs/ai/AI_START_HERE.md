# AI_START_HERE — CineShelf

**Read this file first every session.**

## What Is CineShelf?

CineShelf is a personal physical-media collection manager (Blu-ray, DVD, 4K, etc.) hosted on Railway. It's a PHP + SQLite + vanilla-JS PWA. Users sign in with Google OAuth and manage their movie/TV shelf.

## File Layout (Quick Map)

```
/                               ← repo root
├── cineshelf.futuresrelic.com/ ← all app code lives here
│   ├── api/api.php             ← SINGLE API endpoint (~271KB), action-based routing
│   ├── api/auth.php            ← Google OAuth handler
│   ├── config/config.php       ← DB path, TMDB key, OpenAI key, OMDB key (reads env vars)
│   ├── config/oauth-config.php ← Google OAuth config (reads env vars)
│   ├── config/secrets.php.example
│   ├── js/                     ← frontend JS (vanilla)
│   ├── css/                    ← styles
│   ├── index.html              ← main SPA shell
│   └── data/                   ← SQLite DB + logs (gitignored, Railway volume)
├── docs/ai/                    ← AI memory system (you are here)
├── .env.example                ← placeholder env vars, no real secrets
├── .gitignore
├── nixpacks.toml
└── railway.json
```

## Must-Know Rules

1. **All secrets come from Railway env vars.** Never hardcode real keys.
2. **Single API file** — `api/api.php` handles everything via `?action=` routing.
3. **No build step** — pure PHP + vanilla JS. No npm, no bundler.
4. **SQLite** — one file at `$DB_PATH`. Auto-migrated via inline `ALTER TABLE` in `config.php`.
5. **Do not rename or move** `api/api.php`, `config/config.php`, `config/oauth-config.php` — they are hardcoded in includes.

## Read Next

- `PROJECT_MAP.md` — full feature and file index
- `ARCHITECTURE.md` — request flow and data model
- `CHANGELOG_AI.md` — recent AI-made changes
