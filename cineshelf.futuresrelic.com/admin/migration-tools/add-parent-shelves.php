<?php
/**
 * Migration: Add Parent Shelf Support
 * Adds parent_shelf_id column to shelves table for hierarchical organization
 */

require_once __DIR__ . '/../../config/config.php';

header('Content-Type: application/json');

try {
    $db = getDb();

    // Check if column already exists
    $stmt = $db->query("PRAGMA table_info(shelves)");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $hasParentShelfId = false;

    foreach ($columns as $column) {
        if ($column['name'] === 'parent_shelf_id') {
            $hasParentShelfId = true;
            break;
        }
    }

    if ($hasParentShelfId) {
        echo json_encode([
            'success' => true,
            'message' => 'parent_shelf_id column already exists',
            'already_exists' => true
        ]);
        exit;
    }

    // Add parent_shelf_id column
    $db->exec("
        ALTER TABLE shelves
        ADD COLUMN parent_shelf_id INTEGER DEFAULT NULL
        REFERENCES shelves(id) ON DELETE SET NULL
    ");

    // Create index for parent shelf lookups
    $db->exec("
        CREATE INDEX IF NOT EXISTS idx_shelves_parent
        ON shelves(parent_shelf_id)
    ");

    echo json_encode([
        'success' => true,
        'message' => 'Parent shelf support added successfully',
        'changes' => [
            'Added parent_shelf_id column to shelves table',
            'Created index on parent_shelf_id for performance'
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
