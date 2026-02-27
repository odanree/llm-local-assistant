# README Auto-Updater Skill

Automatically updates README.md with the latest metrics on every semantic release.

## What It Does

The README Auto-Updater skill performs the following updates on every semantic release:

✅ **Updates Header Badges**
- Test count badge: Updates to latest test count from METRICS.json
- Coverage badge: Updates to latest coverage percentage
- Version badge: Reflects current release version

✅ **Updates Quick Description**
- Test suite count in main description
- Coverage percentage in main description

✅ **Updates Release Sections**
- v2.11.0 Diamond Tier Achievement section with current metrics
- Quality & Testing section with latest test and coverage numbers
- Footer with release metrics

✅ **Commits Changes**
- Auto-commits with `[skip ci]` flag to prevent infinite loops
- Uses semantic commit message format

## How It Works

### 1. Automatic Trigger (GitHub Actions)

The workflow automatically runs when:
- **Version changes** in `package.json` (semantic release detected)
- **Manual trigger** via `workflow_dispatch` in GitHub Actions UI

**File**: `.github/workflows/readme-update-on-release.yml`

### 2. Manual Execution

Run the skill directly from your local machine:

```bash
# Make sure metrics are current
npm run coverage

# Update METRICS.json with current metrics
sh .github/skills/metrics-validator/validate-metrics.sh

# Run README updater
sh .github/skills/readme-updater/update-readme.sh

# Review changes
git diff README.md

# Push if satisfied
git push origin your-branch
```

### 3. Semantic Release Integration

When using semantic-release, the workflow automatically:
1. Detects version bump in `package.json`
2. Extracts metrics from `METRICS.json`
3. Updates README with new metrics
4. Commits changes to main branch
5. Prevents CI loops with `[skip ci]` flag

## Configuration

### GitHub Actions Secrets (Optional)

No secrets required - the workflow uses GitHub's built-in authentication.

### Customization

To modify which README sections get updated, edit:
- **Script**: `.github/skills/readme-updater/update-readme.sh`
- **Triggers**: `.github/workflows/readme-update-on-release.yml`

## Usage Examples

### Example 1: Automatic on Semantic Release

```bash
# When you bump version in package.json and push:
git push origin main

# GitHub Actions will:
# 1. Detect version change
# 2. Run README updater
# 3. Update all badges and metrics
# 4. Commit to main with [skip ci]
```

### Example 2: Manual Update

```bash
# Update metrics locally
npm run coverage
sh .github/skills/metrics-validator/validate-metrics.sh

# Update README
sh .github/skills/readme-updater/update-readme.sh

# Review and commit
git status
git diff README.md
git add README.md
git commit -m "chore: update README metrics"
git push origin your-branch
```

### Example 3: Workflow Dispatch (GitHub UI)

1. Go to GitHub → Actions → "Auto-Update README on Semantic Release"
2. Click "Run workflow"
3. Select branch
4. Click "Run workflow"
5. Monitor execution in Actions tab

## Metrics Sources

The updater reads metrics from:

| Metric | Source | Updated By |
|--------|--------|-----------|
| **Version** | `METRICS.json` → `version` | Metrics Validator |
| **Test Count** | `METRICS.json` → `tests` | Metrics Validator |
| **Coverage** | `METRICS.json` → `coverage` | Metrics Validator |

All metrics are extracted from npm run coverage via the **Metrics Validator** skill.

## Workflow Diagram

```
Semantic Release / Manual Trigger
           ↓
Version Check (package.json vs git history)
           ↓
Extract Metrics (METRICS.json)
           ↓
Update README (badges, sections, footer)
           ↓
Commit & Push to main
           ↓
[skip ci] prevents CI loop
```

## Troubleshooting

### "Failed to extract metrics from METRICS.json"

**Cause**: METRICS.json doesn't have required fields

**Solution**:
```bash
# Update metrics first
npm run coverage
sh .github/skills/metrics-validator/validate-metrics.sh

# Verify METRICS.json
cat METRICS.json
```

### "No changes to README"

**Cause**: Metrics are the same as previous version

**Solution**: This is expected behavior - only updates when metrics change

### "Changes not appearing in README"

**Cause**: sed pattern doesn't match current README format

**Solution**:
1. Check README.md for exact text to match
2. Verify sed patterns in update-readme.sh
3. Test sed patterns manually
4. Update patterns if README format changed

## Related Skills

- **Metrics Validator** (`.github/skills/metrics-validator/validate-metrics.sh`)
  - Extracts metrics from npm run coverage
  - Updates METRICS.json
  - Enforces quality gates

- **Root Directory Enforcer** (`.github/skills/root-enforcer/enforce.sh`)
  - Maintains 6-file root documentation rule
  - Runs before README updater in CI/CD

## For v2.11.0+ Releases

This skill is optimized for v2.11.0 Diamond Tier releases:
- Automatically updates 80.27% coverage threshold
- Updates 3,594 test count
- Maintains Diamond Tier branding in README
- Enforces quality gate messaging

## Customization for Future Releases

To adapt for v2.12.0 or later:

1. **Update sed patterns** in `update-readme.sh` if README structure changes
2. **Modify version detection** logic in `readme-update-on-release.yml` if version format changes
3. **Add new sections** as needed (add new sed commands)

Example for new section:
```bash
# Add new section update
sed -i "s/OLD_TEXT/NEW_TEXT/g" README.md
echo "[OK] Updated new section"
```

## Questions?

- See `.github/skills/metrics-validator/SKILL.md` documentation
- Check GitHub Actions logs in Actions tab for execution details
- Review README.md for current structure
