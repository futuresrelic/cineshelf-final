-- Grant admin privileges to your user account
-- Run this SQL on your Railway database

-- Option 1: If you know your username
-- UPDATE users SET is_admin = 1 WHERE username = 'your_username_here';

-- Option 2: Make the first user an admin (safest for single-user setups)
UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users);

-- Verify admin status
SELECT id, username, email, is_admin, created_at FROM users;
