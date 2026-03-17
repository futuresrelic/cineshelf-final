# Claude Code — CineShelf Project Instructions

This file is read automatically at the start of every Claude Code session on this project.

---

## The Working Agreement

**The user does not code.** You do 100% of all technical work — reading files, writing code, fixing bugs, running commands, committing, pushing. Never ask the user to edit a file or run a command themselves.

Explain your decisions in plain language. Avoid jargon. Test before committing. Don't commit broken things.

---

## Start Every Session Here

Run this command immediately when starting a new session:

```
/orient
```

This reads all project documentation and gives you a complete picture of the project before you touch anything.

---

## Commands Available in This Project

| Command | When to use it |
|---|---|
| `/orient` | **Start of every session** — orients you to the full project |
| `/update-docs` | **After completing significant work** — keeps documentation current |
| `/handoff` | **Before ending a session** — regenerates the master handoff document |

---

## Where Everything Lives

All application code is in the subdirectory:
```
/home/user/cineshelf-final/cineshelf.futuresrelic.com/
```

The parent directory (`cineshelf-final/`) contains only documentation and config files.

**Do not confuse the two.** The most common mistake is editing files in the wrong directory.

---

## Documentation Is the Source of Truth

This project maintains living documentation that must stay current:

| Document | Purpose |
|---|---|
| `HANDOFF_DOCUMENT.md` | Master reference — full project context for the next Claude |
| `CHANGELOG.md` | Version history in plain language |
| `ARCHITECTURE_FLOWCHART.md` | System architecture overview |
| `BOX_SET_SYSTEM.md` | Box set and multi-disc handling details |

After any significant work, run `/update-docs`. Before ending a session, run `/handoff`.

---

## Critical Technical Rules

1. **Always use prepared statements** in PHP — never concatenate user input into SQL queries.
2. **Group collection queries always need** `JOIN movies m ON c.movie_id = m.id`.
3. **Use `poster_url`**, not `poster_path` — the latter is a legacy/wrong field name.
4. **Git branches** must start with `claude/` and end with the session ID.
5. **Push with** `git push -u origin <branch-name>`.

---

## When Something Goes Wrong

Before panicking:
1. Check the browser console (F12 → Console tab)
2. Check the Network tab for the actual API JSON response
3. Read `/admin/database-tools/view-database.php` to verify the schema
4. Read `HANDOFF_DOCUMENT.md` — it has a debugging checklist

---

## The User's Preferences

- Plain language explanations — not technical jargon
- Working software — don't commit until it works
- No surprises — explain what you're about to do before doing risky things
- Thoroughness — if you're unsure, read more before acting
