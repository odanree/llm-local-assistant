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

1. **Version Detection**
   - Extracts version from `package.json`
   - Updates version references in:
     * `copilot-instructions.md` header
     * `copilot-instructions.md` Current Release Status
     * `README.md` Elite Tier Achievement section

2. **Coverage Metric Extraction**
   - Reads `coverage-summary.json` for line coverage percentage
   - Updates coverage references in:
     * `copilot-instructions.md` header tagline
     * `copilot-instructions.md` Test Coverage field
     * `README.md` Elite Tier Coverage field

3. **Test Count Tracking**
   - Detects test count from coverage reports
   - Updates test references in documentation

## Command
```bash
sh .github/skills/readme-synchronizer/sync-dynamic.sh
```

## Integration
- Runs automatically on `feat/**` branch pushes via GitHub Actions
- Part of PR workflow to keep docs updated
- Ensures documentation accuracy at release time