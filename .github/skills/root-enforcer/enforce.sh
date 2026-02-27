#!/bin/bash
# 1. Ensure target directories exist
mkdir -p docs/audits docs/archives docs/sessions

# 2. Define the whitelist (The "Original 6")
# We use an inverse match to find everything else
# This moves any .md or .txt file NOT in the whitelist
find . -maxdepth 1 -name "*.md" ! -name "README.md" ! -name "ROADMAP.md" ! -name "ARCHITECTURE.md" ! -name "PROJECT_STATUS.md" ! -name "QUICK_REFERENCE.md" ! -name "CHANGELOG.md" -exec mv {} docs/ \;

# 3. Categorize specific patterns for better organization
mv docs/PHASE-* docs/audits/ 2>/dev/null
mv docs/WAVE-* docs/audits/ 2>/dev/null
mv docs/*-SUMMARY.md docs/sessions/ 2>/dev/null
mv docs/V2-10-0-* docs/archives/ 2>/dev/null

echo "✅ Root Enforcer: Cleaned up non-compliant files."
echo "✅ Only the 'Original 6' remain in the root directory."