<?php
/**
 * CineShelf Database Status Checker
 * Verifies data integrity and shows health report
 */
require_once __DIR__ . '/../../config/config.php';

// Password protect
$password = 'indeed'; // CHANGE THIS!
if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: status-check.php?pass=your_password');
}

try {
    $db = getDb();
    
    echo "<style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a1a; color: #fff; padding: 20px; line-height: 1.6; }
        .card { background: #2a2a2a; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #4caf50; }
        .card.warning { border-left-color: #ff9800; }
        .card.error { border-left-color: #f44336; }
        .success { color: #4caf50; }
        .error { color: #f44336; }
        .warning { color: #ff9800; }
        .info { color: #2196f3; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #444; }
        th { background: #333; font-weight: 600; }
        tr:hover { background: #333; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-box { background: #333; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 2.5rem; font-weight: bold; margin: 10px 0; }
        .stat-label { color: #aaa; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px; }
        h1 { color: #fff; border-bottom: 3px solid #4caf50; padding-bottom: 10px; }
        h2 { color: #fff; margin-top: 30px; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }
        .badge-success { background: #4caf50; color: white; }
        .badge-warning { background: #ff9800; color: white; }
        .badge-error { background: #f44336; color: white; }
        .badge-info { background: #2196f3; color: white; }
        .progress-bar { background: #333; height: 20px; border-radius: 10px; overflow: hidden; margin: 10px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); transition: width 0.3s; }
            .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style>";
    
    echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a><h1>📊 CineShelf Database Status Report</h1>";
    echo "<p style='color: #aaa;'>Generated: " . date('Y-m-d H:i:s') . "</p>";
    
    // ========================================
    // OVERALL HEALTH SCORE
    // ========================================
    
    $healthScore = 100;
    $issues = [];
    
    // ========================================
    // STATISTICS OVERVIEW
    // ========================================
    
    echo "<h2>📈 Collection Overview</h2>";
    
    $stats = [];
    
    // Total movies
    $stmt = $db->query("SELECT COUNT(*) FROM movies");
    $stats['total_movies'] = $stmt->fetchColumn();
    
    // Resolved movies
    $stmt = $db->query("SELECT COUNT(*) FROM movies WHERE tmdb_id NOT LIKE 'unresolved_%'");
    $stats['resolved_movies'] = $stmt->fetchColumn();
    
    // Unresolved movies
    $stmt = $db->query("SELECT COUNT(*) FROM movies WHERE tmdb_id LIKE 'unresolved_%'");
    $stats['unresolved_movies'] = $stmt->fetchColumn();
    
    // Total copies
    $stmt = $db->query("SELECT COUNT(*) FROM copies");
    $stats['total_copies'] = $stmt->fetchColumn();
    
    // Users
    $stmt = $db->query("SELECT COUNT(*) FROM users");
    $stats['total_users'] = $stmt->fetchColumn();
    
    // Calculate resolution percentage
    $resolutionPct = $stats['total_movies'] > 0 ? round(($stats['resolved_movies'] / $stats['total_movies']) * 100, 1) : 0;
    
    echo "<div class='stat-grid'>";
    
    echo "<div class='stat-box'>";
    echo "<div class='stat-label'>Total Movies</div>";
    echo "<div class='stat-number'>" . $stats['total_movies'] . "</div>";
    echo "</div>";
    
    echo "<div class='stat-box'>";
    echo "<div class='stat-label'>Resolved</div>";
    echo "<div class='stat-number success'>" . $stats['resolved_movies'] . "</div>";
    echo "</div>";
    
    echo "<div class='stat-box'>";
    echo "<div class='stat-label'>Unresolved</div>";
    echo "<div class='stat-number " . ($stats['unresolved_movies'] > 0 ? 'warning' : 'success') . "'>" . $stats['unresolved_movies'] . "</div>";
    echo "</div>";
    
    echo "<div class='stat-box'>";
    echo "<div class='stat-label'>Total Copies</div>";
    echo "<div class='stat-number'>" . $stats['total_copies'] . "</div>";
    echo "</div>";
    
    echo "</div>";
    
    // Resolution progress bar
    echo "<div style='margin: 30px 0;'>";
    echo "<div style='display: flex; justify-content: space-between; margin-bottom: 5px;'>";
    echo "<span style='font-weight: 600;'>Resolution Progress</span>";
    echo "<span style='font-weight: 600; color: #4caf50;'>{$resolutionPct}%</span>";
    echo "</div>";
    echo "<div class='progress-bar'>";
    echo "<div class='progress-fill' style='width: {$resolutionPct}%;'></div>";
    echo "</div>";
    echo "</div>";
    
    // ========================================
    // DATA QUALITY CHECKS
    // ========================================
    
    echo "<h2>🔍 Data Quality Checks</h2>";
    
    // Check 1: Movies with complete data
    $stmt = $db->query("
        SELECT COUNT(*) 
        FROM movies 
        WHERE title != 'Unknown' 
          AND title IS NOT NULL 
          AND title != ''
          AND tmdb_id NOT LIKE 'unresolved_%'
    ");
    $completeMovies = $stmt->fetchColumn();
    $completePct = $stats['resolved_movies'] > 0 ? round(($completeMovies / $stats['resolved_movies']) * 100, 1) : 0;
    
    echo "<div class='card'>";
    echo "<h3>✅ Movies with Complete Data</h3>";
    echo "<p><strong>{$completeMovies}</strong> out of {$stats['resolved_movies']} resolved movies have complete titles and data ({$completePct}%)</p>";
    if ($completePct >= 95) {
        echo "<span class='badge badge-success'>Excellent</span>";
    } elseif ($completePct >= 80) {
        echo "<span class='badge badge-warning'>Good</span>";
    } else {
        echo "<span class='badge badge-error'>Needs Attention</span>";
        $healthScore -= 10;
        $issues[] = "Some resolved movies missing complete data";
    }
    echo "</div>";
    
    // Check 2: Corrupted titles
    $stmt = $db->query("
        SELECT COUNT(*) 
        FROM movies 
        WHERE title LIKE '%,%'
    ");
    $corruptedTitles = $stmt->fetchColumn();
    
    echo "<div class='card" . ($corruptedTitles > 0 ? " warning" : "") . "'>";
    echo "<h3>" . ($corruptedTitles > 0 ? "⚠️" : "✅") . " Corrupted Titles Check</h3>";
    if ($corruptedTitles > 0) {
        echo "<p class='warning'><strong>{$corruptedTitles}</strong> movies still have commas in their titles</p>";
        echo "<span class='badge badge-warning'>Needs Cleanup</span>";
        echo "<p><a href='fix-corrupted-titles.php?pass={$password}' style='color: #2196f3;'>→ Run fix-corrupted-titles.php again</a></p>";
        $healthScore -= 5;
        $issues[] = "{$corruptedTitles} corrupted titles remain";
    } else {
        echo "<p class='success'>No corrupted titles found - all clean!</p>";
        echo "<span class='badge badge-success'>Perfect</span>";
    }
    echo "</div>";
    
    // Check 3: Duplicates
    $stmt = $db->query("
        SELECT COUNT(*) as dupe_count
        FROM (
            SELECT movie_id, user_id, format, edition, COUNT(*) as cnt
            FROM copies
            GROUP BY user_id, movie_id, format, COALESCE(edition, ''), COALESCE(region, '')
            HAVING cnt > 1
        )
    ");
    $duplicateSets = $stmt->fetchColumn();
    
    echo "<div class='card" . ($duplicateSets > 0 ? " warning" : "") . "'>";
    echo "<h3>" . ($duplicateSets > 0 ? "⚠️" : "✅") . " Duplicate Copies Check</h3>";
    if ($duplicateSets > 0) {
        echo "<p class='warning'><strong>{$duplicateSets}</strong> sets of duplicate copies found</p>";
        echo "<span class='badge badge-warning'>Needs Cleanup</span>";
        echo "<p><a href='remove-duplicates.php?pass={$password}' style='color: #2196f3;'>→ Run remove-duplicates.php again</a></p>";
        $healthScore -= 5;
        $issues[] = "{$duplicateSets} duplicate sets remain";
    } else {
        echo "<p class='success'>No duplicate copies found!</p>";
        echo "<span class='badge badge-success'>Perfect</span>";
    }
    echo "</div>";
    
    // Check 4: Unknown titles in resolved movies
    $stmt = $db->query("
        SELECT COUNT(*) 
        FROM movies 
        WHERE title = 'Unknown' 
          AND tmdb_id NOT LIKE 'unresolved_%'
    ");
    $unknownResolved = $stmt->fetchColumn();
    
    echo "<div class='card" . ($unknownResolved > 0 ? " warning" : "") . "'>";
    echo "<h3>" . ($unknownResolved > 0 ? "⚠️" : "✅") . " 'Unknown' Titles in Resolved Movies</h3>";
    if ($unknownResolved > 0) {
        echo "<p class='warning'><strong>{$unknownResolved}</strong> resolved movies still show 'Unknown' as title</p>";
        echo "<span class='badge badge-warning'>Fixable</span>";
        echo "<p><a href='fix-unknown-titles-v2.php?pass={$password}' style='color: #2196f3;'>→ Run fix-unknown-titles-v2.php again</a></p>";
        $healthScore -= 10;
        $issues[] = "{$unknownResolved} resolved movies with 'Unknown' titles";
    } else {
        echo "<p class='success'>All resolved movies have proper titles!</p>";
        echo "<span class='badge badge-success'>Perfect</span>";
    }
    echo "</div>";
    
    // ========================================
    // MEDIA TYPE BREAKDOWN
    // ========================================
    
    echo "<h2>🎬 Media Type Breakdown</h2>";
    
    $stmt = $db->query("
        SELECT 
            COALESCE(media_type, 'movie') as type,
            COUNT(*) as count
        FROM movies
        WHERE tmdb_id NOT LIKE 'unresolved_%'
        GROUP BY media_type
    ");
    
    echo "<table>";
    echo "<tr><th>Type</th><th>Count</th><th>Percentage</th></tr>";
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $pct = $stats['resolved_movies'] > 0 ? round(($row['count'] / $stats['resolved_movies']) * 100, 1) : 0;
        $icon = $row['type'] === 'tv' ? '📺' : '🎬';
        echo "<tr>";
        echo "<td>{$icon} " . ucfirst($row['type']) . "</td>";
        echo "<td><strong>{$row['count']}</strong></td>";
        echo "<td>{$pct}%</td>";
        echo "</tr>";
    }
    
    echo "</table>";
    
    // ========================================
    // FORMAT BREAKDOWN
    // ========================================
    
    echo "<h2>💿 Format Breakdown</h2>";
    
    $stmt = $db->query("
        SELECT format, COUNT(*) as count
        FROM copies
        GROUP BY format
        ORDER BY count DESC
    ");
    
    echo "<table>";
    echo "<tr><th>Format</th><th>Copies</th><th>Percentage</th></tr>";
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $pct = $stats['total_copies'] > 0 ? round(($row['count'] / $stats['total_copies']) * 100, 1) : 0;
        echo "<tr>";
        echo "<td>{$row['format']}</td>";
        echo "<td><strong>{$row['count']}</strong></td>";
        echo "<td>{$pct}%</td>";
        echo "</tr>";
    }
    
    echo "</table>";
    
    // ========================================
    // TOP RATED MOVIES
    // ========================================
    
    echo "<h2>⭐ Top 10 Highest Rated Movies</h2>";
    
    $stmt = $db->query("
        SELECT title, year, rating, media_type
        FROM movies
        WHERE rating IS NOT NULL
          AND tmdb_id NOT LIKE 'unresolved_%'
        ORDER BY rating DESC
        LIMIT 10
    ");
    
    echo "<table>";
    echo "<tr><th>Title</th><th>Year</th><th>Rating</th></tr>";
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $icon = $row['media_type'] === 'tv' ? '📺' : '🎬';
        echo "<tr>";
        echo "<td>{$icon} {$row['title']}</td>";
        echo "<td>{$row['year']}</td>";
        echo "<td>⭐ " . number_format($row['rating'], 1) . "</td>";
        echo "</tr>";
    }
    
    echo "</table>";
    
    // ========================================
    // UNRESOLVED MOVIES SAMPLE
    // ========================================
    
    if ($stats['unresolved_movies'] > 0) {
        echo "<h2>❓ Sample of Unresolved Movies (First 20)</h2>";
        
        $stmt = $db->query("
            SELECT id, title, tmdb_id
            FROM movies
            WHERE tmdb_id LIKE 'unresolved_%'
            ORDER BY title
            LIMIT 20
        ");
        
        echo "<table>";
        echo "<tr><th>ID</th><th>Title</th><th>Status</th></tr>";
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo "<tr>";
            echo "<td>{$row['id']}</td>";
            echo "<td>{$row['title']}</td>";
            echo "<td><span class='badge badge-warning'>Unresolved</span></td>";
            echo "</tr>";
        }
        
        echo "</table>";
        
        echo "<p><a href='/#resolve' style='color: #2196f3;'>→ Go to Resolve tab to match these movies</a></p>";
    }
    
    // ========================================
    // OVERALL HEALTH SCORE
    // ========================================
    
    echo "<h2>💯 Overall Database Health</h2>";
    
    $healthColor = $healthScore >= 90 ? 'success' : ($healthScore >= 70 ? 'warning' : 'error');
    $healthLabel = $healthScore >= 90 ? 'Excellent' : ($healthScore >= 70 ? 'Good' : 'Needs Work');
    
    echo "<div class='card'>";
    echo "<div style='text-align: center;'>";
    echo "<div class='stat-number {$healthColor}'>{$healthScore}/100</div>";
    echo "<div class='stat-label'>{$healthLabel}</div>";
    echo "</div>";
    
    if (count($issues) > 0) {
        echo "<h3 style='margin-top: 20px;'>Issues Found:</h3>";
        echo "<ul>";
        foreach ($issues as $issue) {
            echo "<li class='warning'>{$issue}</li>";
        }
        echo "</ul>";
    } else {
        echo "<p class='success' style='text-align: center; font-size: 1.2rem; margin-top: 20px;'>🎉 No issues found! Your database is in excellent shape!</p>";
    }
    
    echo "</div>";
    
    // ========================================
    // RECOMMENDATIONS
    // ========================================
    
    echo "<h2>💡 Recommendations</h2>";
    
    echo "<div class='card'>";
    
    if ($stats['unresolved_movies'] > 0) {
        echo "<p>📝 You have <strong>{$stats['unresolved_movies']}</strong> unresolved movies. Visit the <a href='/#resolve' style='color: #2196f3;'>Resolve tab</a> to match them with TMDB data.</p>";
    }
    
    if ($duplicateSets > 0) {
        echo "<p>🗑️ Remove <strong>{$duplicateSets}</strong> duplicate sets using <a href='remove-duplicates.php?pass={$password}' style='color: #2196f3;'>remove-duplicates.php</a></p>";
    }
    
    if ($corruptedTitles > 0) {
        echo "<p>🔧 Fix <strong>{$corruptedTitles}</strong> corrupted titles using <a href='fix-corrupted-titles.php?pass={$password}' style='color: #2196f3;'>fix-corrupted-titles.php</a></p>";
    }
    
    if ($unknownResolved > 0) {
        echo "<p>🔍 Fetch data for <strong>{$unknownResolved}</strong> movies using <a href='fix-unknown-titles-v2.php?pass={$password}' style='color: #2196f3;'>fix-unknown-titles-v2.php</a></p>";
    }
    
    if ($healthScore >= 95) {
        echo "<p class='success'>✨ Your database is in excellent condition! Just resolve the remaining unmatched movies and you're all set!</p>";
    }
    
    echo "</div>";
    
    // ========================================
    // ACTIONS
    // ========================================
    
    echo "<div style='margin-top: 40px; padding: 20px; background: #2a2a2a; border-radius: 8px;'>";
    echo "<h3>Quick Actions</h3>";
    echo "<div style='display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px;'>";
    echo "<a href='/' style='padding: 10px 20px; background: #4caf50; color: white; text-decoration: none; border-radius: 4px;'>🏠 Back to CineShelf</a>";
    echo "<a href='?pass={$password}' style='padding: 10px 20px; background: #2196f3; color: white; text-decoration: none; border-radius: 4px;'>🔄 Refresh Status</a>";
    echo "<a href='view-database.php?pass={$password}' style='padding: 10px 20px; background: #ff9800; color: white; text-decoration: none; border-radius: 4px;'>📊 View Raw Database</a>";
    echo "</div>";
    echo "</div>";
    
} catch (Exception $e) {
    echo "<div style='background: #f44336; color: white; padding: 20px; border-radius: 8px; margin: 20px 0;'>";
    echo "<h2>❌ Error</h2>";
    echo "<pre>" . htmlspecialchars($e->getMessage()) . "</pre>";
    echo "</div>";
}
?>
