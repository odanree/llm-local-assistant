#!/bin/bash

# Dynamic Metrics Synchronizer
# Keeps METRICS.json in sync with actual metrics from package.json and coverage reports
# This approach avoids brittle pattern matching on README.md

# 1. Get Version from package.json
VERSION=$(grep '"version":' package.json | cut -d'"' -f4)
echo "📌 Detected Version: $VERSION"

# 2. Get Coverage from latest report (if available)
if [ -f coverage-summary.json ]; then
    COVERAGE=$(grep -o '"lines":{"total":[0-9]*, "covered":[0-9]*, "skipped":[0-9]*, "pct":[0-9.]*}' coverage-summary.json | cut -d':' -f5 | tr -d ' ')
    echo "📊 Detected Coverage: $COVERAGE%"
fi

# 3. Count tests from vitest results (if available)
if [ -f coverage/coverage-summary.json ]; then
    TEST_COUNT=$(grep -o '"tests":[0-9]*' coverage/coverage-summary.json | head -1 | cut -d':' -f2)
    if [ -z "$TEST_COUNT" ]; then
        # Fallback: try alternative pattern
        TEST_COUNT=$(grep -o '"total":[0-9]*' coverage/coverage-summary.json | head -1 | cut -d':' -f2)
    fi
    echo "🧪 Detected Tests: $TEST_COUNT"
fi

# 4. Create or update METRICS.json with discovered metrics
echo "🔄 Updating METRICS.json..."

# Create/update metrics file with discovered values
cat > METRICS.json << EOF
{
  "version": "$VERSION",
  "tests": ${TEST_COUNT:-0},
  "coverage": ${COVERAGE:-0},
  "lastUpdated": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF

echo ""
echo "✅ Dynamic Metrics Sync Complete:"
echo "   Version: $VERSION"
if [ ! -z "$COVERAGE" ]; then
    echo "   Coverage: $COVERAGE%"
else
    echo "   ⚠️  Coverage: NOT DETECTED"
fi
if [ ! -z "$TEST_COUNT" ]; then
    echo "   Tests: $TEST_COUNT"
else
    echo "   ⚠️  Tests: NOT DETECTED"
fi
echo ""
echo "📝 METRICS.json created with:"
cat METRICS.json
echo ""
echo "README can now reference these metrics from METRICS.json instead of pattern matching."