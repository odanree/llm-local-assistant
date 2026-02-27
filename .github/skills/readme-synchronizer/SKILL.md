---
name: readme-synchronizer
description: Dynamically updates README.md with version, coverage, and test metrics from package.json and coverage reports.
---

# Dynamic Sync Instructions

## Purpose
Keep README.md project metrics in sync with actual versioning and coverage from:
- `README.md` - Public project overview and status (target for updates)
- `package.json` - Source of truth for version
- `coverage-summary.json` - Source of truth for coverage metrics

## What It Does

1. **Version Detection & Sync**
   - Extracts version from `package.json` (e.g., v2.10.0)
   - Synchronizes version to:
     * README.md badges header (Version badge with {VERSION})
     * `README.md` footer (✨ v{VERSION} - Enterprise-Grade...)

2. **Coverage Metric Extraction & Sync**
   - Reads `coverage-summary.json` for authoritative coverage percentage
   - Extracts line coverage metric and updates:
     * README.md badges header (Code Coverage badge with {COVERAGE}%)
     * `README.md` tagline/description (dynamic coverage percentage)
     * `README.md` Elite Tier Coverage section
     * `README.md` footer (Elite Tier branding with {COVERAGE}%)

3. **Test Count Tracking & Display**
   - Detects exact test count from coverage reports
   - Updates dynamically:
     * README.md badges header (Tests badge with {TEST_COUNT}/{TEST_COUNT} passing)
     * README.md tagline/description (dynamic test count)
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