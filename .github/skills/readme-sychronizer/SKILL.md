---
name: readme-synchronizer
description: Dynamically updates README.md and copilot-instructions.md with version, coverage, and test metrics from package.json and coverage reports.
---

# Dynamic Sync Instructions

## Purpose
Keep all project documentation in sync with actual metrics and versioning across:
- `README.md` - Public project overview and status
- `copilot-instructions.md` - AI agent context and configuration
- `package.json` - Source of truth for version
- `coverage-summary.json` - Source of truth for coverage metrics

## What It Does

1. **Version Detection & Sync**
   - Extracts version from `package.json` (e.g., v2.10.0)
   - Synchronizes version across all documentation:
     * `copilot-instructions.md` header tagline (✨ v{VERSION})
     * `README.md` footer (✨ v{VERSION} - Enterprise-Grade...)
     * `copilot-instructions.md` Current Release Status field

2. **Coverage Metric Extraction & Sync**
   - Reads `coverage-summary.json` for authoritative coverage percentage
   - Extracts line coverage metric and updates all references dynamically:
     * `copilot-instructions.md` header tagline (📊 {COVERAGE}% Coverage)
     * `copilot-instructions.md` Test Coverage field
     * `README.md` Status line
     * `README.md` Elite Tier Coverage section
     * `README.md` footer (Elite Tier branding)

3. **Test Count Tracking & Sync**
   - Detects exact test count from coverage reports (uses {TEST_COUNT} variable)
   - Updates test references across:
     * `copilot-instructions.md` header (🧪 {TEST_COUNT} Tests Passing)
     * `copilot-instructions.md` Test Suite field
     * `README.md` header tagline ({TEST_COUNT} tests)
     * `README.md` status section ({TEST_COUNT}/{TEST_COUNT} tests)
     * `README.md` footer ({TEST_COUNT} Tests Passing)

## Command
```bash
sh .github/skills/readme-synchronizer/sync-dynamic.sh
```

## Integration
- Runs automatically on `feat/**` branch pushes via GitHub Actions
- Part of PR workflow to keep docs updated
- Ensures documentation accuracy at release time