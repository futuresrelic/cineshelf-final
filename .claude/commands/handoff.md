# Generate Session Handoff Document

A session is ending. Your job is to write a comprehensive, up-to-date HANDOFF_DOCUMENT.md so the next Claude starts from a position of full understanding. This document IS the source of truth for the entire project.

## What to do now

Work through all steps in order. Make a todo list to track your progress.

---

### Step 1: Gather Full Project State

Run all of these before writing anything:

```bash
# Current version
grep -r "APP_VERSION" /home/user/cineshelf-final/cineshelf.futuresrelic.com/config/config.php

# Recent git history
cd /home/user/cineshelf-final && git log --oneline -20

# Current branch
git branch --show-current

# File sizes (shows where complexity lives)
wc -l \
  cineshelf.futuresrelic.com/api/api.php \
  cineshelf.futuresrelic.com/js/app.js \
  cineshelf.futuresrelic.com/js/trivia.js \
  cineshelf.futuresrelic.com/js/cover-scanner.js \
  cineshelf.futuresrelic.com/css/styles.css \
  cineshelf.futuresrelic.com/index.html

# Database table list
sqlite3 cineshelf.futuresrelic.com/data/cineshelf.sqlite ".tables" 2>/dev/null || echo "DB access not available"

# Admin tools count
ls cineshelf.futuresrelic.com/admin/ | wc -l
```

Read these files for current detail:
- `/home/user/cineshelf-final/cineshelf.futuresrelic.com/config/config.php` — current version and admin users
- `/home/user/cineshelf-final/CHANGELOG.md` — full history
- The current `HANDOFF_DOCUMENT.md` — to understand what the previous Claude documented

---

### Step 2: Write the Updated HANDOFF_DOCUMENT.md

Write a complete, fresh HANDOFF_DOCUMENT.md. Do not just append to the old one — rewrite it so it is accurate as of today. The document should be self-contained and require no other reading to get started.

Use the structure below as your template. Fill every section with current, accurate information.

---

```markdown
# CineShelf Project - Handoff Document for Next Claude

**Date Created**: [TODAY'S DATE]
**Current Version**: [CURRENT APP_VERSION]
**Branch**: [CURRENT BRANCH NAME]
**Repository**: futuresrelic/cineshelf-final

---

## CRITICAL INFORMATION FOR NEXT CLAUDE

**THE USER DOES NOT CODE** - You will be doing ALL coding work. The user is non-technical and relies entirely on you to understand, diagnose, fix, and implement everything.

**PROJECT LOCATION**: All actual code is in `/home/user/cineshelf-final/cineshelf.futuresrelic.com/` subdirectory. Don't get confused by the parent directory.

**GIT WORKFLOW**:
- Always develop on branches starting with `claude/` and ending with the session ID
- Use `git push -u origin <branch-name>` for pushing
- If push fails with 403, verify branch name format: `claude/*-<SESSION_ID>`
- Retry network failures up to 4 times with exponential backoff (2s, 4s, 8s, 16s)

**HOW TO START EVERY SESSION**: Run `/orient` — it walks you through everything.
**AFTER COMPLETING WORK**: Run `/update-docs` to keep documentation current.
**ENDING A SESSION**: Run `/handoff` to update this document.

---

## PROJECT OVERVIEW

[Write a clear, honest description of what CineShelf is, what it does, and who uses it. Update with anything new this session introduced.]

### Key Features
[List all current features with status — mark any that are broken or incomplete]

---

## PROJECT STRUCTURE

[Keep this section accurate. Update file paths and descriptions if anything changed.]

```
cineshelf-final/
└── cineshelf.futuresrelic.com/          ← ALL CODE IS HERE!
    ├── api/
    │   ├── api.php                       ← Main API (X lines, XX+ actions)
    │   ├── auth.php
    │   ├── auth-middleware.php
    │   └── schema.sql
    ├── config/
    │   ├── config.php
    │   └── oauth-config.php
    ├── js/
    │   ├── app.js                        ← Main frontend (X lines)
    │   ├── auth.js
    │   ├── trivia.js
    │   └── cover-scanner.js
    ├── css/
    │   └── styles.css                    ← (X lines)
    ├── data/
    │   └── cineshelf.sqlite
    ├── admin/                            ← XX+ admin/dev tools
    └── index.html
```

---

## TECHNOLOGY STACK

[Keep this section accurate. Note any new libraries or services added.]

---

## DATABASE SCHEMA

[List all current tables. Add any new tables. Remove any dropped tables. Be specific about relationships and constraints.]

---

## API STRUCTURE

[List all current actions in api.php. This is critical for the next Claude — they need to know what exists before adding something that already exists.]

---

## FRONTEND ARCHITECTURE

[Describe the current module structure. Update if new modules were added.]

---

## RECENT FIXES & VERSION HISTORY

### Current State ([VERSION])
[Describe the current state honestly — what works, what was recently fixed, what is fragile]

**Last 5 Commits**:
[List them with status — ✅ for working, ⚠️ for uncertain, ❌ for broken/reverted]

---

## COMMON ISSUES & DEBUGGING

[Keep this section current. Add new issues discovered this session. Remove issues that are no longer relevant.]

---

## CONFIGURATION FILES

[Keep current. Note if any env vars or config values changed.]

---

## IMPORTANT PATTERNS & CONVENTIONS

### Database Queries — ALWAYS USE PREPARED STATEMENTS
```php
// CORRECT
$stmt = $db->prepare("SELECT * FROM movies WHERE id = ?");
$stmt->execute([$id]);

// WRONG — SQL injection vulnerability!
$result = $db->query("SELECT * FROM movies WHERE id = $id");
```

### API Responses
```php
jsonResponse(true, ['movies' => $movies], null);  // success
jsonResponse(false, null, "Movie not found");       // error
```

### Frontend API Calls
```javascript
const response = await fetch('/api/api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list_collection', user_id: userId })
});
const result = await response.json();
```

### Group Collection Queries — Always JOIN movies
```sql
SELECT c.*, m.title, m.poster_url, m.year
FROM copies c
JOIN movies m ON c.movie_id = m.id
WHERE c.user_id = ?
```

### Images — Use poster_url, not poster_path
```javascript
<img src="${movie.poster_url}" />  // CORRECT
<img src="${movie.poster_path}" /> // WRONG
```

---

## KNOWN LIMITATIONS & FUTURE WORK

[Keep this honest. Add things discovered this session. Remove things that were resolved.]

---

## DEBUGGING CHECKLIST

[Keep this current. Add new debugging patterns discovered this session.]

---

## QUICK REFERENCE — FILES TO CHECK FIRST

[Keep this list current and accurate]

### Frontend Issues
1. `cineshelf.futuresrelic.com/js/app.js`
2. `cineshelf.futuresrelic.com/index.html`
3. `cineshelf.futuresrelic.com/css/styles.css`

### Backend Issues
1. `cineshelf.futuresrelic.com/api/api.php`
2. `cineshelf.futuresrelic.com/config/config.php`
3. `cineshelf.futuresrelic.com/api/schema.sql`

### Database Issues
1. `cineshelf.futuresrelic.com/data/cineshelf.sqlite`
2. `cineshelf.futuresrelic.com/admin/database-tools/view-database.php`

---

## WHAT HAPPENED THIS SESSION

[This section is NEW each handoff. Write a clear account of what was worked on, what decisions were made, what was completed, and what was left unfinished. Future Claude needs to know where this session left off.]

### Completed
- [List completed items]

### In Progress / Left Unfinished
- [List anything not finished, with notes on where it stands]

### Decisions Made
- [Any architectural or design decisions — explain why, not just what]

### Things to Watch Out For
- [Anything fragile, tricky, or requiring special handling discovered this session]

---

## CONTACT & RESOURCES

### User's Preferences
- **Non-technical** — explain decisions in plain language, no jargon
- **Hands-off** — you do all coding, they describe what they want
- **Wants working software** — test before committing, don't commit broken things

### Documentation
- TMDB API: https://developers.themoviedb.org/3
- SQLite docs: https://www.sqlite.org/docs.html
- Google OAuth: https://developers.google.com/identity/protocols/oauth2

---

## AVAILABLE SLASH COMMANDS

These commands are available in every session via `.claude/commands/`:

| Command | What it does |
|---|---|
| `/orient` | Full project orientation — **run this first in every session** |
| `/update-docs` | Update CHANGELOG and HANDOFF_DOCUMENT after completing work |
| `/handoff` | Regenerate this document completely — **run this before ending a session** |

---

**Document Version**: [increment this each time the handoff is regenerated]
**Last Updated**: [TODAY'S DATE]
**Updated By**: Claude (session ending [BRANCH NAME])
```

---

### Step 3: Save and Commit

Write the completed document to:
```
/home/user/cineshelf-final/HANDOFF_DOCUMENT.md
```

Then commit it:

```bash
cd /home/user/cineshelf-final
git add HANDOFF_DOCUMENT.md CHANGELOG.md
git commit -m "docs: regenerate handoff document for session end - v[VERSION]"
git push -u origin <current-branch-name>
```

---

### Step 4: Final Report to User

Tell the user the session is wrapped up cleanly:

> "The HANDOFF_DOCUMENT.md has been updated to reflect everything we worked on today. The next Claude session will start with a complete, accurate picture of the project. Just run `/orient` to get started next time."

---

## What Makes a Good Handoff

**Be specific, not vague.** "Fixed a SQL bug" is useless. "Fixed missing JOIN in `get_user_wishlist` that caused empty results when loading group wishlists" is useful.

**Be honest about fragility.** If something feels held together with duct tape, say so. The next Claude needs to know where to be careful.

**Be complete.** The next Claude should not need to read old git history or ask the user what happened. The HANDOFF_DOCUMENT should tell the full story.

**Document decisions, not just facts.** If you chose one approach over another, explain why. Future work benefits from knowing the reasoning.
