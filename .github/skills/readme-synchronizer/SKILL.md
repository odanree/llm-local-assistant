---
name: readme-synchronizer
description: Non-destructive metrics extraction - writes metrics to METRICS.json instead of pattern-matching README.md
---

# Dynamic Metrics Synchronizer

## Purpose
Keep metrics in a separate configuration file (`METRICS.json`) to avoid brittle pattern-matching on the README.

This decouples metric synchronization from README.md formatting, making the project resilient to:
- README reformatting or styling changes
- Markdown structure updates
- Badge repositioning

## Source of Truth
- `package.json` - Version information
- `coverage-summary.json` - Coverage metrics (line coverage %)
- `coverage/coverage-summary.json` - Test count from vitest

## What It Does

1. **Version Detection**
   - Extracts version from `package.json`
   - Stores in `METRICS.json`

2. **Coverage Metric Extraction**
   - Reads `coverage-summary.json` for authoritative coverage percentage
   - Stores in `METRICS.json`

3. **Test Count Tracking**
   - Detects exact test count from coverage reports
   - Stores in `METRICS.json`

4. **Timestamp Tracking**
   - Records when metrics were last updated (ISO 8601 format)

## Output Format

The skill creates or updates `METRICS.json`:

```json
{
  "version": "2.10.0",
  "tests": 2453,
  "coverage": 74.68,
  "lastUpdated": "2026-02-27T15:30:22Z"
}
```

## Integration

- Runs automatically on `feat/**` branch pushes via GitHub Actions
- **Non-destructive**: Only creates/updates `METRICS.json`, never touches README
- README can reference metrics from `METRICS.json` via build step or documentation process
- Safe for integration with human-maintained documentation

## Usage in Documentation

To use these metrics in README, you can:

1. **Build-time substitution**: Process README template at build time
2. **Comment references**: Manual updates pull from `METRICS.json`
3. **Future tooling**: Markdown-aware tools can safely reference `METRICS.json`

## Command
```bash
sh .github/skills/readme-synchronizer/sync-dynamic.sh
```

## Implementation Notes

- Uses JSON for structured storage instead of brittle sed patterns
- Eliminates risk of silent failures when README formatting changes
- Metrics are independently accessible for other tooling
- Approach is resilient to README.md restructuring