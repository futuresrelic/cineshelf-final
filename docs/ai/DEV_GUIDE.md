# DEV_GUIDE — CineShelf

## Local Development

1. Copy `.env.example` to `.env` and fill in your own API keys.
2. Copy `cineshelf.futuresrelic.com/config/secrets.php.example` to `secrets.php` and add keys there if not using env vars.
3. Run a local PHP server:
   ```bash
   cd cineshelf.futuresrelic.com
   php -S localhost:8080
   ```
4. SQLite DB auto-creates at `data/cineshelf.sqlite` on first request.

## Adding a New API Action

1. Open `cineshelf.futuresrelic.com/api/api.php`.
2. Find the main `switch ($action)` block.
3. Add a new `case 'your_action':` with a handler function below.
4. Call it from the frontend with `callApi('your_action', { ...params })`.

## Adding a Database Column

Add an inline migration to `config.php → getDb()`:
```php
try { $db->exec("ALTER TABLE tablename ADD COLUMN col_name TYPE DEFAULT val"); } catch (PDOException $e) {}
```
This runs on every request but is a no-op after the column exists.

## Deploying to Railway

- Push to `master` or the active Railway branch.
- Railway auto-deploys via nixpacks (reads `nixpacks.toml`).
- Set all env vars in Railway Dashboard → Service → Variables tab.
- Never commit real secrets — Railway injects them at runtime.

## Key Conventions

- **No build step** — edit HTML/JS/PHP directly.
- **API responses** always: `{ ok: true/false, data: ..., error: "..." }`
- **Auth check** at top of every protected API handler: call `requireAuth()`.
- **Admin check**: `isAdmin($username)` from `config.php`.

## Secrets Management

- Real keys go in Railway env vars only.
- Local dev: `config/secrets.php` (gitignored).
- Never put real keys in `.env.example`, docs, or any committed file.
