# Root Directory Organization - Quick Reference

**Last Updated**: February 9, 2026 (commit `41e1e14`)

## 🎯 Quick Rule

**Root directory contains ONLY industry-standard files:**
- ✅ README.md
- ✅ CHANGELOG.md  
- ✅ ROADMAP.md
- ✅ LICENSE

**Everything else goes in `/docs/`**

---

## 🤖 AI Instruction

When asked to clean root directory:

```
Apply root directory organization from docs/ROOT_ORGANIZATION_RULES.md:

1. Identify all .md and .txt files in root
2. Keep only: README.md, CHANGELOG.md, ROADMAP.md, LICENSE
3. Move everything else to /docs/
4. Remove duplicates
5. Update README.md references
6. Commit with message about cleanup
```

---

## 📋 Full Rules

See: [docs/ROOT_ORGANIZATION_RULES.md](../docs/ROOT_ORGANIZATION_RULES.md)

## 📖 Contributing

See: [docs/CONTRIBUTING.md - Repository Organization](../docs/CONTRIBUTING.md#repository-organization)

## Detection

Root is cluttered if:
- More than 5 `.md` files in root
- Files named after phases/sessions/releases
- Implementation or analysis documents visible
- Temporary test files present

---

## Last Cleanup Details

**Commit**: `41e1e14`  
**Date**: February 9, 2026

**Changes**:
- Moved 21 files to `/docs/`
- Deleted duplicate QUICK_REFERENCE.md from root
- Removed test-cn-validation.ts, test-output.txt
- Updated README.md documentation section

**Result**:
```
Root: README.md, CHANGELOG.md, ROADMAP.md, LICENSE (clean ✅)
Docs: 50+ organized documentation files
```
