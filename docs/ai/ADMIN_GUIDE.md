# ADMIN_GUIDE — CineShelf

## Admin Users

Defined in `config/config.php`:
```php
define('ADMIN_USERS', ['admin', 'klindakoil', 'default']);
```
Any username in that array gets admin privileges after OAuth login.

## Admin API Actions

All require an authenticated session from an admin user.

| Action | Purpose |
|--------|---------|
| `admin_seed_fight_club` | Seed test data (Fight Club movie + editions) |
| `get_all_users` | List all registered users |
| `get_audit_log` | Read audit trail |

## Deployment (Railway)

1. Push code to the Railway-connected branch.
2. Railway builds with nixpacks (PHP runtime, see `nixpacks.toml`).
3. SQLite DB lives on a persistent volume mounted at `$DB_PATH`.
4. All secrets are set in Railway Dashboard → Service → Variables.

### Required Environment Variables

```
DB_PATH=<path to sqlite file on volume>
TMDB_API_KEY=<from themoviedb.org>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=https://<your-domain>/api/auth.php
DEBUG_MODE=false
```

### Optional Environment Variables

```
OPENAI_API_KEY=<from platform.openai.com>  # enables AI features
UMDB_API_KEY=<from UMDB>                   # enables edition push
PORT=8080                                   # set automatically by Railway
```

## Database Backups

Railway does not auto-backup volumes. To backup:
1. SSH into Railway shell or use the Railway CLI.
2. Copy `cineshelf.sqlite` to a safe location.

## Rotating Secrets

If a secret is compromised:
1. Regenerate on the provider's dashboard (TMDB, Google Cloud, OpenAI).
2. Update the value in Railway Dashboard → Service → Variables.
3. Railway redeploys automatically.

## Logs

- PHP errors log to `data/php-errors.log` (production mode).
- In debug mode (`DEBUG_MODE=true`), errors display in the browser.
- Audit log is stored in the `audit_log` SQLite table.
