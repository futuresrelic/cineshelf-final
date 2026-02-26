# PROJECT_MAP — CineShelf

## Core App Files

| File | Purpose |
|------|---------|
| `cineshelf.futuresrelic.com/index.html` | Main SPA shell (~115KB), all UI tabs |
| `cineshelf.futuresrelic.com/api/api.php` | All API logic (~271KB), single endpoint |
| `cineshelf.futuresrelic.com/api/auth.php` | Google OAuth callback + session creation |
| `cineshelf.futuresrelic.com/api/auth-middleware.php` | Session validation helper |
| `cineshelf.futuresrelic.com/config/config.php` | DB path, TMDB, UMDB, OpenAI config |
| `cineshelf.futuresrelic.com/config/oauth-config.php` | Google OAuth credentials |
| `cineshelf.futuresrelic.com/api/schema.sql` | Full SQLite schema |

## Features

| Feature | Where |
|---------|-------|
| Movie/TV search | `api.php` action=`search_tmdb` |
| Add to collection | `api.php` action=`add_movie` |
| Copy management | `api.php` action=`add_copy`, `update_copy`, `delete_copy` |
| Box sets / containers | `api.php` action=`add_container` + `container_*` actions |
| Physical media editions | `api.php` action=`add_edition`, `push_edition_to_umdb` |
| Wishlist | `api.php` action=`add_to_wishlist`, `get_wishlist` |
| Groups / shared shelves | `api.php` action=`create_group`, `join_group` |
| AI cover scanning | `api.php` action=`scan_boxset_cover_fields` (OpenAI GPT-4o) |
| AI article extract | `api.php` action=`extract_article_with_ai` (OpenAI GPT-4o-mini) |
| Bulk editor | `api.php` action=`list_all_copies_detailed`, `bulk_update_copies` |
| Google OAuth login | `api/auth.php` |
| Admin seed data | `api.php` action=`admin_seed_fight_club` |

## External APIs

| Service | Env Var | Purpose |
|---------|---------|---------|
| TMDB | `TMDB_API_KEY` | Movie/TV metadata, posters |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Authentication |
| OpenAI | `OPENAI_API_KEY` | AI cover scan, article extraction |
| UMDB | `UMDB_API_KEY` | Physical media edition database |

## Database Tables (22)

**Core (14):** `users`, `sessions`, `movies`, `copies`, `wishlists`, `groups`, `group_members`, `group_movies`, `containers`, `container_contents`, `media_editions`, `edition_components`, `copy_components`, `audit_log`

**Shelves (v5.0.0, 2):** `shelf_layout_profiles`, `shelf_layout_entries`

**Metadata (v6.0.0, 6):** `movie_people`, `movie_studios`, `movie_genres`, `movie_certifications`, `user_tags`, `user_tag_links`

## Key Environment Variables

```
DB_PATH                 SQLite file path
TMDB_API_KEY            TMDB account key
GOOGLE_CLIENT_ID        Google OAuth app ID
GOOGLE_CLIENT_SECRET    Google OAuth app secret
GOOGLE_REDIRECT_URI     OAuth callback URL
OPENAI_API_KEY          OpenAI key (optional, for AI features)
UMDB_API_KEY            UMDB key (optional, for edition push)
DEBUG_MODE              true/false
PORT                    Set by Railway automatically
```
