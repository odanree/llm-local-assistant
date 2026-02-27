#!/bin/bash

# README Auto-Updater for Semantic Releases
# Automatically updates README.md with latest metrics on every semantic release
# Usage: sh .github/skills/readme-updater/update-readme.sh

set -e

echo "[*] README Auto-Updater for Semantic Releases"
echo "[*] ============================================"

# 1. Extract metrics from METRICS.json
echo "[*] Reading metrics from METRICS.json..."
VERSION=$(grep '"version":' METRICS.json | head -1 | grep -o '[0-9.]*')
TEST_COUNT=$(grep '"tests":' METRICS.json | grep -o '[0-9]\+')
COVERAGE=$(grep '"coverage":' METRICS.json | grep -o '[0-9.]*')

if [ -z "$VERSION" ] || [ -z "$TEST_COUNT" ] || [ -z "$COVERAGE" ]; then
    echo "[ERROR] Failed to extract metrics from METRICS.json"
    echo "        Version: $VERSION"
    echo "        Tests: $TEST_COUNT"
    echo "        Coverage: $COVERAGE"
    exit 1
fi

echo "[OK] Extracted metrics:"
echo "     Version: $VERSION"
echo "     Tests: $TEST_COUNT"
echo "     Coverage: $COVERAGE%"

# 2. Update header badges
echo "[*] Updating header badges..."
sed -i "s/\[!\[Tests\](.*tests-[0-9]*\\\%2F[0-9]*[^)]*)\]/[!\[Tests\](https:\/\/img.shields.io\/badge\/tests-${TEST_COUNT}%2F${TEST_COUNT}%20passing-brightgreen.svg)](https:\/\/github.com\/odanree\/llm-local-assistant\/actions)/g" README.md
sed -i "s/\[!\[Code Coverage\](.*coverage-[0-9.]*\\\%25[^)]*)\]/[!\[Code Coverage\](https:\/\/img.shields.io\/badge\/coverage-${COVERAGE}%25-brightgreen.svg)](#testing--coverage)/g" README.md
echo "[OK] Updated header badges"

# 3. Update quick description
echo "[*] Updating quick description..."
# Update test count in description
sed -i "s/Comprehensive test suite with [0-9]* tests/Comprehensive test suite with $TEST_COUNT tests/g" README.md
# Update coverage in description
sed -i "s/and [0-9.]*% coverage/and $COVERAGE% coverage/g" README.md
echo "[OK] Updated quick description"

# 4. Update version badges in release section
echo "[*] Updating release section badges..."
sed -i "s/v2\.[0-9]\.[0-9] - \*\*Diamond Tier Achievement\*\*: [0-9]* comprehensive tests, [0-9.]*% coverage/v$VERSION - **Diamond Tier Achievement**: $TEST_COUNT comprehensive tests, $COVERAGE% coverage/g" README.md
echo "[OK] Updated release section"

# 5. Update v2.11.0 Diamond Tier section
echo "[*] Updating v2.11.0 Diamond Tier Achievement section..."
# Calculate coverage gain from baseline (76.09%)
BASELINE_COVERAGE="76.09"
COVERAGE_GAIN=$(echo "$COVERAGE - $BASELINE_COVERAGE" | bc -l | sed 's/[^0-9.]*//g')

sed -i "s/- Tests: [0-9]*\/[0-9]* passing/- Tests: $TEST_COUNT\/$TEST_COUNT passing/g" README.md
sed -i "s/- Coverage: [0-9.]*% achieved/- Coverage: $COVERAGE% achieved/g" README.md
echo "[OK] Updated v2.11.0 section with metrics"

# 6. Update Quality & Testing section
echo "[*] Updating Quality & Testing section..."
sed -i "s/\*\*3,[0-9]* tests\*\*/\*\*$TEST_COUNT tests\*\*/g" README.md
sed -i "s/\*\*[0-9.]*% coverage\*\*/\*\*$COVERAGE% coverage\*\*/g" README.md
echo "[OK] Updated Quality & Testing section"

# 7. Update footer
echo "[*] Updating footer..."
sed -i "s/| 🧪 [0-9,]* Tests Passing/| 🧪 $TEST_COUNT Tests Passing/g" README.md
sed -i "s/| 📊 [0-9.]*% Coverage/| 📊 $COVERAGE% Coverage/g" README.md
echo "[OK] Updated footer"

# 8. Check if README was modified
if git diff --quiet README.md; then
    echo "[OK] No changes to README (metrics unchanged)"
    exit 0
fi

# 9. Stage and commit changes
echo "[*] Committing README updates..."
git add README.md

git commit -m "$(cat <<'EOF'
chore(docs): auto-update README metrics for semantic release

- Updated badges with latest test count and coverage
- Updated v2.11.0 Diamond Tier section with current metrics
- Updated Quality & Testing section
- Updated footer with release metrics

[skip ci]
EOF
)"

echo "[OK] README successfully updated and committed"
echo ""
echo "[Summary]"
echo "  Version: $VERSION"
echo "  Tests: $TEST_COUNT"
echo "  Coverage: $COVERAGE%"
echo ""
echo "✅ README Auto-Update Complete"
