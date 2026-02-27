---
name: root-enforcer
description: Enforces the "Exactly 6" root documentation rule by migrating unauthorized .md and .txt files to the /docs directory.
---

# Root Enforcer Instructions

1. **The Whitelist:** Only these 6 files are permitted to stay in the root:
   - README.md, ROADMAP.md, ARCHITECTURE.md, PROJECT_STATUS.md, QUICK_REFERENCE.md, CHANGELOG.md

2. **The Cleanup:** - Identify every other `.md` or `.txt` file currently in the root (e.g., PHASE-*, WAVE-*, V2-10-0-*, SESSION-SUMMARY.md).
   - Move these files into the `docs/` subdirectory. 
   - If a file is a session summary or audit, move it to `docs/archives/` or `docs/audits/`.

3. **Validation:** - After moving, confirm that exactly 6 documentation files remain in the root.
   - If any new .md files were created during the current session, move them immediately.

**Command:** `sh .github/skills/root-enforcer/enforce.sh`