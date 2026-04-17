/**
 * planner-filter-methods.test.ts
 *
 * Targeted coverage for the five post-parse filter methods and two
 * template-validation helpers that remain uncovered in planner.ts.
 *
 * Uncovered lines addressed:
 *   973       — validatePlanAgainstTemplates: cn.ts step log
 *   988       — getTemplateKeyForPath: CN_UTILITY return
 *   1035-1036 — filterNoisyReadSteps: trailing-read drop + return false
 *   1041      — filterNoisyReadSteps: dropped-count log
 *   1070      — filterUnrequestedEntryWrites: fileName extraction
 *   1073-1074 — filterUnrequestedEntryWrites: drop log + return false
 *   1079      — filterUnrequestedEntryWrites: dropped-count log
 *   1091-1103 — filterTestSteps: entire method
 *   1117-1120 — stripStaleDependencies: stale-dep removal
 *   1134-1186 — filterRedundantWrites: entire method
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Planner, ExecutionStep, PlannerConfig } from '../planner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides?: Partial<PlannerConfig>): PlannerConfig => ({
  llmCall: vi.fn().mockResolvedValue('mock response'),
  onProgress: vi.fn(),
  projectContext: {
    language: 'TypeScript',
    strategy: 'SCAFFOLD_MODE',
    extension: '.tsx',
    root: '/workspace',
    isMinimalProject: false,
  },
  ...overrides,
});

const step = (overrides: Partial<ExecutionStep>): ExecutionStep => ({
  id: `step-${Math.random().toString(36).slice(2, 6)}`,
  action: 'write',
  path: 'src/Component.tsx',
  description: 'test step',
  reasoning: 'test',
  ...overrides,
});

// Call a private method on Planner via type erasure
const call = <T>(planner: Planner, method: string, ...args: unknown[]): T =>
  (planner as any)[method](...args) as T;

// ---------------------------------------------------------------------------
// getTemplateKeyForPath
// ---------------------------------------------------------------------------

describe('Planner — getTemplateKeyForPath()', () => {
  let planner: Planner;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('returns CN_UTILITY for paths ending in cn.ts', () => {
    expect(call(planner, 'getTemplateKeyForPath', 'src/utils/cn.ts')).toBe('CN_UTILITY');
  });

  it('returns CN_UTILITY for paths ending in cn.js', () => {
    expect(call(planner, 'getTemplateKeyForPath', 'src/utils/cn.js')).toBe('CN_UTILITY');
  });

  it('returns null for unrecognised paths', () => {
    expect(call(planner, 'getTemplateKeyForPath', 'src/utils/clsx.ts')).toBeNull();
  });

  it('returns null for paths that merely contain "cn" mid-name', () => {
    expect(call(planner, 'getTemplateKeyForPath', 'src/utils/icon.ts')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validatePlanAgainstTemplates
// ---------------------------------------------------------------------------

describe('Planner — validatePlanAgainstTemplates()', () => {
  let planner: Planner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('logs preflight info for a write step targeting cn.ts', () => {
    const plan = {
      steps: [step({ action: 'write', path: 'src/utils/cn.ts' })],
      reasoning: 'test',
      userRequest: 'create cn utility',
    };
    call(planner, 'validatePlanAgainstTemplates', plan);
    // Should log the "will be validated during execution" message (line 973)
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/will be validated during execution/i);
  });

  it('logs completion message for plans with non-template write steps', () => {
    const plan = {
      steps: [step({ action: 'write', path: 'src/Component.tsx' })],
      reasoning: 'test',
      userRequest: 'create component',
    };
    call(planner, 'validatePlanAgainstTemplates', plan);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Pre-flight validation complete/i);
  });

  it('does not log template info for read steps on cn.ts', () => {
    const plan = {
      steps: [step({ action: 'read', path: 'src/utils/cn.ts' })],
      reasoning: 'test',
      userRequest: 'read cn',
    };
    call(planner, 'validatePlanAgainstTemplates', plan);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).not.toMatch(/will be validated during execution/i);
  });
});

// ---------------------------------------------------------------------------
// filterNoisyReadSteps
// ---------------------------------------------------------------------------

describe('Planner — filterNoisyReadSteps()', () => {
  let planner: Planner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('keeps all steps when plan has no WRITE steps', () => {
    const steps = [
      step({ id: 'r1', action: 'read', path: 'src/A.ts' }),
      step({ id: 'r2', action: 'read', path: 'src/B.ts' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterNoisyReadSteps', steps);
    expect(result).toHaveLength(2);
  });

  it('drops trailing READ with no downstream WRITE (line 1035-1036)', () => {
    const steps = [
      step({ id: 'r1', action: 'read', path: 'src/A.ts' }),
      step({ id: 'w1', action: 'write', path: 'src/B.ts' }),
      step({ id: 'r2', action: 'read', path: 'src/C.ts' }),  // trailing — no write after
    ];
    const result = call<ExecutionStep[]>(planner, 'filterNoisyReadSteps', steps);
    expect(result.map(s => s.id)).toEqual(['r1', 'w1']);
  });

  it('logs the dropped step path (line 1035)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/B.ts' }),
      step({ id: 'r1', action: 'read', path: 'src/C.ts' }),
    ];
    call(planner, 'filterNoisyReadSteps', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Dropped noise READ step/);
    expect(logged).toMatch(/src\/C\.ts/);
  });

  it('logs dropped-count summary when steps are removed (line 1041)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/B.ts' }),
      step({ id: 'r1', action: 'read', path: 'src/C.ts' }),
    ];
    call(planner, 'filterNoisyReadSteps', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Filtered 1 noise READ step/);
  });

  it('keeps READ that has a WRITE targeting the same path (refactor pattern)', () => {
    const steps = [
      step({ id: 'r1', action: 'read', path: 'src/Foo.ts' }),
      step({ id: 'w1', action: 'write', path: 'src/Foo.ts' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterNoisyReadSteps', steps);
    expect(result.map(s => s.id)).toEqual(['r1', 'w1']);
  });

  it('keeps READ when there is a WRITE after it even to a different file', () => {
    const steps = [
      step({ id: 'r1', action: 'read', path: 'src/A.ts' }),
      step({ id: 'w1', action: 'write', path: 'src/B.ts' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterNoisyReadSteps', steps);
    expect(result).toHaveLength(2);
  });

  it('does not log when nothing is dropped', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/A.ts' }),
    ];
    call(planner, 'filterNoisyReadSteps', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).not.toMatch(/noise READ/);
  });
});

// ---------------------------------------------------------------------------
// filterUnrequestedEntryWrites
// ---------------------------------------------------------------------------

describe('Planner — filterUnrequestedEntryWrites()', () => {
  let planner: Planner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('drops WRITE to App.tsx when user request does not mention App (lines 1073-1074)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/Button.tsx' }),
      step({ id: 'w2', action: 'write', path: 'src/App.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'add a button component');
    expect(result.map(s => s.id)).toEqual(['w1']);
  });

  it('drops WRITE to main.tsx when not in user request', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/main.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'add a card');
    expect(result).toHaveLength(0);
  });

  it('drops WRITE to layout.tsx when not in user request', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/layout.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'add nav bar');
    expect(result).toHaveLength(0);
  });

  it('drops WRITE to index.tsx when not in user request', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/index.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'add a table');
    expect(result).toHaveLength(0);
  });

  it('keeps WRITE to App.tsx when user request explicitly names App (line 1071)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/App.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'update App to add routing');
    expect(result.map(s => s.id)).toEqual(['w1']);
  });

  it('keeps non-entry WRITE steps untouched', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/Button.tsx' }),
      step({ id: 'w2', action: 'write', path: 'src/Card.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'add components');
    expect(result).toHaveLength(2);
  });

  it('logs the dropped step (line 1073)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/App.tsx' }),
    ];
    call(planner, 'filterUnrequestedEntryWrites', steps, 'add a modal');
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/dropped unrequested WRITE/i);
    expect(logged).toMatch(/App\.tsx/);
  });

  it('logs dropped-count summary (line 1079)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/App.tsx' }),
    ];
    call(planner, 'filterUnrequestedEntryWrites', steps, 'add a modal');
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Removed 1 unrequested entry-file/);
  });

  it('does not drop READ steps to entry files', () => {
    const steps = [
      step({ id: 'r1', action: 'read', path: 'src/App.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterUnrequestedEntryWrites', steps, 'add a card');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// filterTestSteps
// ---------------------------------------------------------------------------

describe('Planner — filterTestSteps()', () => {
  let planner: Planner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('removes a vitest RUN step (lines 1091-1103)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/Foo.ts' }),
      step({ id: 'r1', action: 'run', path: undefined, command: 'npx vitest', description: 'Run tests' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterTestSteps', steps);
    expect(result.map(s => s.id)).toEqual(['w1']);
  });

  it('removes a jest RUN step', () => {
    const steps = [
      step({ id: 'r1', action: 'run', command: 'jest --coverage', description: 'jest' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterTestSteps', steps);
    expect(result).toHaveLength(0);
  });

  it('removes npm test RUN step', () => {
    const steps = [
      step({ id: 'r1', action: 'run', command: 'npm test', description: 'run tests' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterTestSteps', steps);
    expect(result).toHaveLength(0);
  });

  it('removes yarn test RUN step', () => {
    const steps = [
      step({ id: 'r1', action: 'run', command: 'yarn test', description: 'yarn' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterTestSteps', steps);
    expect(result).toHaveLength(0);
  });

  it('keeps non-test RUN steps', () => {
    const steps = [
      step({ id: 'r1', action: 'run', command: 'npm run build', description: 'build' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterTestSteps', steps);
    expect(result).toHaveLength(1);
  });

  it('logs the dropped step (line 1094)', () => {
    const steps = [
      step({ id: 'r1', action: 'run', command: 'vitest run', description: 'run vitest' }),
    ];
    call(planner, 'filterTestSteps', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/filterTestSteps: removed test step/);
  });

  it('logs dropped-count summary (line 1100-1101)', () => {
    const steps = [
      step({ id: 'r1', action: 'run', command: 'vitest run', description: 'run vitest' }),
    ];
    call(planner, 'filterTestSteps', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Filtered 1 test step/);
  });

  it('does not log when nothing is dropped', () => {
    const steps = [step({ id: 'w1', action: 'write' })];
    call(planner, 'filterTestSteps', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).not.toMatch(/test step/);
  });
});

// ---------------------------------------------------------------------------
// stripStaleDependencies
// ---------------------------------------------------------------------------

describe('Planner — stripStaleDependencies()', () => {
  let planner: Planner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('removes stale dependsOn refs when a step has been filtered away (lines 1117-1118)', () => {
    const steps = [
      step({ id: 'step-A', action: 'write', path: 'src/A.ts' }),
      step({ id: 'step-B', action: 'write', path: 'src/B.ts', dependsOn: ['step-A', 'step-deleted'] }),
    ];
    const result = call<ExecutionStep[]>(planner, 'stripStaleDependencies', steps);
    expect(result.find(s => s.id === 'step-B')?.dependsOn).toEqual(['step-A']);
  });

  it('logs the removal when stale deps are stripped', () => {
    const steps = [
      step({ id: 'step-A', action: 'write' }),
      step({ id: 'step-B', action: 'write', dependsOn: ['step-A', 'gone'] }),
    ];
    call(planner, 'stripStaleDependencies', steps);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/stripStaleDependencies: removed.*stale dep/i);
  });

  it('leaves dependsOn intact when all deps are present', () => {
    const steps = [
      step({ id: 'step-A', action: 'write' }),
      step({ id: 'step-B', action: 'write', dependsOn: ['step-A'] }),
    ];
    const result = call<ExecutionStep[]>(planner, 'stripStaleDependencies', steps);
    expect(result.find(s => s.id === 'step-B')?.dependsOn).toEqual(['step-A']);
  });

  it('passes through steps with no dependsOn unchanged', () => {
    const steps = [
      step({ id: 'step-A', action: 'write' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'stripStaleDependencies', steps);
    expect(result).toHaveLength(1);
  });

  it('passes through steps with empty dependsOn unchanged', () => {
    const steps = [
      step({ id: 'step-A', action: 'write', dependsOn: [] }),
    ];
    const result = call<ExecutionStep[]>(planner, 'stripStaleDependencies', steps);
    expect(result[0].dependsOn).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterRedundantWrites
// ---------------------------------------------------------------------------

describe('Planner — filterRedundantWrites()', () => {
  let planner: Planner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    planner = new Planner(makeConfig());
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('returns steps unchanged when ragContext has no path entries (line 1145)', () => {
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/utils/cn.ts' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterRedundantWrites', steps, '', undefined);
    expect(result).toHaveLength(1);
  });

  it('drops WRITE for utility file that is in RAG context (Case A, line 1165-1168)', () => {
    const ragContext = '- src/utils/cn.ts (utility) — Tailwind merge helper\n';
    const steps = [
      step({ id: 'w1', action: 'write', path: 'src/utils/cn.ts' }),
      step({ id: 'w2', action: 'write', path: 'src/Component.tsx' }),
    ];
    const result = call<ExecutionStep[]>(planner, 'filterRedundantWrites', steps, ragContext, undefined);
    expect(result.map(s => s.id)).toEqual(['w2']);
  });

  it('logs when a RAG-resident utility is dropped', () => {
    const ragContext = '- src/utils/cn.ts (utility) — helper\n';
    const steps = [step({ id: 'w1', action: 'write', path: 'src/utils/cn.ts' })];
    call(planner, 'filterRedundantWrites', steps, ragContext, undefined);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Dropped redundant WRITE for existing RAG file/);
  });

  it('logs dropped-count summary (line 1180-1183)', () => {
    const ragContext = '- src/utils/cn.ts (utility) — helper\n';
    const steps = [step({ id: 'w1', action: 'write', path: 'src/utils/cn.ts' })];
    call(planner, 'filterRedundantWrites', steps, ragContext, undefined);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toMatch(/Filtered 1 redundant WRITE step/);
  });

  it('keeps WRITE for component files even when listed in RAG context', () => {
    // Component files are NOT utility-layer paths — they should not be filtered
    const ragContext = '- src/components/Button.tsx (component) — button\n';
    const steps = [step({ id: 'w1', action: 'write', path: 'src/components/Button.tsx' })];
    const result = call<ExecutionStep[]>(planner, 'filterRedundantWrites', steps, ragContext, undefined);
    // Button.tsx is in RAG but NOT a utility path, so Case A requires isUtility = true
    // Since it's not utility, it should be kept
    expect(result).toHaveLength(1);
  });

  it('keeps READ steps regardless of RAG context', () => {
    const ragContext = '- src/utils/cn.ts (utility) — helper\n';
    const steps = [step({ id: 'r1', action: 'read', path: 'src/utils/cn.ts' })];
    const result = call<ExecutionStep[]>(planner, 'filterRedundantWrites', steps, ragContext, undefined);
    expect(result).toHaveLength(1);
  });

  it('does not log when nothing is dropped', () => {
    const steps = [step({ id: 'w1', action: 'write', path: 'src/Foo.tsx' })];
    call(planner, 'filterRedundantWrites', steps, '', undefined);
    const logged = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).not.toMatch(/redundant WRITE/);
  });
});

// ---------------------------------------------------------------------------
// generatePlan — userRequestedTests guard (integration)
// Verifies that filterTestSteps fires when hasTests=true but the user
// request contains no test-related keywords (the new guard added in fix).
// ---------------------------------------------------------------------------

describe('Planner — generatePlan() userRequestedTests guard', () => {
  const llmResponseWithTestStep = JSON.stringify([
    { step: 1, action: 'write', path: 'src/RegisterForm.tsx', description: 'Create form' },
    { step: 2, action: 'run', command: 'npx vitest run', description: 'Run vitest' },
  ]);

  const makeIntegrationPlanner = (hasTests: boolean) =>
    new Planner({
      llmCall: vi.fn().mockResolvedValue(llmResponseWithTestStep),
      onProgress: vi.fn(),
    });

  it('strips the test RUN step when hasTests=true but user did not ask for tests', async () => {
    const planner = makeIntegrationPlanner(true);
    const plan = await planner.generatePlan(
      'create a RegisterForm component',
      '/workspace',
      'MyProject',
      { hasTests: true, testFramework: 'vitest' }
    );
    const runSteps = plan.steps.filter(s => s.action === 'run');
    expect(runSteps).toHaveLength(0);
  });

  it('keeps the test RUN step when hasTests=true AND user asked to run tests', async () => {
    const planner = makeIntegrationPlanner(true);
    const plan = await planner.generatePlan(
      'create a RegisterForm component and run vitest',
      '/workspace',
      'MyProject',
      { hasTests: true, testFramework: 'vitest' }
    );
    const runSteps = plan.steps.filter(s => s.action === 'run');
    expect(runSteps).toHaveLength(1);
  });

  it('strips the test RUN step when hasTests=false (original behaviour preserved)', async () => {
    const planner = makeIntegrationPlanner(false);
    const plan = await planner.generatePlan(
      'create a RegisterForm component and run vitest',
      '/workspace',
      'MyProject',
      { hasTests: false }
    );
    const runSteps = plan.steps.filter(s => s.action === 'run');
    expect(runSteps).toHaveLength(0);
  });

  it.each([
    'run tests',
    'run test',
    'run vitest',
    'run jest',
    'check test coverage',
    'verify tests pass',
    'add a spec for the form',
    'update coverage',
    'run pytest',
  ])('treats "%s" as a test request and keeps the RUN step', async (request) => {
    const planner = makeIntegrationPlanner(true);
    const plan = await planner.generatePlan(
      `create a RegisterForm and ${request}`,
      '/workspace',
      'MyProject',
      { hasTests: true, testFramework: 'vitest' }
    );
    const runSteps = plan.steps.filter(s => s.action === 'run');
    expect(runSteps).toHaveLength(1);
  });
});
