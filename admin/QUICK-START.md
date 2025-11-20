# CineShelf Admin Panel - Quick Start Guide

## 🎯 Access the Admin Panel

**URL:** `/admin/index.html`

---

## 🚀 Most Common Tasks

### 1️⃣ View Your Database
**Tool:** Database Tools → View Database
**URL:** `admin/database-tools/view-database.php?pass=indeed`
**Use for:** Browse all movies, users, and groups

### 2️⃣ Fix Missing Information
**Tool:** Data Tools → Auto-Fill Directors
**URL:** `admin/data-tools/fill-directors-AUTO.php?pass=indeed`
**Use for:** Automatically fetch missing directors from TMDB

### 3️⃣ Check System Health
**Tool:** Diagnostics → Status Check
**URL:** `admin/diagnostics/status-check.php?pass=indeed`
**Use for:** Verify everything is working correctly

### 4️⃣ Clean Up Duplicates
**Tool:** Database Tools → Remove Duplicates
**URL:** `admin/database-tools/remove-duplicates.php?pass=indeed`
**Use for:** Find and remove duplicate movie entries

### 5️⃣ Fix Cache Issues
**Tool:** Test Tools → Clear Cache
**URL:** `admin/test-tools/clear-cache.html`
**Use for:** Force refresh when app doesn't update

### 6️⃣ Manage Groups
**Tool:** Configuration → Group Manager
**URL:** `admin/group-manager.html`
**Use for:** View, edit, delete groups and manage members

---

## 🔑 Default Password

All PHP tools use password protection:
- **Default:** `indeed`
- **⚠️ CHANGE THIS** before deploying!
- Edit `$password = 'indeed';` in each PHP file

---

## 📊 Tool Categories

### 🗄️ Database Tools
- **View Database** - Browse all data
- **Check Schema** - Verify structure
- **Clean Database** - Optimize performance
- **Remove Duplicates** - Clean duplicates
- **Check Movie Data** - Quality check

### 📊 Data Tools
- **Auto-Fill Directors** - Fetch missing directors
- **Fill Certifications** - Add movie ratings
- **Fix Corrupted Titles** - Repair titles
- **Fix Unknown Titles** - Resolve unknowns
- **Add Metadata Columns** - Schema upgrades

### 🔄 Migration Tools
- **Migrate V1 to V2** - Major upgrade
- **Batch Migration** - Large collections
- **Add Groups Support** - Group features

### 🔍 Diagnostics
- **Status Check** - System health
- **Ultra Debug** - Deep troubleshooting

### 🧪 Test Tools
- **Test Database** - Interactive testing
- **Test Configuration** - Setup check
- **Cache Diagnostic** - PWA cache
- **Clear Cache** - Force refresh
- **Icon Editor/Generator** - PWA icons

---

## ⚡ Quick Actions

### Optimize Database
```
1. admin/database-tools/check-movie-data.php?pass=indeed
2. admin/database-tools/remove-duplicates.php?pass=indeed
3. admin/database-tools/clean-database.php?pass=indeed
```

### Enhance Data Quality
```
1. admin/data-tools/fix-unknown-titles-v2.php?pass=indeed
2. admin/data-tools/fill-directors-AUTO.php?pass=indeed
3. admin/data-tools/fill-directors-certs.php?pass=indeed
```

### Troubleshoot Issues
```
1. admin/diagnostics/status-check.php?pass=indeed
2. admin/test-tools/cache-diagnostic.html
3. admin/diagnostics/ultra-debug.php?pass=indeed
```

---

## 🆘 Common Problems

### "Config file not found"
→ Tool paths are broken. Verify you're accessing via web server.

### "Database locked"
→ Another process is using the database. Wait a moment and retry.

### "API key invalid"
→ Check `config/config.php` has valid TMDB API key.

### "Cache won't update"
→ Use `admin/test-tools/clear-cache.html`

### "Access denied"
→ Add `?pass=indeed` to the URL (or your custom password)

---

## 💡 Pro Tips

1. **Bookmark the admin panel** for quick access
2. **Run Status Check monthly** to maintain health
3. **Backup before migrations** - copy `data/cineshelf.sqlite`
4. **Use Auto-Fill Directors** after adding many movies
5. **Clear cache after version bumps** to force updates
6. **Check Movie Data regularly** to find quality issues

---

## 📱 Mobile Access

The admin panel works on mobile! All tools are responsive.

**Tip:** Add to homescreen for quick admin access.

---

## 🔒 Security Checklist

- [ ] Change default password from `indeed`
- [ ] Restrict `/admin/` directory in production
- [ ] Use environment variables for API keys
- [ ] Enable HTTPS for sensitive operations
- [ ] Review `.gitignore` before committing

---

*For detailed documentation, see [README.md](README.md)*
