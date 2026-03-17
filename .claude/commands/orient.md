# CineShelf Project Orientation

You are beginning a new session on the **CineShelf** project. Your job is to fully orient yourself to the current state of the project so you can work effectively. The user does not code — you do everything.

## What to do now

Work through all steps below in order. Make a todo list to track your progress.

---

### Step 1: Read the Source of Truth

Read the main handoff document first — this is the authoritative reference for the entire project:

```
/home/user/cineshelf-final/HANDOFF_DOCUMENT.md
```

Then read these supplementary documents:

```
/home/user/cineshelf-final/CHANGELOG.md
/home/user/cineshelf-final/ARCHITECTURE_FLOWCHART.md
/home/user/cineshelf-final/BOX_SET_SYSTEM.md
```

---

### Step 2: Check the Current Git State

Run these commands to understand where the project currently stands:

```bash
cd /home/user/cineshelf-final && git log --oneline -15
git status
git branch -a | grep -E "HEAD|claude/"
```

Note the current branch name. If you need to make changes, your working branch must start with `claude/` and end with the current session ID.

---

### Step 3: Check the Current Version

Read the version marker:

```
/home/user/cineshelf-final/cineshelf.futuresrelic.com/config/config.php
```

Note the `APP_VERSION` constant — this tells you the official current version.

---

### Step 4: Scan for Recent Changes

Run this to see what files were changed in the last 10 commits and get a feel for where active development has been:

```bash
cd /home/user/cineshelf-final && git log --oneline -10 --stat
```

---

### Step 5: Quick Health Check

Confirm the key files exist and look at their approximate sizes (line counts tell you where complexity lives):

```bash
wc -l \
  /home/user/cineshelf-final/cineshelf.futuresrelic.com/api/api.php \
  /home/user/cineshelf-final/cineshelf.futuresrelic.com/js/app.js \
  /home/user/cineshelf-final/cineshelf.futuresrelic.com/css/styles.css \
  /home/user/cineshelf-final/cineshelf.futuresrelic.com/index.html
```

---

### Step 6: Report to the User

Once you have read everything, give the user a clear, friendly orientation summary. Include:

- **Current version** of the app
- **Current branch** you are working on
- **What was last worked on** (last 3-5 commits summarized plainly)
- **Any obvious issues or things to watch out for** based on HANDOFF_DOCUMENT notes
- **A reminder of your working agreement** — you write all code, the user describes what they want

End your summary with:
> "I'm fully oriented. What would you like to work on?"

---

## Critical Rules to Remember Always

1. **The user does not code.** You do 100% of all coding work — reading, writing, debugging, testing, committing, pushing. Never ask the user to edit a file or run a command.

2. **All code lives in the subdirectory:** `/home/user/cineshelf-final/cineshelf.futuresrelic.com/` — not the parent folder. Don't get confused.

3. **Git branches** must start with `claude/` and end with the session ID. Always push with `git push -u origin <branch-name>`.

4. **Always use prepared statements** in PHP SQL queries. Never concatenate user input into SQL — this is a security requirement, not optional.

5. **After completing any significant change**, run `/update-docs` to keep documentation current.

6. **After completing a session**, run `/handoff` to update HANDOFF_DOCUMENT.md for the next Claude.

---

## Project Quick Reference

| Thing | Location |
|---|---|
| All app code | `cineshelf.futuresrelic.com/` |
| Main API | `api/api.php` (~48+ actions) |
| Main frontend | `js/app.js` + `index.html` |
| Database | `data/cineshelf.sqlite` |
| Config | `config/config.php` |
| Schema | `api/schema.sql` |
| Admin tools | `admin/` (25+ tools) |
| Handoff doc | `HANDOFF_DOCUMENT.md` (root) |
| Changelog | `CHANGELOG.md` (root) |

**Tech stack**: PHP 7.4+ / SQLite 3 / Vanilla JavaScript (no frameworks) / CSS3 / PWA
