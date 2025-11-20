<?php
/**
 * CineShelf - Trivia System Migration
 * Adds trivia tables to existing databases
 */

require_once __DIR__ . '/../config/config.php';

try {
    $db = getDb();

    echo "Starting trivia migration...\n";

    // Check if trivia tables already exist
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='trivia_games'");
    if ($stmt->fetch()) {
        echo "Trivia tables already exist. Migration not needed.\n";
        exit(0);
    }

    // Read and execute trivia schema
    $schema = file_get_contents(__DIR__ . '/schema.sql');

    // Extract only trivia-related CREATE TABLE statements
    preg_match_all('/-- Trivia.*?(?=(?:--|$))/s', $schema, $matches);

    if (empty($matches[0])) {
        echo "No trivia schema found. Reading full schema...\n";
        // Execute the trivia portion of schema
        $triviaStart = strpos($schema, '-- TRIVIA SYSTEM TABLES');
        if ($triviaStart !== false) {
            $triviaSchema = substr($schema, $triviaStart);
            $db->exec($triviaSchema);
        }
    }

    echo "Trivia migration completed successfully!\n";
    echo "Created tables: trivia_games, trivia_questions, trivia_stats\n";

} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
