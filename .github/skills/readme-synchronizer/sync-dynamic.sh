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

# 5. Update METRICS.json with extracted values
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
echo "[OK] Dynamic Metrics Sync Complete:"
echo "     Version: $VERSION"
echo "     Tests: $TEST_COUNT"
echo "     Coverage: $COVERAGE%"
echo ""
echo "[*] METRICS.json content:"
cat METRICS.json

# Cleanup
rm -f /tmp/coverage-output.txt
