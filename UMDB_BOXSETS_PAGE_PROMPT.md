# UMDB Prompt: Add Box Sets Page / Tab with Full Editing

---

Please add a **Box Sets** section (page or tab) to UMDB with the following capabilities. This is for a physical media database where collectors manage their box set collections.

## What a Box Set is in UMDB

A box set (`/box-sets` endpoint) has:
- `id` — unique identifier (e.g. `boxset-uuid`)
- `name` — box set title (e.g. "Stanley Kubrick: The Masterpiece Collection")
- `format` — physical format: `Blu-ray`, `4K UHD`, `DVD`, `VHS`, etc.
- `box_set_type` — collection type label (e.g. "Director's Collection", "Criterion", "Limited Edition")
- `edition` — edition name (e.g. "Criterion #42", "Steelbook")
- `region` — region code (e.g. "A", "B", "Free")
- `package_type` — packaging (e.g. "Digipak", "Slipcase", "Standard")
- `notes` — free text notes
- `has_slipcover`, `has_booklet`, `has_bonus_disc`, `has_digital_copy`, `has_3d` — boolean flags
- `bonus_disc_count` — number of bonus discs
- `spine_image` — URL of spine/cover image
- `movies` — array of films in the box set, each with:
  - `title`, `year`, `tmdb_id`, `imdb_id`
  - `disc_number`, `disc_label`, `position`, `is_present`
  - `umdb_release_id` — links to a specific physical release record

## Required Features for the Box Sets Page/Tab

### 1. List View (browseable, searchable)
- Show all box sets as cards or rows
- Display: name, format, film count, cover/spine image thumbnail
- Search/filter by name, format, box_set_type
- Sort by name, format, film count, date added
- Each card links to the detail/edit view

### 2. Detail View
- Show all box set fields listed above
- Show the full list of films inside (title, year, disc, position)
- Show the spine/cover image if available
- All fields must be **editable inline** — no read-only restrictions
- Include an **Edit** button / inline edit mode for every field

### 3. Edit Capabilities (everything should be editable)
- Edit box set name, format, edition, region, package_type, box_set_type, notes
- Toggle boolean flags (slipcover, booklet, bonus disc, digital copy, 3D)
- Edit bonus_disc_count
- Upload or change spine/cover image
- **Edit movies in the box set:**
  - Add a film (by title/year search or TMDB ID)
  - Remove a film
  - Edit disc_number, disc_label, position, is_present for each film
- **No fields should be locked or read-only**

### 4. Create New Box Set
- A "New Box Set" button on the list page
- Form with all fields (name required, rest optional)
- Ability to add films during creation

### 5. Delete Box Set
- Delete button with confirmation on the detail view

### 6. API Endpoints Needed (if not already present)
- `GET /box-sets` — list all box sets (with pagination/search)
- `GET /box-sets/{id}` — get single box set with full film list
- `POST /box-sets` — create new box set
- `PUT /box-sets/{id}` — update box set fields
- `DELETE /box-sets/{id}` — delete box set
- `POST /box-sets/{id}/movies` — add a film to the box set
- `DELETE /box-sets/{id}/movies/{movie_id}` — remove a film
- `PUT /box-sets/{id}/movies/{movie_id}` — update disc/position/presence
- `POST /box-sets/{id}/create-releases` — auto-create UMDB physical releases for each film (already exists)

## Context: How CineShelf Uses Box Sets

CineShelf (a collector app) pushes box sets to UMDB via `POST /box-sets` with all films included. Films are linked by `tmdb_id` or `imdb_id`. After creating a box set, CineShelf calls `/box-sets/{id}/create-releases` to auto-create release records for each film.

The box set list/detail view in UMDB would allow the UMDB admin (me) to:
- Verify the data came through correctly
- Fix any mapping errors (wrong film, wrong disc number, etc.)
- Enrich the data (add missing images, fix edition names)
- Make the box sets browsable by other collectors

## Design Notes
- Match existing UMDB UI style
- Use inline editing where possible (click to edit a field)
- Show UMDB IDs (boxset-xxx, rel-xxx) for each item for debugging/reference
- Keep it simple — a clean list + detail page is fine

---

Thank you! Let me know what you build and I'll test it from CineShelf.
