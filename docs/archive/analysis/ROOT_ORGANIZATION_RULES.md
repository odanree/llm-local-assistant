# Root Directory Organization Rules

> **Quick Reference**: When root directory gets bloated, consult these rules and apply the cleanup checklist.

## Why These Rules Exist

The project root should contain **only** industry-standard, publicly-facing files that define the project and guide new contributors. All project-specific documentation, research notes, and implementation details belong in `/docs/`.

This keeps the repository professional, discoverable, and organized.

---

## 🎯 Industry-Standard Files (Keep in Root)

These files MUST remain in the root directory:

| File | Purpose | Status |
|------|---------|--------|
| **README.md** | Project overview, quick start, features | ✅ Required |
| **CHANGELOG.md** | Version history and releases | ✅ Required |
| **ROADMAP.md** | Future plans and development timeline | ✅ Required |
| **LICENSE** | License information (MIT) | ✅ Required |

**Rationale**: These are the first files GitHub displays and what new users expect to find.

---

## ❌ Project-Specific Files (Move to /docs/)

Any markdown or documentation file that is NOT in the list above should be in `/docs/`. Examples:

| File Type | Examples | Destination |
|-----------|----------|-------------|
| Architecture documents | ARCHITECTURE.md, DESIGN.md | `/docs/` |
| Implementation guides | DEVELOPER_GUIDE.md, EXECUTION_GUIDE.md | `/docs/` |
| Session notes & logs | SESSION_COMPLETE.md, FINAL_SESSION_REPORT.md | `/docs/` |
| Release details | RELEASE-2.0.3.md, RELEASE-COMPLETE.md | `/docs/` |
| Analysis & research | V3_RELEASE_STATUS.md, GOLDEN_SHIELD.md | `/docs/` |
| Technical deep-dives | PARSER_FIX_*.md, ATOMIC_VALIDATION_*.md | `/docs/` |
| Feature specifications | ACTION_FIRST_PROMPT_ENGINEERING.md, USING_VALIDATORPROFILES.md | `/docs/` |
| Git workflows | PR-15-READY.md, etc. | `/docs/` |
| Setup & references | CURSORRULES_EXAMPLE.md, FORM_COMPONENT_PATTERNS.md | `/docs/` |

**Rule of thumb**: If it's not something a brand-new user opening the repo needs to see first, it goes in `/docs/`.

---

## 📋 Root Cleanup Checklist

When the root directory gets cluttered, follow this process:

### Step 1: Identify All Markdown Files in Root
```powershell
Get-ChildItem -File | Where-Object { $_.Extension -eq '.md' }
```

### Step 2: Categorize Each File
For each `.md` file found:
- ✅ Is it in the "Industry-Standard Files" list above?
  - **YES** → Keep in root
  - **NO** → Move to `/docs/`

### Step 3: Execute Moves
```bash
git mv FILENAME.md docs/
```

**Example**:
```bash
git mv SESSION_COMPLETE.md docs/
git mv FINAL_SESSION_REPORT.md docs/
git mv V3_RELEASE_STATUS.md docs/
```

### Step 4: Handle Duplicates
If a file already exists in `/docs/`:
```bash
git rm DUPLICATE_IN_ROOT.md
```

### Step 5: Clean Temporary Files
Remove any test or temporary files:
```bash
git rm test-output.txt
git rm test-cn-validation.ts
```

### Step 6: Update README.md References
If you moved files that were referenced in README.md, update links:
- Old: `[Doc](FILENAME.md)`
- New: `[Doc](docs/FILENAME.md)`

### Step 7: Commit Changes
```bash
git add README.md
git commit -m "chore: clean up root directory and organize documentation

- Move [N] files to /docs/
- Remove duplicates
- Update documentation links
- Root now contains only industry-standard files"
```

---

## 📚 /docs/ Organization

The `/docs/` folder should be organized by category. Suggested structure:

```
/docs/
├── # Architecture & Design
├── ARCHITECTURE.md                    (System design)
├── FORM_COMPONENT_PATTERNS.md        (Pattern documentation)
│
├── # Setup & Configuration  
├── INSTALL.md                        (Setup instructions)
├── CURSORRULES_EXAMPLE.md            (.lla-rules template)
├── CONTRIBUTING.md                   (Development guidelines)
│
├── # Development & Guides
├── DEVELOPER_GUIDE_V1.2.0.md         (Codebase overview)
├── EXECUTION_GUIDE.md                (Running code)
├── MARKETPLACE.md                    (VS Code Marketplace)
│
├── # Troubleshooting & Reference
├── MODEL_COMPARISON.md               (LLM recommendations)
├── LOCAL_TESTING_GUIDE.md            (Testing setup)
├── RELEASE-COMPLETE.md               (Release notes)
│
├── # Archives (older documents, research)
├── V3_RELEASE_STATUS.md
├── GOLDEN_SHIELD.md
├── SESSION_COMPLETE.md
└── ... (other archived docs)
```

---

## 🔍 How to Identify Bloat

Root directory gets bloated when you see:

❌ **Symptoms**:
- More than 10 `.md` files in root
- Files named after development phases (SESSION_*, PHASE_*, etc.)
- Files documenting specific fixes or implementations
- Analysis or research documents
- Release or PR-specific documents

✅ **Healthy State**:
- Only 4 markdown files: README.md, CHANGELOG.md, ROADMAP.md, LICENSE
- Clean, minimal root directory
- All project docs in `/docs/`

---

## 🤖 AI Instruction Template

When documenting a root cleanup for AI to perform:

> "Apply root directory cleanup following `/docs/ROOT_ORGANIZATION_RULES.md`:
> 1. Keep only industry-standard files in root (README.md, CHANGELOG.md, ROADMAP.md, LICENSE)
> 2. Move all other .md files to /docs/
> 3. Remove any duplicates or temporary files
> 4. Update references in README.md
> 5. Commit with message about organization"

---

## 📏 Current State (After Last Cleanup)

**Last Cleanup**: February 9, 2026 (commit `41e1e14`)

✅ **Root Directory Contents**:
```
CHANGELOG.md          (industry standard)
README.md             (industry standard)
ROADMAP.md            (common convention)
LICENSE               (industry standard)
```

✅ **Moved to /docs/**:
- 21 project-specific markdown files
- All research, analysis, and implementation documents
- Session notes and phase documentation

✅ **Cleaned Up**:
- Removed temporary test files
- Removed duplicate QUICK_REFERENCE.md from root
- Updated README.md with organized documentation index

---

## 🛠️ Prevention Tips

**For Future Development**:

1. **New documentation?** → Create in `/docs/` directly, not root
2. **Session notes?** → Save to `/docs/SESSION_NOTES/` directory
3. **Implementation details?** → Add to `/docs/IMPLEMENTATION/` or link from existing docs
4. **Research findings?** → Archive in `/docs/RESEARCH/` directory

**Before committing**:
- Check root directory has < 5 `.md` files
- Verify only industry-standard files remain
- Update README.md with links to new docs if added

---

## ✅ Verification Checklist

After applying root cleanup, verify:

- [ ] Only 4 markdown files in root: README.md, CHANGELOG.md, ROADMAP.md
- [ ] No project-specific docs remain in root  
- [ ] All .md files moved to /docs/ have relative path links working
- [ ] README.md documentation section references correct paths
- [ ] No temporary files (test-*.ts, test-*.txt) in root
- [ ] Build passes: `npm run compile`
- [ ] Tests pass: `npm test`
- [ ] Changes committed with clear message

---

## 📖 References

- **[README.md](../README.md)** - Project overview and documentation index
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development workflow
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design

## See Also

For actual implementation of these rules, see:
- Commit `41e1e14` - Last root cleanup (Feb 9, 2026)
- Commit history for examples of cleanup commits
