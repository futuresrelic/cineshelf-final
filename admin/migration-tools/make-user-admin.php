<?php
/**
 * Make Current OAuth User Admin
 * Run this once after first OAuth login to grant admin access
 */

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../auth-middleware.php';

session_start();

echo "<!DOCTYPE html><html><head><title>Make User Admin</title>";
echo "<style>body{font-family:monospace;padding:20px;background:#1a1a1a;color:#fff;}";
echo ".success{color:#4caf50;} .error{color:#f44336;} .info{color:#2196f3;}
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

echo "<h1>🔐 Make Current User Admin</h1>";
echo "<p class='info'>This will grant admin privileges to the currently logged-in OAuth user.</p><hr>";

try {
    // Check if user is logged in
    $currentUser = authenticateRequest();

    echo "<h3>Current User:</h3>";
    echo "<ul>";
    echo "<li><strong>Username:</strong> " . htmlspecialchars($currentUser['username']) . "</li>";
    echo "<li><strong>Email:</strong> " . htmlspecialchars($currentUser['email'] ?? 'Not set') . "</li>";
    echo "<li><strong>User ID:</strong> " . $currentUser['id'] . "</li>";
    echo "<li><strong>Current Admin Status:</strong> " . ($currentUser['is_admin'] ? 'Yes ✓' : 'No ✗') . "</li>";
    echo "</ul>";

    if ($currentUser['is_admin']) {
        echo "<p class='success'>✓ You are already an admin!</p>";
    } else {
        echo "<h3>Granting Admin Access...</h3>";

        $db = getDb();
        $stmt = $db->prepare('UPDATE users SET is_admin = 1 WHERE id = ?');
        $stmt->execute([$currentUser['id']]);

        echo "<p class='success'>✓ Admin access granted!</p>";
        echo "<p>You now have admin privileges. Refresh the Group Manager to see all groups.</p>";
    }

    echo "<hr><h2 class='success'>✅ COMPLETE</h2>";
    echo "<p><a href='../group-manager.html' class='back-btn'>→ Go to Group Manager</a></p>";

} catch (Exception $e) {
    echo "<h2 class='error'>❌ ERROR</h2>";
    echo "<p class='error'>" . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p>Make sure you are logged in with Google OAuth first.</p>";
    echo "<p><a href='/login.html' class='back-btn'>→ Login with Google</a></p>";
}

echo "</body></html>";
?>
