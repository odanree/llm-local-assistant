# GitHub Actions CI/CD

Automated testing and build pipeline for the LLM Local Assistant extension.

## Workflow: `test.yml`

Runs on every push and pull request to ensure code quality.

### Triggers
- **Push** to: main, develop, feat/*, fix/*
- **Pull Request** to: main, develop

### Jobs

#### 1. **Test** (Primary)
Runs on: Ubuntu (Node 18.x, 20.x)

Steps:
- ✅ Checkout code
- ✅ Setup Node.js with cache
- ✅ Install dependencies (`npm ci`)
- ✅ Run linter (`npm run lint`)
- ✅ Type check (`npm run type-check`)
- ✅ **Run tests** (`npm test` - **273 tests**)
- ✅ Build extension (`npm run compile`)
- ✅ Upload coverage to Codecov

**Result**: Green check when all tests pass

#### 2. **Quality** (Secondary)
Runs after: Test job

Steps:
- Type checking (continue on error)
- ESLint validation (continue on error)

**Purpose**: Additional code quality checks (non-blocking)

#### 3. **Package** (Conditional)
Runs after: Test job
**Only on**: main branch, push events

Steps:
- Build the extension
- Package as .vsix (if npm run package exists)

**Purpose**: Ensure extension can be packaged for release

## Expected Output

### On Successful PR
```
✅ test (18.x) - All tests passed
✅ test (20.x) - All tests passed  
✅ quality - Type check & ESLint passed
```

### On Test Failure
```
❌ test (20.x) - npm test failed
   273 tests run, 1 failed, 272 passed
```

Pull request is blocked until tests pass.

## Local Testing Before Push

Before pushing, run locally:
```bash
npm run lint
npm run type-check
npm test
npm run compile
```

## Configuration

### Scripts Required (package.json)
```json
{
  "scripts": {
    "lint": "eslint src",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "compile": "webpack"
  }
}
```

### Coverage Reporting
- Codecov integration (optional)
- Uploads coverage after tests
- Non-blocking if upload fails

## Customization

### Add More Checks
Edit `.github/workflows/test.yml`:
- Add Docker tests
- Add security scans
- Add performance benchmarks

### Change Node Versions
```yaml
matrix:
  node-version: [18.x, 20.x, 21.x]
```

### Notify on Failure
Add to workflow:
```yaml
- name: Slack notification
  if: failure()
  uses: 8398a7/action-slack@v3
```

## Status Badge

Add to README.md:
```markdown
[![Tests](https://github.com/odanree/llm-local-assistant/workflows/Test%20&%20Build/badge.svg)](https://github.com/odanree/llm-local-assistant/actions)
```

## Troubleshooting

### "npm ci failed"
- Check package-lock.json is committed
- Verify Node version in matrix

### "Tests timeout"
- Increase timeout in vitest.config.ts
- Check for infinite loops in tests

### "Coverage upload failed"
- Non-blocking by design (continue on error)
- Check Codecov token if needed
