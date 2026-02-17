# Documentation (/docs directory)

All extended documentation lives here. Root directory contains only 6 core documentation files.

## Structure

### Phase 1
- **PHASE1_POLISH_CHECKLIST.md** - Testing & shipping guide (follow this day-by-day)

### Phase 2
- **PHASE2_CONTEXT_PROMPT.md** - Phase 2 specification
- **PHASE2_GUIDE.md** - Comprehensive Phase 2 development guide
- **PHASE2_TESTING.md** - Phase 2 testing procedures
- **PHASE2-TEST-IMPROVEMENTS.md** - Test suite improvements (DAG validation, error paths, factories)

### Phase 3 (Current - Coverage & Testing)
- **PHASE3-COVERAGE-IMPROVEMENTS.md** - Phase 2 coverage expansion details (52 new tests)
- **PHASE3-COVERAGE-STRATEGY.md** - SE2-level honest assessment and 30-day coverage roadmap
- **PHASE3-CRITICAL-HIT-LIST.md** - Three high-ROI targets (pathSanitizer, SemanticValidator, executorFactory)
- **PHASE3-EXECUTION-GUIDE.md** - Copy-paste test templates and week-by-week execution plan

### Phase 3+ (Future Development)
- **PHASE-3.2-PLAN.md** - Phase 3.2 specification
- **PHASE-3.3-PLAN.md** - Phase 3.3 specification
- **PHASE-3.4-PLAN.md** - Phase 3.4 specification
- **FUTURE_ROADMAP.md** - Complete specs for Phases 2-7 (40+ pages)

### Navigation & Context
- **ORGANIZATION_SUMMARY.md** - How all documents fit together
- **QUICK_NAVIGATION_GUIDE.md** - Find what you need quickly
- **COMPLETION_SUMMARY.md** - Summary of work completed

## Root Directory Constraint

⚠️ **STRICTLY ENFORCED**: The 6 root documentation files are:
- README.md
- ROADMAP.md
- ARCHITECTURE.md
- PROJECT_STATUS.md
- QUICK_REFERENCE.md
- CHANGELOG.md

**Rule**: NO new .md or .txt files in root. Everything goes here in `/docs/`.

## How to Use

### I want to improve test coverage
→ Quick start: Open `PHASE3-EXECUTION-GUIDE.md` for copy-paste test templates and weekly plan
→ Context: Read `PHASE3-CRITICAL-HIT-LIST.md` for why each target matters
→ Strategy: Review `PHASE3-COVERAGE-STRATEGY.md` for the SE2 roadmap

### I want to understand Phase 2 testing improvements
→ Read `PHASE2-TEST-IMPROVEMENTS.md` for the test factories and DAG validation work

### I want to ship Phase 1 this week
→ Start with `PHASE1_POLISH_CHECKLIST.md`

### I want to understand the project
→ Read `QUICK_NAVIGATION_GUIDE.md`

### I want to build Phase 2/3
→ Use `PHASE2_CONTEXT_PROMPT.md` or `PHASE2_GUIDE.md` as your spec

### I want to see all future plans
→ Read `FUTURE_ROADMAP.md`

### I'm confused about organization
→ Check `ORGANIZATION_SUMMARY.md`

---

**Remember**: All future documentation additions go in `/docs/`, never in root.
