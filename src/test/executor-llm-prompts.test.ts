/**
 * executor-llm-prompts.ts — unit tests
 *
 * All LLM calls are covered via the injected llmClient mock (vi.fn()).
 * No live server, no fetch() stubs needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMClient } from '../llmClient';
import {
  generateAcceptanceCriteria,
  llmValidate,
  computeRelativeImportPath,
  buildSurgicalTscPrompt,
  applySurgicalTscPatches,
  buildSurgicalValidatorPrompt,
  applySurgicalValidatorPatches,
} from '../executor-llm-prompts';
import type { PlanStep } from '../planner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    stepId: 1,
    action: 'write',
    path: 'src/components/Button.tsx',
    description: 'Create Button component',
    ...overrides,
  };
}

function makeLLMClient(responseMessage: string | null = '["criterion 1","criterion 2"]'): LLMClient {
  return {
    sendMessage: vi.fn().mockResolvedValue(
      responseMessage !== null
        ? { success: true, message: responseMessage }
        : { success: false, error: 'LLM error' }
    ),
    sendMessageStream: vi.fn(),
    isServerHealthy: vi.fn().mockResolvedValue(true),
    clearHistory: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      endpoint: 'http://localhost:11434',
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 1024,
      contextWindow: 8192,
      timeout: 30000,
    }),
  } as unknown as LLMClient;
}

// ---------------------------------------------------------------------------
// generateAcceptanceCriteria
// ---------------------------------------------------------------------------

describe('generateAcceptanceCriteria', () => {
  it('returns parsed criteria from LLM response', async () => {
    const client = makeLLMClient('["Uses forwardRef","Accepts className prop","Only primary/secondary variants"]');
    const result = await generateAcceptanceCriteria(makeStep(), undefined, client, '');
    expect(result).toEqual(['Uses forwardRef', 'Accepts className prop', 'Only primary/secondary variants']);
    expect((client.sendMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it('strips cn() criteria from LLM response', async () => {
    const client = makeLLMClient('["Uses cn() for classes","Accepts className prop","imports cn from utils"]');
    const result = await generateAcceptanceCriteria(makeStep(), undefined, client, '');
    expect(result).toEqual(['Accepts className prop']);
  });

  it('returns [] when LLM call fails', async () => {
    const client = makeLLMClient(null);
    const result = await generateAcceptanceCriteria(makeStep(), undefined, client, '');
    expect(result).toEqual([]);
    expect((client.sendMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it('returns [] when LLM response is not a JSON array', async () => {
    const client = makeLLMClient('Sorry, I cannot help with that.');
    const result = await generateAcceptanceCriteria(makeStep(), undefined, client, '');
    expect(result).toEqual([]);
  });

  it('short-circuits for Layout component — no LLM call', async () => {
    const client = makeLLMClient();
    const step = makeStep({ path: 'src/components/Layout.tsx', description: 'Create layout' });
    const result = await generateAcceptanceCriteria(step, undefined, client, '');
    expect(result.length).toBeGreaterThan(0);
    expect((client.sendMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('short-circuits for Navigation component — no LLM call', async () => {
    const client = makeLLMClient();
    const step = makeStep({ path: 'src/components/Navigation.tsx', description: 'Create nav' });
    const result = await generateAcceptanceCriteria(step, undefined, client, '');
    expect(result.length).toBeGreaterThan(0);
    expect((client.sendMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('short-circuits for App.tsx — no LLM call', async () => {
    const client = makeLLMClient();
    const step = makeStep({ path: 'src/App.tsx', description: 'Create App root' });
    const result = await generateAcceptanceCriteria(step, undefined, client, '');
    expect(result.length).toBeGreaterThan(0);
    expect((client.sendMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('short-circuits for Routes.ts — no LLM call', async () => {
    const client = makeLLMClient();
    const step = makeStep({ path: 'src/Routes.ts', description: 'Create route config' });
    const result = await generateAcceptanceCriteria(step, undefined, client, '');
    expect(result.length).toBeGreaterThan(0);
    expect((client.sendMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('extracts props from sourceContent for Layout short-circuit', async () => {
    const client = makeLLMClient();
    const step = makeStep({ path: 'src/Layout.tsx', description: 'Create layout' });
    const source = 'interface LayoutProps { isLoggedIn: boolean; onLogout: () => void; }';
    const result = await generateAcceptanceCriteria(step, source, client, '');
    expect(result[0]).toContain('isLoggedIn');
  });
});

// ---------------------------------------------------------------------------
// llmValidate
// ---------------------------------------------------------------------------

describe('llmValidate', () => {
  const step = makeStep();

  it('returns filtered issues from LLM response (with criteria)', async () => {
    const client = makeLLMClient('["❌ Criterion 1: missing forwardRef","⚠️ Criterion 2: minor issue"]');
    const result = await llmValidate('src/Button.tsx', 'const x = 1', step, ['Uses forwardRef'], client, '');
    expect(result).toEqual(['❌ Criterion 1: missing forwardRef', '⚠️ Criterion 2: minor issue']);
  });

  it('returns filtered issues from LLM response (no criteria, open-ended)', async () => {
    const client = makeLLMClient('["❌ Unused variable x"]');
    const result = await llmValidate('src/Button.tsx', 'const x = 1', step, [], client, 'no cn()');
    expect(result).toEqual(['❌ Unused variable x']);
  });

  it('strips items without ❌ or ⚠️', async () => {
    const client = makeLLMClient('["looks good","❌ actual error"]');
    const result = await llmValidate('src/Button.tsx', 'code', step, [], client, '');
    expect(result).toEqual(['❌ actual error']);
  });

  it('returns [] when LLM call fails', async () => {
    const client = makeLLMClient(null);
    const result = await llmValidate('src/Button.tsx', 'code', step, [], client, '');
    expect(result).toEqual([]);
  });

  it('returns [] when response is not a JSON array', async () => {
    const client = makeLLMClient('Looks fine to me.');
    const result = await llmValidate('src/Button.tsx', 'code', step, [], client, '');
    expect(result).toEqual([]);
  });

  it('truncates content over 2000 chars before sending', async () => {
    const client = makeLLMClient('[]');
    const longContent = 'x'.repeat(3000);
    await llmValidate('src/Button.tsx', longContent, step, [], client, '');
    const sentPrompt = (client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sentPrompt).toContain('(truncated)');
  });
});

// ---------------------------------------------------------------------------
// computeRelativeImportPath
// ---------------------------------------------------------------------------

describe('computeRelativeImportPath', () => {
  it('same directory', () => {
    expect(computeRelativeImportPath('src/a/Foo.tsx', 'src/a/Bar.ts', './utils')).toBe('./utils');
  });

  it('child imports from parent directory', () => {
    expect(computeRelativeImportPath('src/components/Button.tsx', 'src/stores/authStore.ts', './authStore')).toBe('../stores/authStore');
  });

  it('deeply nested consumer importing from root', () => {
    const result = computeRelativeImportPath('src/a/b/c/File.tsx', 'src/utils.ts', './helper');
    expect(result).toMatch(/\.\.\//);
  });

  it('bare package specifier passthrough', () => {
    const result = computeRelativeImportPath('src/Foo.tsx', 'src/Bar.ts', 'react');
    expect(result).toBe('react');
  });
});

// ---------------------------------------------------------------------------
// buildSurgicalTscPrompt
// ---------------------------------------------------------------------------

describe('buildSurgicalTscPrompt', () => {
  const content = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');

  it('returns empty string when no errors have line numbers', () => {
    const result = buildSurgicalTscPrompt(content, ['❌ TypeScript: some generic error'], 'src/Foo.ts');
    expect(result).toBe('');
  });

  it('builds prompt when errors include line numbers', () => {
    const errors = ['❌ TypeScript(TS2304): Cannot find name \'x\' (line 5)'];
    const result = buildSurgicalTscPrompt(content, errors, 'src/Foo.ts');
    expect(result).toContain('src/Foo.ts');
    expect(result).toContain('Line 5');
    expect(result).toContain('JSON array');
  });

  it('merges adjacent error windows', () => {
    const errors = [
      '❌ TypeScript(TS2304): error A (line 3)',
      '❌ TypeScript(TS2304): error B (line 4)',
    ];
    const result = buildSurgicalTscPrompt(content, errors, 'src/Foo.ts');
    expect(result).toContain('Line 3');
    expect(result).toContain('Line 4');
  });
});

// ---------------------------------------------------------------------------
// applySurgicalTscPatches
// ---------------------------------------------------------------------------

describe('applySurgicalTscPatches', () => {
  const content = 'line1\nline2\nline3\n';

  it('applies a replacement patch', () => {
    const patch = JSON.stringify([{ line: 2, content: 'fixed' }]);
    expect(applySurgicalTscPatches(content, patch)).toBe('line1\nfixed\nline3\n');
  });

  it('applies a deletion patch', () => {
    const patch = JSON.stringify([{ line: 2, content: '' }]);
    expect(applySurgicalTscPatches(content, patch)).toBe('line1\nline3\n');
  });

  it('applies an insertBefore patch', () => {
    const patch = JSON.stringify([{ line: 2, insertBefore: 'inserted' }]);
    const result = applySurgicalTscPatches(content, patch);
    expect(result).toContain('inserted\nline2');
  });

  it('returns null on invalid JSON', () => {
    expect(applySurgicalTscPatches(content, 'not json')).toBeNull();
  });

  it('strips markdown fences before parsing', () => {
    const patch = '```json\n[{"line":1,"content":"patched"}]\n```';
    expect(applySurgicalTscPatches(content, patch)).toBe('patched\nline2\nline3\n');
  });
});

// ---------------------------------------------------------------------------
// buildSurgicalValidatorPrompt
// ---------------------------------------------------------------------------

describe('buildSurgicalValidatorPrompt', () => {
  it('uses import-section-only context for import-only errors', () => {
    const errors = ['❌ Cross-file Contract: wrong import'];
    const result = buildSurgicalValidatorPrompt('const x = 1\n'.repeat(30), errors, 'src/Foo.ts');
    expect(result).toContain('IMPORT SECTION');
    expect(result).not.toContain('FULL FILE');
  });

  it('uses full file context for non-import errors', () => {
    const errors = ['❌ Zustand Anti-Pattern: getState() usage'];
    const result = buildSurgicalValidatorPrompt('const x = 1', errors, 'src/Foo.ts');
    expect(result).toContain('FULL FILE');
  });

  it('includes all errors in the prompt', () => {
    const errors = ['❌ Error A', '❌ Error B'];
    const result = buildSurgicalValidatorPrompt('code', errors, 'src/Foo.ts');
    expect(result).toContain('Error A');
    expect(result).toContain('Error B');
  });
});

// ---------------------------------------------------------------------------
// applySurgicalValidatorPatches
// ---------------------------------------------------------------------------

describe('applySurgicalValidatorPatches', () => {
  it('applies a valid SEARCH/REPLACE block', () => {
    const content = 'import React from "react";\nconst x = 1;';
    const patch = '<<<SEARCH\nimport React from "react";\n=====\nimport React, { useState } from "react";\n>>>REPLACE';
    const result = applySurgicalValidatorPatches(content, patch);
    expect(result).toContain('useState');
  });

  it('returns null when search string not found', () => {
    const content = 'const x = 1;';
    const patch = '<<<SEARCH\nconst y = 2;\n=====\nconst y = 3;\n>>>REPLACE';
    expect(applySurgicalValidatorPatches(content, patch)).toBeNull();
  });

  it('applies multiple SEARCH/REPLACE blocks', () => {
    const content = 'aaa\nbbb\nccc';
    const patch =
      '<<<SEARCH\naaa\n=====\nAAA\n>>>REPLACE\n' +
      '<<<SEARCH\nbbb\n=====\nBBB\n>>>REPLACE';
    const result = applySurgicalValidatorPatches(content, patch);
    expect(result).toContain('AAA');
    expect(result).toContain('BBB');
  });

  it('returns null when patch has no valid blocks', () => {
    expect(applySurgicalValidatorPatches('content', 'no blocks here')).toBeNull();
  });
});
