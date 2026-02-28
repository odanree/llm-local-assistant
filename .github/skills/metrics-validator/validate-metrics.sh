#!/bin/bash

# 🏛️ Quality Gate Validator (v2.13.0)
# ONLY enforces the quality gate check.
# Metric generation is managed separately via manual METRICS.json updates.

echo "═══════════════════════════════════════════════════════════"
echo "🏛️ Quality Gate Validator - Diamond Tier Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Read expected metrics from METRICS.json
if [ ! -f METRICS.json ]; then
    echo "❌ ERROR: METRICS.json not found!"
    echo "Please run: npm run coverage && update METRICS.json manually"
    exit 1
fi

echo "[*] Reading quality gate thresholds from METRICS.json..."
EXPECTED_VERSION=$(grep '"version":' METRICS.json | grep -o '[0-9.]*')
EXPECTED_TESTS=$(grep '"tests":' METRICS.json | grep -o '[0-9]\+')
EXPECTED_COVERAGE=$(grep '"coverage":' METRICS.json | grep -o '[0-9.]*')

echo "    Expected Version:  $EXPECTED_VERSION"
echo "    Expected Tests:    $EXPECTED_TESTS"
echo "    Expected Coverage: $EXPECTED_COVERAGE%"
echo ""

# 2. Run npm run coverage to get current metrics
echo "[*] Running npm run coverage to check current metrics..."
npm run coverage > /tmp/coverage-output.txt 2>&1
COVERAGE_EXIT_CODE=$?

if [ $COVERAGE_EXIT_CODE -ne 0 ]; then
    echo "[!] Warning: npm run coverage exited with code $COVERAGE_EXIT_CODE"
fi

# 3. Extract current coverage from output
COVERAGE=""
if grep -q "All files" /tmp/coverage-output.txt; then
    COVERAGE=$(grep "All files" /tmp/coverage-output.txt | head -1 | awk '{
        for(i=1; i<=NF; i++) {
            if($i ~ /^[0-9]+\.[0-9]+$/) {
                print $i;
                exit;
            }
        }
    }')
fi

if [ -z "$COVERAGE" ]; then
    echo "❌ ERROR: Could not extract coverage from test output"
    head -50 /tmp/coverage-output.txt
    rm -f /tmp/coverage-output.txt
    exit 1
fi

echo "[OK] Current Coverage: $COVERAGE%"
echo ""

# 4. QUALITY GATE: Regression Prevention
echo "🏛️ Enforcing Quality Gate..."
THRESHOLD="$EXPECTED_COVERAGE"

if (( $(echo "$COVERAGE < $THRESHOLD" | bc -l) )); then
    echo ""
    echo "❌ QUALITY GATE FAILED!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Coverage Regression Detected:"
    echo "  Current:  $COVERAGE%"
    echo "  Minimum:  $THRESHOLD% (Diamond Tier)"
    echo ""
    echo "This indicates a loss of test coverage. Please:"
    echo "  1. Add tests for your changes"
    echo "  2. Run: npm run test"
    echo "  3. Verify coverage meets the minimum"
    echo "  4. Update METRICS.json with new coverage value"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    rm -f /tmp/coverage-output.txt
    exit 1
else
    echo "✅ Quality Gate PASSED"
    echo "   Coverage: $COVERAGE% >= $THRESHOLD% (Diamond Tier)"
    echo ""
fi

# Cleanup
rm -f /tmp/coverage-output.txt
echo "✅ Quality gate validation complete"
