# Publishing v1.2.2 to VS Code Marketplace

## Overview
This release adds the **Follow-up Questions** feature and **Plan Protection** safeguards.

## Step 1: Take Screenshot of New Feature

**Capture the Follow-up Question UI:**

1. Press F5 to start Extension Development Host
2. Open LLM Assistant chat
3. Run: `/plan Just run npm test`
4. Click `/approve`
5. **When the question appears with buttons**, take a screenshot showing:
   - The question text: "About to run: `npm test`. This might take a while. Should I proceed?"
   - The three buttons: "Yes, proceed" | "No, skip this step" | "Cancel execution"
   - The chat context showing it's part of plan execution

**Screenshot specs:**
- Save as: `assets/phase2.2-follow-up-questions.png`
- Show the full chat panel with the question visible
- Crop to focus on the question and buttons
- Resolution: at least 800px wide

## Step 2: Update README with Screenshot

Add the screenshot to README.md in the Phase 2.2 section:

```markdown
### Phase 2.2: Follow-up Questions ✅

![Follow-up Questions](assets/phase2.2-follow-up-questions.png)

The extension now asks for confirmation before executing potentially risky operations:
- Questions appear directly in the chat with interactive buttons
- User can proceed, skip the step, or cancel execution
- Currently triggers for npm/test commands
- Prevents accidental execution of long-running operations
```

## Step 3: Build VSIX Package

```bash
npm run package
```

This creates: `llm-local-assistant-1.2.2.vsix`

## Step 4: Commit Version Bump

```bash
git add package.json CHANGELOG.md README.md assets/phase2.2-follow-up-questions.png
git commit -m "chore: bump version to 1.2.2 for Phase 2.2 release"
git push origin main
```

## Step 5: Create GitHub Tag

```bash
git tag -a v1.2.2 -m "v1.2.2 - Follow-up Questions & Plan Protection"
git push origin v1.2.2
```

## Step 6: Publish to Marketplace

### Option A: Using vsce (recommended)

```bash
# If not installed:
# npm install -g @vscode/vsce

# Login (if needed)
vsce login odanree

# Publish
vsce publish
```

### Option B: Manual Upload

1. Go to: https://marketplace.visualstudio.com/manage/publishers/odanree
2. Click on "llm-local-assistant"
3. Click "..." menu → "Update"
4. Upload `llm-local-assistant-1.2.2.vsix`
5. Click "Upload"

## Step 7: Update Marketplace Description

In the marketplace web UI, update the description to highlight new features:

**What's New in v1.2.2:**
- ✨ **Follow-up Questions** - Get prompted before executing risky commands
- 🛡️ **Plan Protection** - Prevents accidental overwrites of critical config files
- 🐛 Bug fixes for plan execution flow

## Verification Checklist

- [ ] Screenshot shows question with three buttons clearly
- [ ] README.md includes new screenshot
- [ ] CHANGELOG.md has v1.2.2 entry
- [ ] package.json shows version 1.2.2
- [ ] VSIX builds successfully
- [ ] Git tag created and pushed
- [ ] Extension published to marketplace
- [ ] Marketplace listing updated with new screenshot
- [ ] Test installation from marketplace works

## Rollback (if needed)

```bash
# Revert version
git revert HEAD
git push origin main

# Delete tag
git tag -d v1.2.2
git push origin :refs/tags/v1.2.2

# Unpublish from marketplace (contact support if needed)
```
