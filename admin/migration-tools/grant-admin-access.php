<?php
/**
 * Make User Admin by Email
 * Simple tool to grant admin access to an OAuth user
 */

// Show all errors
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../../config/config.php';

echo "<!DOCTYPE html><html><head><title>Make User Admin</title>";
echo "<style>body{font-family:monospace;padding:20px;background:#1a1a1a;color:#fff;}";
echo ".success{color:#4caf50;} .error{color:#f44336;} .info{color:#2196f3;}
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
        .form-group { margin: 1rem 0; }
        input { padding: 0.5rem; background: #2a2a2a; border: 1px solid #444; color: #fff; font-size: 1rem; width: 300px; }
        button { padding: 0.5rem 1rem; background: #4a9eff; color: white; border: none; cursor: pointer; font-size: 1rem; }
        button:hover { background: #6bb0ff; }
    </style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

echo "<h1>🔐 Grant Admin Access</h1>";
echo "<p class='info'>Enter the email address of the OAuth user you want to make an admin.</p><hr>";

try {
    $db = getDb();

    // Check if form was submitted
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['email'])) {
        $email = strtolower(trim($_POST['email']));

        echo "<h3>Searching for user with email: " . htmlspecialchars($email) . "</h3>";

        // Find user by email
        $stmt = $db->prepare('SELECT * FROM users WHERE LOWER(email) = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            echo "<p class='error'>✗ No user found with that email address.</p>";
            echo "<p>Make sure the user has logged in with Google at least once.</p>";
        } else {
            echo "<h3>Found User:</h3>";
            echo "<ul>";
            echo "<li><strong>Username:</strong> " . htmlspecialchars($user['username']) . "</li>";
            echo "<li><strong>Email:</strong> " . htmlspecialchars($user['email']) . "</li>";
            echo "<li><strong>User ID:</strong> " . $user['id'] . "</li>";
            echo "<li><strong>Current Admin Status:</strong> " . ($user['is_admin'] ? 'Yes ✓' : 'No ✗') . "</li>";
            echo "</ul>";

            if ($user['is_admin']) {
                echo "<p class='success'>✓ This user is already an admin!</p>";
            } else {
                echo "<h3>Granting Admin Access...</h3>";

                $stmt = $db->prepare('UPDATE users SET is_admin = 1 WHERE id = ?');
                $stmt->execute([$user['id']]);

                echo "<p class='success'>✓ Admin access granted to " . htmlspecialchars($user['username']) . "!</p>";
                echo "<p>This user can now access the Group Manager and admin tools.</p>";
            }

            echo "<hr><h2 class='success'>✅ COMPLETE</h2>";
            echo "<p><a href='../group-manager.html' class='back-btn'>→ Go to Group Manager</a></p>";
        }
    } else {
        // Show form
        echo "<h3>All Users in Database:</h3>";
        $stmt = $db->query('SELECT id, username, email, is_admin, oauth_provider, created_at FROM users ORDER BY created_at DESC');
        $users = $stmt->fetchAll();

        if (empty($users)) {
            echo "<p class='error'>No users found in database.</p>";
        } else {
            echo "<table style='width:100%; border-collapse: collapse; margin: 1rem 0;'>";
            echo "<tr style='border-bottom: 2px solid #444;'>";
            echo "<th style='text-align:left; padding: 0.5rem;'>ID</th>";
            echo "<th style='text-align:left; padding: 0.5rem;'>Username</th>";
            echo "<th style='text-align:left; padding: 0.5rem;'>Email</th>";
            echo "<th style='text-align:left; padding: 0.5rem;'>OAuth Provider</th>";
            echo "<th style='text-align:left; padding: 0.5rem;'>Admin</th>";
            echo "<th style='text-align:left; padding: 0.5rem;'>Created</th>";
            echo "</tr>";

            foreach ($users as $u) {
                echo "<tr style='border-bottom: 1px solid #333;'>";
                echo "<td style='padding: 0.5rem;'>" . $u['id'] . "</td>";
                echo "<td style='padding: 0.5rem;'>" . htmlspecialchars($u['username']) . "</td>";
                echo "<td style='padding: 0.5rem;'>" . htmlspecialchars($u['email'] ?? 'N/A') . "</td>";
                echo "<td style='padding: 0.5rem;'>" . htmlspecialchars($u['oauth_provider'] ?? 'legacy') . "</td>";
                echo "<td style='padding: 0.5rem;'>" . ($u['is_admin'] ? '✓ Yes' : '✗ No') . "</td>";
                echo "<td style='padding: 0.5rem;'>" . htmlspecialchars($u['created_at']) . "</td>";
                echo "</tr>";
            }

            echo "</table>";
        }

        echo "<hr><h3>Grant Admin Access:</h3>";
        echo "<form method='POST'>";
        echo "<div class='form-group'>";
        echo "<label>Email Address (Google Account):</label><br>";
        echo "<input type='email' name='email' placeholder='user@gmail.com' required>";
        echo "</div>";
        echo "<button type='submit'>Grant Admin Access</button>";
        echo "</form>";
    }

} catch (Exception $e) {
    echo "<h2 class='error'>❌ ERROR</h2>";
    echo "<p class='error'>" . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p>Stack trace:</p>";
    echo "<pre>" . htmlspecialchars($e->getTraceAsString()) . "</pre>";
}

echo "</body></html>";
?>