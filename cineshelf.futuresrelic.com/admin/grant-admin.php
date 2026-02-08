<?php
/**
 * One-time admin grant script
 * This page allows you to grant admin privileges to a user
 * For security, it only works if NO admins exist yet
 */

require_once __DIR__ . '/../api/db.php';

// Security: Only allow if no admins exist
$db = getDb();
$adminCount = $db->query("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")->fetch()['count'];

if ($adminCount > 0) {
    die('<h1>⚠️ Admin Already Exists</h1><p>For security, this page is disabled because admin users already exist. Contact your database administrator to grant admin privileges.</p>');
}

// Get all users
$users = $db->query("SELECT id, username, email, oauth_provider, created_at FROM users ORDER BY id ASC")->fetchAll();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['user_id'])) {
    $userId = intval($_POST['user_id']);

    // Verify user exists
    $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if ($user) {
        // Grant admin
        $db->prepare("UPDATE users SET is_admin = 1 WHERE id = ?")->execute([$userId]);

        echo '<!DOCTYPE html>
        <html>
        <head>
            <title>Admin Granted - CineShelf</title>
            <style>
                body { font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 20px; border-radius: 8px; }
                .btn { background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="success">
                <h1>✅ Admin Privileges Granted!</h1>
                <p><strong>' . htmlspecialchars($user['username']) . '</strong> is now an admin.</p>
                <p>You can now run the box set migration.</p>
            </div>
            <a href="/admin/run-box-set-migration.html" class="btn">→ Run Box Set Migration</a>
        </body>
        </html>';
        exit;
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <title>Grant Admin Access - CineShelf</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 3rem;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #333; margin-bottom: 1rem; }
        .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 1rem;
            margin-bottom: 2rem;
            border-radius: 4px;
        }
        .user-list {
            list-style: none;
            padding: 0;
        }
        .user-item {
            border: 2px solid #e0e0e0;
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 8px;
            transition: border-color 0.2s;
        }
        .user-item:hover {
            border-color: #667eea;
        }
        .user-item strong {
            font-size: 1.1rem;
            color: #333;
        }
        .user-item small {
            color: #666;
            display: block;
            margin-top: 0.5rem;
        }
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            font-size: 1rem;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            width: 100%;
            margin-top: 0.5rem;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔑 Grant Admin Access</h1>

        <div class="warning">
            <strong>⚠️ First-Time Setup</strong>
            <p style="margin: 0.5rem 0 0 0;">This page allows you to grant admin privileges to one user. After the first admin is created, this page will be disabled for security.</p>
        </div>

        <?php if (empty($users)): ?>
            <p style="color: #721c24; background: #f8d7da; padding: 1rem; border-radius: 6px;">
                <strong>No users found!</strong> Please create a user account first by logging into CineShelf.
            </p>
        <?php else: ?>
            <p style="margin-bottom: 1.5rem;">Select a user to grant admin privileges:</p>

            <form method="POST">
                <ul class="user-list">
                    <?php foreach ($users as $user): ?>
                        <li class="user-item">
                            <strong><?= htmlspecialchars($user['username']) ?></strong>
                            <?php if ($user['email']): ?>
                                <small>📧 <?= htmlspecialchars($user['email']) ?></small>
                            <?php endif; ?>
                            <small>🗓️ Created: <?= date('M j, Y', strtotime($user['created_at'])) ?></small>
                            <button type="submit" name="user_id" value="<?= $user['id'] ?>" class="btn">
                                Make Admin ✓
                            </button>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </form>
        <?php endif; ?>
    </div>
</body>
</html>
