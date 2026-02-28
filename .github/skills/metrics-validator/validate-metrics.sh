#!/bin/bash

# 🏛️ Quality Gate Validator (v2.13.0)
# PURE quality gate check - no metrics generation, no coverage runs.
# Simply validates that METRICS.json declares a coverage >= minimum threshold.

echo "═══════════════════════════════════════════════════════════"
echo "🏛️ Quality Gate Validator - Diamond Tier Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Read metrics from METRICS.json
if [ ! -f METRICS.json ]; then
    echo "❌ ERROR: METRICS.json not found!"
    echo ""
    echo "To fix: Run tests, then update METRICS.json with coverage results:"
    echo "  npm run coverage"
    echo "  # Edit METRICS.json with the results"
    exit 1
fi

echo "[*] Reading metrics from METRICS.json..."
DECLARED_VERSION=$(grep '"version":' METRICS.json | grep -o '[0-9.]*')
DECLARED_TESTS=$(grep '"tests":' METRICS.json | grep -o '[0-9]\+')
DECLARED_COVERAGE=$(grep '"coverage":' METRICS.json | grep -o '[0-9.]*')

if [ -z "$DECLARED_COVERAGE" ]; then
    echo "❌ ERROR: Could not parse coverage from METRICS.json"
    exit 1
fi

echo "    Version:  $DECLARED_VERSION"
echo "    Tests:    $DECLARED_TESTS"
echo "    Coverage: $DECLARED_COVERAGE%"
echo ""

# 2. QUALITY GATE: Enforce Diamond Tier minimum (81.21%)
echo "🏛️ Enforcing Quality Gate (Diamond Tier: 81.21%)..."
MINIMUM_THRESHOLD="81.21"

if (( $(echo "$DECLARED_COVERAGE < $MINIMUM_THRESHOLD" | bc -l) )); then
    echo ""
    echo "❌ QUALITY GATE FAILED!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Coverage Below Diamond Tier:"
    echo "  Declared: $DECLARED_COVERAGE%"
    echo "  Minimum:  $MINIMUM_THRESHOLD% (Diamond Tier)"
    echo ""
    echo "To fix:"
    echo "  1. Add tests for your changes (npm run test)"
    echo "  2. Run coverage: npm run coverage"
    echo "  3. Update METRICS.json with new results"
    echo "  4. Push changes - gate will pass when coverage meets threshold"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    exit 1
else
    echo "✅ Quality Gate PASSED"
    echo "   Coverage: $DECLARED_COVERAGE% >= $MINIMUM_THRESHOLD% (Diamond Tier)"
    echo ""
fi

echo "✅ Validation complete"
