# API_CONTRACTS — CineShelf

## Base

- **Endpoint**: `POST /api/api.php`
- **Content-Type**: `application/json`
- **Auth**: `Authorization: Bearer <token>` or cookie `cineshelf_auth_token`
- **Response shape**: `{ "ok": bool, "data": any, "error": string|null }`

## Selected Actions

### Movies

| Action | Required Params | Returns |
|--------|----------------|---------|
| `search_tmdb` | `query` | Array of TMDB results |
| `add_movie` | `tmdb_id` | Created movie object |
| `get_movie` | `movie_id` | Movie + copies + editions |
| `delete_movie` | `movie_id` | `ok: true` |
| `get_collection` | — | All movies for user |

### Copies

| Action | Required Params | Returns |
|--------|----------------|---------|
| `add_copy` | `movie_id`, `format` | Created copy object |
| `update_copy` | `copy_id`, fields... | Updated copy |
| `delete_copy` | `copy_id` | `ok: true` |

### Box Sets (Containers)

| Action | Required Params | Returns |
|--------|----------------|---------|
| `add_container` | `title`, `format` | Created container |
| `get_containers` | — | All containers |
| `add_container_item` | `container_id`, `movie_id` | `ok: true` |
| `remove_container_item` | `container_id`, `movie_id` | `ok: true` |

### Editions (UMDB)

| Action | Required Params | Returns |
|--------|----------------|---------|
| `add_edition` | `movie_id`, `name`, `format` | Created edition |
| `push_edition_to_umdb` | `edition_id` | UMDB response |

### AI Features

| Action | Required Params | Notes |
|--------|----------------|-------|
| `scan_boxset_cover_fields` | `image_data` (base64) | Requires `OPENAI_API_KEY` |
| `extract_article_with_ai` | `url` | Requires `OPENAI_API_KEY` |

### Shelf Layout Profiles (v5.0.0)

| Action | Required Params | Returns |
|--------|----------------|---------|
| `list_shelf_layouts` | — | Array of layout profiles (id, name, is_active, entry_count) |
| `create_shelf_layout` | `name` | `{ layout_id, name }` |
| `rename_shelf_layout` | `layout_id`, `name` | `{ layout_id }` |
| `delete_shelf_layout` | `layout_id` | `{ deleted: layout_id }` |
| `set_active_shelf_layout` | `layout_id` (or null for default) | `{ active_layout_id }` |
| `get_active_shelf_layout` | — | `{ id, name }` or null |
| `duplicate_shelf_layout` | `layout_id`, `name` (opt) | `{ layout_id, name }` |
| `save_current_to_layout` | `layout_id` | `{ saved: count }` — snapshots current `shelf_assignments` into layout |
| `apply_shelf_layout` | `layout_id` | `{ applied: count }` — replaces `shelf_assignments` from layout entries |

### AI Organization Wizard (v5.0.0 — single-strategy, kept for backward compat)

| Action | Required Params | Optional Params | Returns |
|--------|----------------|-----------------|---------|
| `generate_shelf_plan` | `strategy` | `target_shelves[]`, `include_wishlist`, `include_boxsets`, `min_rating` | `{ strategy, sections[], placement[], total_items, shelves_used }` |
| `generate_shelf_plan_ai` | `strategy` | same as above | same + `ai_enhanced: bool` |
| `apply_wizard_plan` | `name`, `placement[]` | `set_active` | `{ layout_id, name, entries }` |

**strategy values**: `genre`, `director`, `studio`, `franchise`, `decade`, `awards`

### Recipe Layout Wizard (v6.0.0)

| Action | Required Params | Optional Params | Returns |
|--------|----------------|-----------------|---------|
| `generate_recipe_plan` | `recipe` | `target_shelves[]` | `{ placement[], total_items, shelves_used }` |
| `apply_recipe_as_new_layout` | `name`, `placement[]` | `set_active` | `{ layout_id, name, entries }` |

**recipe shape**:
```json
{
  "sections": [
    {
      "id": "s1",
      "type": "genre|director|studio|certification|user_tag",
      "values": ["Action", "Thriller"],
      "sort": "title|year|rating",
      "direction": "top|bottom"
    }
  ],
  "remainder": { "sort": "title|year|rating", "include_wishlist": false, "include_boxsets": false }
}
```

- `values` empty → match all items of that type (grouped into sub-sections per unique value)
- `direction: top` → sections fill shelves from the top; `bottom` → fills from last shelf upward
- `remainder` catches all items not matched by any section

**placement item shape**: `{ shelf_id, shelf_name, ordered_items: [{ copy_id|null, container_id|null, is_container, title }] }`

### Metadata & User Tags (v6.0.0)

| Action | Required Params | Optional Params | Returns |
|--------|----------------|-----------------|---------|
| `get_metadata_status` | — | — | `{ movies_total, people_enriched, genres_enriched, studios_enriched }` |
| `backfill_movie_metadata` | — | `use_tmdb` (bool, default true) | `{ processed, enriched, errors }` |
| `list_user_tags` | — | — | Array of `{ id, name, color, count }` |
| `create_user_tag` | `name` | `color` | `{ id, name, color }` |
| `delete_user_tag` | `tag_id` | — | `ok: true` |
| `set_entity_tags` | `entity_type`, `entity_id`, `tag_ids[]` | — | `ok: true` |
| `get_entity_tags` | `entity_type`, `entity_id` | — | Array of tag objects |

### Auth

- `GET /api/auth.php?action=login` — redirects to Google
- `GET /api/auth.php?code=...` — OAuth callback, sets session cookie
- `POST /api/api.php` `action=logout` — clears session

## Error Codes

All errors return `{ "ok": false, "error": "message" }` with appropriate HTTP status.
- `401` — not authenticated
- `403` — not authorized (non-admin)
- `400` — missing/invalid params
- `500` — server error
