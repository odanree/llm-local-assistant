#!/bin/bash

# 🏛️ Quality Gate Validator (v2.13.0)
# Minimal validation: Just verify docs/METRICS.json exists and is valid.
# No metric generation, no coverage runs, no threshold checking.

echo "═══════════════════════════════════════════════════════════"
echo "🏛️ Quality Gate Validator"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Verify docs/METRICS.json exists
if [ ! -f docs/METRICS.json ]; then
    echo "❌ ERROR: docs/METRICS.json not found!"
    echo ""
    echo "docs/METRICS.json must exist at docs/METRICS.json and track project quality metrics."
    echo "Update it after test runs with coverage results."
    exit 1
fi

echo "✅ docs/METRICS.json found"

# 2. Verify valid JSON format
if ! grep -q '"coverage":' docs/METRICS.json; then
    echo "❌ ERROR: docs/METRICS.json missing required 'coverage' field"
    exit 1
fi

if ! grep -q '"version":' docs/METRICS.json; then
    echo "❌ ERROR: docs/METRICS.json missing required 'version' field"
    exit 1
fi

echo "✅ docs/METRICS.json has required fields"
echo ""

echo "✅ Quality gate validation complete"
