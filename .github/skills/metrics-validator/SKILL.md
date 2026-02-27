---
name: metrics-validator
description: Quality-gate enforced metrics validation - extracts coverage from tests, validates threshold, updates METRICS.json
---

# Metrics Validator Skill

## Purpose

Validate code quality metrics against the Diamond Tier threshold (80.27% coverage) and maintain a single source of truth for metrics in `METRICS.json`.

This skill ensures:
- **Quality Gate Enforcement**: Coverage must meet or exceed 80.27% Diamond Tier threshold
- **Regression Prevention**: Blocks merges/commits if coverage drops below threshold
- **Reliable Metrics**: Uses dynamic extraction from npm run coverage instead of brittle pattern matching
- **Single Source of Truth**: All metrics stored in `METRICS.json` for consistency

## What It Does

1. **Extract Metrics Dynamically**
   - Runs `npm run coverage` to generate fresh coverage data
   - Extracts test count from "XXXX passed" pattern
   - Extracts coverage percentage from vitest output
   - Reads version from `package.json`

2. **Validate Quality Gate (v2.11.0+)**
   - Compares coverage against 80.27% threshold
   - Fails with clear error message if coverage drops
   - Provides remediation steps for developers
   - Uses floating-point arithmetic for precision

3. **Update Metrics File**
   - Creates/updates `METRICS.json` with validated metrics
   - Records ISO 8601 timestamp
   - Structured JSON format for tool integration

4. **Clear Error Reporting**
   - Shows actual vs threshold coverage
   - Suggests actions to fix regression
   - Prevents silent failures

## Output Format

The skill creates or updates `METRICS.json`:

```json
{
  "version": "2.11.0",
  "tests": 3594,
  "coverage": 80.27,
  "lastUpdated": "2026-02-27T15:30:22Z"
}
```

## Quality Gate Threshold

- **Diamond Tier Minimum**: 80.27% coverage
- **Action on Failure**: Exit code 1, blocks merge/push
- **Validation Type**: Real-time extraction from npm run coverage

## Integration

- Runs automatically on PR/push via GitHub Actions
- **Blocking**: Prevents merge if quality gate fails
- **Non-destructive**: Only creates/updates `METRICS.json`
- **Separate from README**: README updater consumes these metrics

## Usage

### Automatic (GitHub Actions)
```bash
# Runs on every PR and push to main/feat branches
# Enforces 80.27% coverage threshold
```

### Manual
```bash
sh .github/skills/metrics-validator/validate-metrics.sh
```

### Manual with Coverage Run
```bash
npm run coverage
sh .github/skills/metrics-validator/validate-metrics.sh
```

## Success Criteria

- ✅ Coverage ≥ 80.27%: Metrics validated and updated
- ❌ Coverage < 80.27%: Exit with error, no metrics update

## Implementation Notes

- Uses `npm run coverage` for dynamic metric extraction
- Validates against floating-point 80.27% threshold
- bash arithmetic: `bc -l` for precision comparison
- Regex patterns optimized for vitest output format
- Clear separation: metrics validation vs. README updates
- Works with semantic-release workflows