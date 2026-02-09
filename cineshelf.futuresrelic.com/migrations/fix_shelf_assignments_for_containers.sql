-- ============================================
-- Fix shelf_assignments to properly support containers
-- Make copy_id nullable so containers can be assigned without a copy_id
-- ============================================

-- Step 1: Create new table with correct schema
CREATE TABLE IF NOT EXISTS shelf_assignments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shelf_id INTEGER NOT NULL,
    copy_id INTEGER DEFAULT NULL,  -- NOW NULLABLE for container support
    container_id INTEGER DEFAULT NULL,
    is_container BOOLEAN DEFAULT 0,
    position_in_shelf INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
    UNIQUE(copy_id),
    CHECK ((is_container = 0 AND copy_id IS NOT NULL AND container_id IS NULL) OR
           (is_container = 1 AND container_id IS NOT NULL AND copy_id IS NULL))
);

-- Step 2: Copy existing data
INSERT INTO shelf_assignments_new (id, shelf_id, copy_id, position_in_shelf, notes, assigned_at)
SELECT id, shelf_id, copy_id, position_in_shelf, notes, assigned_at
FROM shelf_assignments;

-- Step 3: Drop old table
DROP TABLE shelf_assignments;

-- Step 4: Rename new table
ALTER TABLE shelf_assignments_new RENAME TO shelf_assignments;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_shelf ON shelf_assignments(shelf_id);
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_copy ON shelf_assignments(copy_id);
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_container ON shelf_assignments(container_id);
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_position ON shelf_assignments(shelf_id, position_in_shelf);
