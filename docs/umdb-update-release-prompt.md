# UMDB: Update Release Endpoint + Duplicate Barcode Fix

**From:** CineShelf / Claude (the new guy 👋 — nice to meet you, UMDB Claude!)

---

## Background

CineShelf calls `POST /api/releases` to push physical editions to UMDB. This endpoint already supports **duplicate barcode detection**, returning `{ "duplicate": true, "edition": { "id": "rel-..." } }` when a matching barcode is found — great feature!

However, we've run into a real-world case where:

1. A user imported Amazon product data that reported the wrong format (Blu-ray instead of DVD)
2. They pushed this to UMDB → created release `rel-cmmwi8glp0001ha6r01gnjtba` as **Blu-ray**
3. They corrected the edition locally to **DVD** and deleted the old copy
4. They tried pushing the corrected DVD edition → UMDB detects same barcode → returns `duplicate: true` and links it to the old Blu-ray release
5. The UMDB record is now stuck showing **Blu-ray** even though the physical item is a **DVD**

---

## Requested Changes

### 1. `PUT /api/releases/:id` — Update an existing release

CineShelf already calls `PUT /api/box-sets/:id` for box-set updates. We need the same for releases.

**Endpoint:** `PUT /api/releases/:id`
**Auth:** `X-API-Key` header (same as all other authenticated endpoints)
**Body (all fields optional — only update what's sent):**

```json
{
  "name": "Monty Python And The Holy Grail (Bilingual) — DVD — 2 Discs",
  "format": "DVD",
  "package_type": "Keep Case",
  "region": "Region 1 (US/CA)",
  "barcode": "43396052765",
  "release_date": "2001-10-22",
  "distributor": "Sony Pictures Home Entertainment",
  "country": "USA",
  "disc_count": 2,
  "notes": ""
}
```

**Response (success):**
```json
{
  "ok": true,
  "release": {
    "id": "rel-cmmwi8glp0001ha6r01gnjtba",
    "name": "...",
    "format": "DVD",
    ...
  }
}
```

**Auth/ownership rules:** Only the user who created the release (or an admin) should be able to update it. Return 403 if unauthorized.

---

### 2. Smarter duplicate detection in `POST /api/releases`

**Current behavior:** Duplicate = same barcode, regardless of format.

**Problem:** A DVD and a Blu-ray of the same movie can (rarely) share a barcode in error, or more commonly, the same product was pushed once with the wrong format. Treating them as the same release forces the user to be stuck.

**Requested change:** When a duplicate barcode is found, also check `format`. If the incoming format **differs** from the existing release's format, treat it as a **new release** (not a duplicate).

```
Same barcode + same format  → duplicate: true  (existing behavior, correct)
Same barcode + diff format  → duplicate: false, create new release
```

This way, if someone has both a DVD and a Blu-ray of the same film with the same barcode (edge case but real), they can both exist in UMDB.

---

### 3. Context / How CineShelf calls these

CineShelf's PHP API helper `umdbPut($path, $body)` already exists and works for box-sets. We've added a new API case `update_umdb_release` in CineShelf that calls:

```
PUT /releases/{umdb_release_id}
```

with the payload above. This is already implemented on the CineShelf side and will work as soon as UMDB supports the endpoint.

**CineShelf also added on the UI side:**
- An **"Update ↑"** button next to "Sync ↓" for editions already linked to UMDB, so users can push local corrections up to UMDB at any time
- A prompt during `Push to UMDB` when a duplicate is detected: "Would you like to UPDATE the existing UMDB release with this edition's data?"

---

### 4. Specific release to fix (immediate)

The release `rel-cmmwi8glp0001ha6r01gnjtba` on UMDB currently shows as **Blu-ray** but should be **DVD**.

If you can update it directly in the admin/DB:
- **format:** `DVD`
- **name:** `Monty Python And The Holy Grail (Bilingual) — DVD — 2 Discs`
- (all other fields can stay as-is)

Or once the `PUT /releases/:id` endpoint exists, the user can click "Update ↑" in CineShelf and it will fix itself automatically.

---

Thanks! 🏆
