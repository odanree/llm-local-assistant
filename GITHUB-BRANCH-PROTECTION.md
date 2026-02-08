# GitHub Branch Protection Rules Setup

## Overview
Protects the `main` branch from direct commits and requires all changes to go through pull requests with reviews.

## Why Branch Protection?
- ✅ Prevents accidental commits to main
- ✅ Requires PR reviews before merging
- ✅ Ensures CI/CD tests pass
- ✅ Maintains code quality
- ✅ Creates audit trail for all changes

## Setup Instructions

### Method 1: GitHub Web UI (Recommended)

1. **Go to Repository Settings**
   - Navigate to: https://github.com/odanree/llm-local-assistant/settings/branches
   - Or: Repository → Settings → Branches

2. **Add Branch Protection Rule**
   - Click "Add rule"
   - Branch name pattern: `main`

3. **Configure Protection Settings**

   **Require status checks to pass before merging:**
   - ✅ Enable "Require branches to be up to date before merging"
   - ✅ Require status checks to pass
   - Select checks: "Test & Build" (from GitHub Actions)

   **Require pull request reviews:**
   - ✅ Require pull requests before merging
   - ✅ Require 1 approval
   - ✅ Dismiss stale pull request approvals when new commits are pushed

   **Restrict who can push to matching branches:**
   - ✅ Allow specified actors to bypass pull request requirements (set to yourself)

   **Other settings:**
   - ✅ Require code owner reviews (optional)
   - ✅ Require status checks to pass (already enabled)
   - ✅ Include administrators (important!)
   - ✅ Restrict who can push to matching branches (optional)

4. **Click "Create"**

### Method 2: GitHub CLI (If Permissions Allow)

```bash
# Run from repo directory
gh api -X PUT /repos/odanree/llm-local-assistant/branches/main/protection \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f required_pull_request_reviews[dismiss_stale_reviews]=true \
  -f enforce_admins=true \
  -f allow_deletions=false \
  -f allow_force_pushes=false
```

## Settings Explanation

| Setting | Enabled | Why |
|---------|---------|-----|
| **Require PR reviews** | ✅ | All changes reviewed before merging |
| **Require 1 approval** | ✅ | At least one reviewer approval needed |
| **Status checks** | ✅ | Tests must pass before merging |
| **Dismiss stale reviews** | ✅ | Re-review if code changes |
| **Enforce on admins** | ✅ | Rules apply to everyone, including admins |
| **Allow force pushes** | ❌ | Prevents history rewriting |
| **Allow deletions** | ❌ | Prevents branch deletion |

## Workflow After Protection Enabled

### Before (Current):
```
Developer → git commit → git push origin main ✅
```

### After (Protected):
```
Developer → Create branch
          → git commit & push to feature branch
          → Create Pull Request
          → CI/CD tests run automatically
          → Reviewer approves
          → Merge via GitHub UI ✅
```

## PR Workflow Template

**1. Create Feature Branch:**
```bash
git checkout -b feat/description-of-feature
```

**2. Make Changes & Commit:**
```bash
git add src/file.ts
git commit -m "feat: add new feature"
```

**3. Push to GitHub:**
```bash
git push origin feat/description-of-feature
```

**4. Create Pull Request:**
- Go to: https://github.com/odanree/llm-local-assistant/pulls
- Click "New pull request"
- Select: `main` ← `feat/description-of-feature`
- Add title & description
- Click "Create pull request"

**5. CI/CD Runs Automatically:**
- GitHub Actions runs tests
- Must pass before merge option appears

**6. Review & Approve:**
- Reviewer checks code
- Reviewer clicks "Approve"
- Merge button becomes available

**7. Merge to Main:**
- Click "Merge pull request"
- Optionally delete feature branch
- Done! ✅

## Bypassing Protection (If Needed)

If you absolutely need to commit directly to main:

1. Go to Repository Settings → Branches
2. Find "main" branch rule
3. Check "Allow specified actors to bypass..."
4. Add your GitHub username
5. You can now push directly (not recommended!)

**Better alternative:** Use a PR even for yourself - it keeps history clean.

## Verifying Protection is Active

### Check GitHub Web UI:
1. Go to Settings → Branches
2. Should see "main" with green checkmark
3. Rule should show all protections enabled

### Check CLI:
```bash
gh api repos/odanree/llm-local-assistant/branches/main/protection
```

Should output protection rules in JSON format.

## Troubleshooting

### "Cannot push to main - protection enabled"
- Expected behavior! Use PR workflow instead
- Create feature branch and PR

### "CI/CD checks failed"
- Tests must pass before merge
- Fix failing tests and push to feature branch
- GitHub Actions re-runs automatically

### "Merge blocked - need review"
- Request review from team member
- They approve → merge button appears

### "Need to bypass (emergency)"
- Contact repo admin
- Temporarily disable rule if critical
- Re-enable immediately after
- Document why it was needed

## Best Practices

✅ **DO:**
- Use descriptive branch names: `feat/feature-name`, `fix/bug-name`
- Write clear commit messages
- Keep PRs focused (one feature per PR)
- Request review before merging
- Delete feature branch after merge

❌ **DON'T:**
- Force push to main
- Bypass protection unless emergency
- Merge without review
- Mix unrelated changes in one PR
- Leave feature branches lying around

## Next Steps

1. [ ] Go to Settings → Branches
2. [ ] Add branch protection rule for `main`
3. [ ] Enable all recommended settings
4. [ ] Test by trying to push to main (should fail)
5. [ ] Test PR workflow (should work)
6. [ ] Document in team guidelines

## Questions?

Refer to GitHub Docs:
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule
