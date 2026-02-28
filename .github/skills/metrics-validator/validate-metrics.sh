#!/bin/bash

# 🏛️ Quality Gate Validator (v2.13.0)
# Minimal validation: Just verify METRICS.json exists and is valid.
# No metric generation, no coverage runs, no threshold checking.

echo "═══════════════════════════════════════════════════════════"
echo "🏛️ Quality Gate Validator"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Verify METRICS.json exists
if [ ! -f METRICS.json ]; then
    echo "❌ ERROR: METRICS.json not found!"
    echo ""
    echo "METRICS.json must exist and track project quality metrics."
    echo "Update it after test runs with coverage results."
    exit 1
fi

echo "✅ METRICS.json found"

# 2. Verify valid JSON format
if ! grep -q '"coverage":' METRICS.json; then
    echo "❌ ERROR: METRICS.json missing required 'coverage' field"
    exit 1
fi

if ! grep -q '"version":' METRICS.json; then
    echo "❌ ERROR: METRICS.json missing required 'version' field"
    exit 1
fi

echo "✅ METRICS.json has required fields"
echo ""

echo "✅ Quality gate validation complete"
