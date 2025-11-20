# Backend API Updates Required for v2.2.0

Your frontend is updated to v2.2.0, but your backend API is missing the new endpoints. Add these to `/api/api.php`.

---

## 1. Add `get_group` Action

**Insert after line 811 (after `list_groups` case):**

```php
        case 'get_group':
            $groupId = $data['group_id'] ?? null;

            if (!$groupId) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is a member of this group
            $stmt = $db->prepare("
                SELECT COUNT(*)
                FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);

            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, null, 'Not a member of this group');
            }

            // Get group details with members
            $stmt = $db->prepare("
                SELECT
                    g.id,
                    g.name,
                    g.description,
                    g.created_at,
                    g.created_by,
                    u.username as creator_name
                FROM groups g
                JOIN users u ON g.created_by = u.id
                WHERE g.id = ?
            ");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();

            if (!$group) {
                jsonResponse(false, null, 'Group not found');
            }

            // Get all members
            $stmt = $db->prepare("
                SELECT
                    gm.user_id,
                    u.username,
                    u.display_name,
                    u.email,
                    gm.role,
                    gm.joined_at
                FROM group_members gm
                JOIN users u ON gm.user_id = u.id
                WHERE gm.group_id = ?
                ORDER BY gm.role DESC, u.username ASC
            ");
            $stmt->execute([$groupId]);
            $group['members'] = $stmt->fetchAll();

            jsonResponse(true, $group);
            break;
```

---

## 2. Add `get_user_wishlist` Action

**Insert after the `get_group` case:**

```php
        case 'get_user_wishlist':
            $targetUserId = $data['user_id'] ?? null;

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            // Check if requester shares a group with target user
            $stmt = $db->prepare("
                SELECT COUNT(*)
                FROM group_members gm1
                JOIN group_members gm2 ON gm1.group_id = gm2.group_id
                WHERE gm1.user_id = ? AND gm2.user_id = ?
            ");
            $stmt->execute([$userId, $targetUserId]);

            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, null, 'You must share a group with this user to view their wishlist');
            }

            // Get user's wishlist
            $stmt = $db->prepare("
                SELECT
                    w.id,
                    w.tmdb_id,
                    w.title,
                    w.year,
                    w.poster_path,
                    w.release_date,
                    w.added_at
                FROM wishlist w
                WHERE w.user_id = ?
                ORDER BY w.added_at DESC
            ");
            $stmt->execute([$targetUserId]);

            jsonResponse(true, $stmt->fetchAll());
            break;
```

---

## 3. Add `trivia_group_leaderboard` Action

**Insert after line 1680 (after `trivia_get_history` case):**

```php
        case 'trivia_group_leaderboard':
            $groupId = $data['group_id'] ?? null;

            if (!$groupId) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is a member
            $stmt = $db->prepare("
                SELECT COUNT(*)
                FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);

            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, null, 'Not a member of this group');
            }

            // Get leaderboard for group members
            $stmt = $db->prepare("
                SELECT
                    u.id as user_id,
                    u.username,
                    u.display_name,
                    COUNT(tg.id) as total_games,
                    MAX(tg.score) as best_score,
                    ROUND(AVG(CASE WHEN tq.correct = 1 THEN 100 ELSE 0 END), 1) as accuracy,
                    ROUND(AVG(tg.score), 1) as average_score
                FROM users u
                JOIN group_members gm ON u.id = gm.user_id
                LEFT JOIN trivia_games tg ON u.id = tg.user_id AND tg.completed = 1
                LEFT JOIN trivia_questions tq ON tg.id = tq.game_id
                WHERE gm.group_id = ?
                GROUP BY u.id
                HAVING total_games > 0
                ORDER BY best_score DESC, accuracy DESC
                LIMIT 100
            ");
            $stmt->execute([$groupId]);

            jsonResponse(true, $stmt->fetchAll());
            break;
```

---

## 4. Add `trivia_global_leaderboard` Action

**Insert after the `trivia_group_leaderboard` case:**

```php
        case 'trivia_global_leaderboard':
            $limit = $data['limit'] ?? 100;

            // Get global leaderboard
            $stmt = $db->prepare("
                SELECT
                    u.id as user_id,
                    u.username,
                    u.display_name,
                    COUNT(tg.id) as total_games,
                    MAX(tg.score) as best_score,
                    ROUND(AVG(CASE WHEN tq.correct = 1 THEN 100 ELSE 0 END), 1) as accuracy,
                    ROUND(AVG(tg.score), 1) as average_score
                FROM users u
                LEFT JOIN trivia_games tg ON u.id = tg.user_id AND tg.completed = 1
                LEFT JOIN trivia_questions tq ON tg.id = tq.game_id
                GROUP BY u.id
                HAVING total_games > 0
                ORDER BY best_score DESC, accuracy DESC
                LIMIT ?
            ");
            $stmt->execute([$limit]);

            jsonResponse(true, $stmt->fetchAll());
            break;
```

---

## How to Apply These Updates

1. **Download your current `/api/api.php` from your server**

2. **Open it in a text editor**

3. **Find the switch statement** (around line 46)

4. **Add each new case** in the appropriate location:
   - `get_group` and `get_user_wishlist` → After `list_groups` (line ~811)
   - `trivia_group_leaderboard` and `trivia_global_leaderboard` → After `trivia_get_history` (line ~1680)

5. **Upload the updated file back to your server**

6. **Test the features**:
   - Group Wishlist should now load
   - Trivia Leaderboards should display rankings

---

## Quick Test

After updating, test in browser console:

```javascript
// Test get_group
fetch('/api/api.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    credentials: 'include',
    body: JSON.stringify({
        action: 'get_group',
        group_id: 1  // Replace with your group ID
    })
}).then(r => r.json()).then(console.log);

// Test global leaderboard
fetch('/api/api.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    credentials: 'include',
    body: JSON.stringify({
        action: 'trivia_global_leaderboard',
        limit: 10
    })
}).then(r => r.json()).then(console.log);
```

---

## Summary

You need to add **4 new API endpoints**:

1. ✅ `get_group` - Get group details with members
2. ✅ `get_user_wishlist` - Get another user's wishlist (within shared groups)
3. ✅ `trivia_group_leaderboard` - Rankings for group members
4. ✅ `trivia_global_leaderboard` - Global top 100 rankings

After adding these, your Group Wishlist and Trivia Leaderboards will work perfectly! 🎉
