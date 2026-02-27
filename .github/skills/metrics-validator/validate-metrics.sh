#!/bin/bash

# Dynamic Metrics Synchronizer
# Runs npm run coverage and extracts actual metrics from the output
# Keeps METRICS.json in sync with real test results and coverage data

# 1. Get Version from package.json
VERSION=$(grep '"version":' package.json | head -1 | grep -o '[0-9.]*')
echo "[*] Detected Version: $VERSION"

# 2. Run npm run coverage to generate fresh metrics
echo "[*] Running npm run coverage to generate fresh metrics..."
npm run coverage > /tmp/coverage-output.txt 2>&1
COVERAGE_EXIT_CODE=$?

if [ $COVERAGE_EXIT_CODE -ne 0 ]; then
    echo "[!] Warning: npm run coverage exited with code $COVERAGE_EXIT_CODE"
fi

# 3. Extract metrics from npm run coverage output
COVERAGE=""
TEST_COUNT=""

echo "[*] Parsing coverage output..."

# Extract test count - look for "XXXX passed" pattern (more precise)
TEST_COUNT=$(grep -o "[0-9]\{3,\} passed" /tmp/coverage-output.txt | head -1 | grep -o "[0-9]\+")
if [ ! -z "$TEST_COUNT" ]; then
    echo "[OK] Extracted Test Count: $TEST_COUNT tests"
fi

# Extract coverage - look for "All files | XX.XX %" pattern (vitest coverage output)
# The coverage line looks like: "All files | 80.27 | 73 | 82.37 | 80.46"
if grep -q "All files" /tmp/coverage-output.txt; then
    # Extract the first percentage value after "All files" (statement coverage)
    COVERAGE=$(grep "All files" /tmp/coverage-output.txt | head -1 | awk '{
        for(i=1; i<=NF; i++) {
            if($i ~ /^[0-9]+\.[0-9]+$/) {
                print $i;
                exit;
            }
        }
    }')
    if [ ! -z "$COVERAGE" ]; then
        echo "[OK] Extracted Coverage: $COVERAGE%"
    fi
fi

# 4. FALLBACK: If both extraction methods failed, exit with error
if [ -z "$COVERAGE" ] || [ -z "$TEST_COUNT" ]; then
    echo ""
    echo "[ERROR] Failed to extract complete metrics from coverage output"
    if [ -z "$TEST_COUNT" ]; then
        echo "        Missing: Test Count"
    fi
    if [ -z "$COVERAGE" ]; then
        echo "        Missing: Coverage percentage"
    fi
    echo ""
    echo "Coverage output (first 50 lines):"
    head -50 /tmp/coverage-output.txt
    rm -f /tmp/coverage-output.txt
    exit 1
fi

# 5. QUALITY GATE: Regression Check (The Quality Gate)
# Diamond Tier threshold: 80.27% (v2.11.0 achievement)
THRESHOLD="80.27"
echo "[*] Checking Quality Gate: Coverage must be >= $THRESHOLD%"

if (( $(echo "$COVERAGE < $THRESHOLD" | bc -l) )); then
    echo ""
    echo "❌ ERROR: Coverage ($COVERAGE%) is below the Diamond Tier threshold ($THRESHOLD%)!"
    echo "This is a regression in code quality."
    echo ""
    echo "Please add tests for your changes before merging:"
    echo "  - Run: npm run test"
    echo "  - Coverage must meet or exceed $THRESHOLD%"
    echo "  - Update CHANGELOG.md with improvements"
    echo ""
    rm -f /tmp/coverage-output.txt
    exit 1
else
    echo "[OK] Quality Gate PASSED: $COVERAGE% >= $THRESHOLD%"
fi

# 6. Check if METRICS.json needs updating (only update if metrics changed, not timestamp)
echo "[*] Checking if METRICS.json needs updating..."

METRICS_CHANGED=false

if [ ! -f METRICS.json ]; then
    echo "[*] METRICS.json does not exist - will create new file"
    METRICS_CHANGED=true
else
    # Extract current metrics from METRICS.json (ignore timestamp)
    OLD_VERSION=$(grep '"version":' METRICS.json | grep -o '[0-9.]*')
    OLD_TESTS=$(grep '"tests":' METRICS.json | grep -o '[0-9]\+')
    OLD_COVERAGE=$(grep '"coverage":' METRICS.json | grep -o '[0-9.]*')

    # Compare with new metrics
    if [ "$VERSION" != "$OLD_VERSION" ] || [ "$TEST_COUNT" != "$OLD_TESTS" ] || [ "$COVERAGE" != "$OLD_COVERAGE" ]; then
        echo "[*] Metrics changed:"
        [ "$VERSION" != "$OLD_VERSION" ] && echo "     Version: $OLD_VERSION → $VERSION"
        [ "$TEST_COUNT" != "$OLD_TESTS" ] && echo "     Tests: $OLD_TESTS → $TEST_COUNT"
        [ "$COVERAGE" != "$OLD_COVERAGE" ] && echo "     Coverage: $OLD_COVERAGE% → $COVERAGE%"
        METRICS_CHANGED=true
    else
        echo "[OK] Metrics unchanged - skipping METRICS.json update"
    fi
fi

# 7. Update METRICS.json only if metrics changed
if [ "$METRICS_CHANGED" = true ]; then
    echo "[*] Updating METRICS.json..."

    cat > METRICS.json << EOF
{
  "version": "$VERSION",
  "tests": ${TEST_COUNT},
  "coverage": ${COVERAGE},
  "lastUpdated": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF

    echo ""
    echo "[OK] METRICS.json updated:"
    echo "     Version: $VERSION"
    echo "     Tests: $TEST_COUNT"
    echo "     Coverage: $COVERAGE%"
    echo ""
    echo "[*] METRICS.json content:"
    cat METRICS.json
else
    echo ""
    echo "[OK] No metric changes - METRICS.json unchanged"
fi

# Cleanup
rm -f /tmp/coverage-output.txt
