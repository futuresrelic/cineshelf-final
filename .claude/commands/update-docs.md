# Update Project Documentation

A significant piece of work was just completed. Your job now is to update all living documentation so it accurately reflects the current state of the project. This keeps the project's source of truth current so future Claude sessions start with accurate information.

## What to do now

Work through all steps below in order. Make a todo list to track your progress.

---

### Step 1: Gather What Changed

Run the following to understand what work was done in this session:

```bash
cd /home/user/cineshelf-final && git log --oneline -10
git diff HEAD~5 HEAD --stat 2>/dev/null || git log --oneline -5
```

Also look at any files you edited during this session. Write down a plain-English summary of what was accomplished.

---

### Step 2: Update CHANGELOG.md

Read the current changelog:

```
/home/user/cineshelf-final/CHANGELOG.md
```

Add a new entry at the top of the changelog in this format:

```markdown
## [vX.X.X] - YYYY-MM-DD

### Added
- New feature or capability (if any)

### Fixed
- Bug that was fixed (if any)

### Changed
- Behaviour that was modified (if any)

### Technical
- Backend/code changes worth noting (if any)
```

Only include sections that actually apply. Keep entries brief and plain — the user should be able to read these and understand what changed without being a developer.

---

### Step 3: Update HANDOFF_DOCUMENT.md

Read the current handoff document:

```
/home/user/cineshelf-final/HANDOFF_DOCUMENT.md
```

Update the following sections as needed based on what changed this session:

1. **Date Created / Current Version** at the top — bump version if appropriate
2. **RECENT FIXES & VERSION HISTORY** — add the latest fixes with ✅ checkmarks
3. **Last 5 Commits** list — update to reflect the current state
4. **KNOWN LIMITATIONS & FUTURE WORK** — if anything was resolved, remove it; if new limitations were discovered, add them
5. **Feature Requests to Expect** — update if new patterns emerged from user requests

Do **not** rewrite sections that did not change — only update what's relevant.

---

### Step 4: Update PROJECT_ANALYSIS_REPORT.md (if significant changes)

If a major feature was added, a major bug was fixed, or the architecture changed, read and update:

```
/home/user/cineshelf-final/PROJECT_ANALYSIS_REPORT.md
```

Minor fixes don't need this. Use judgement.

---

### Step 5: Check if Architecture Changed

If you added new API actions, new database tables, new frontend modules, or changed the authentication flow, read and update:

```
/home/user/cineshelf-final/ARCHITECTURE_FLOWCHART.md
```

---

### Step 6: Bump the App Version (if warranted)

If the changes were substantial enough to warrant a version bump, update:

```
/home/user/cineshelf-final/cineshelf.futuresrelic.com/config/config.php
```

Change the `APP_VERSION` constant. Use semantic versioning:
- **Patch** (x.x.**X**) — bug fixes, small improvements
- **Minor** (x.**X**.0) — new features, meaningful additions
- **Major** (**X**.0.0) — major redesigns, breaking changes

Also update `APP_VERSION` in:
```
/home/user/cineshelf-final/cineshelf.futuresrelic.com/version.json
```

---

### Step 7: Commit the Documentation Updates

Stage and commit only the documentation files:

```bash
cd /home/user/cineshelf-final
git add CHANGELOG.md HANDOFF_DOCUMENT.md PROJECT_ANALYSIS_REPORT.md ARCHITECTURE_FLOWCHART.md
git add cineshelf.futuresrelic.com/config/config.php cineshelf.futuresrelic.com/version.json
git commit -m "docs: update documentation and changelog for [brief description of session work]"
git push -u origin <current-branch-name>
```

Only include files that were actually changed.

---

### Step 8: Report to the User

Tell the user plainly what documentation was updated and why. Example:

> "I've updated the CHANGELOG and HANDOFF_DOCUMENT to reflect the work done this session. Version is now v2.2.2. The next Claude session will start with an accurate picture of where we are."

---

## Documentation Philosophy

**These documents are not for developers — they are for the next Claude.**

Write everything assuming the reader:
- Has never seen this project before
- Will not ask for help — they just need to understand and start working
- Needs to know what's working, what's broken, and what to watch out for
- Needs exact file paths, not vague descriptions

Keep documentation honest. If something is broken or incomplete, say so clearly. Don't write optimistic documentation that hides real problems.
