/**
 * coverage-utilities.test.ts
 * 
 * Target utility function coverage gaps:
 * - src/types/validation.ts (15.4%) - createValidationReport, formatValidationReportForLLM
 * - src/test/factories/mockFactory.ts (20%)
 * - src/test/factories/plannerFactory.ts (22.7%)
 */

import { describe, it, expect } from 'vitest';
import {
  ViolationCodes,
  createValidationReport,
  formatValidationReportForLLM,
  type ValidationReport,
} from '../types/validation';
import {
  createLLMConfig,
  createMockResponse,
  createMockFS,
  createMockGitClient,
} from './factories/mockFactory';
import {
  createPlannerConfig,
  createPlanResponse,
  createStep,
  createMockLLMCall,
  createPlanWithDependencies,
  createLinearChainPlan,
  createParallelPlan,
  createDiamondPlan,
} from './factories/plannerFactory';

describe('Utility Function Coverage', () => {
  describe('types/validation.ts', () => {
    describe('createValidationReport', () => {
      it('should create successful validation report without violations', () => {
        const report = createValidationReport(true, 'All checks passed');
        
        expect(report).toBeDefined();
        expect(report.success).toBe(true);
        expect(report.summary).toBe('All checks passed');
        expect(report.violations).toEqual([]);
        expect(report.validationId).toBeTruthy();
        expect(report.timestamp).toBeInstanceOf(Date);
      });

      it('should create failed validation report with violations', () => {
        const violations = [ViolationCodes.PATH_INVALID];
        const report = createValidationReport(
          false,
          'Path validation failed',
          violations
        );
        
        expect(report.success).toBe(false);
        expect(report.violations).toHaveLength(1);
        expect(report.violations[0].code).toBe('PATH_INVALID');
        expect(report.instruction).toBe(ViolationCodes.PATH_INVALID.instruction);
      });

      it('should create report with context information', () => {
        const context = {
          step: 1,
          action: 'write' as const,
          targetFile: 'src/test.ts',
          errorDetails: 'Invalid import',
        };
        const report = createValidationReport(
          false,
          'Failed',
          [],
          context
        );
        
        expect(report.context).toEqual(context);
        expect(report.context?.step).toBe(1);
        expect(report.context?.targetFile).toBe('src/test.ts');
      });

      it('should handle multiple violation codes', () => {
        const violations = [
          ViolationCodes.PATH_INVALID,
          ViolationCodes.EXPORT_MISSING,
          ViolationCodes.TYPE_ANY,
        ];
        const report = createValidationReport(
          false,
          'Multiple violations',
          violations
        );
        
        expect(report.violations).toHaveLength(3);
        expect(report.violations.map(v => v.code)).toEqual([
          'PATH_INVALID',
          'EXPORT_MISSING',
          'TYPE_ANY',
        ]);
      });
    });

    describe('formatValidationReportForLLM', () => {
      it('should format successful report', () => {
        const report = createValidationReport(true, 'All passed');
        const formatted = formatValidationReportForLLM(report);
        
        expect(formatted).toContain('✅ Validation successful');
        expect(formatted).toContain('All passed');
      });

      it('should format failed report with single violation', () => {
        const report = createValidationReport(
          false,
          'Path is invalid',
          [ViolationCodes.PATH_INVALID]
        );
        const formatted = formatValidationReportForLLM(report);
        
        expect(formatted).toContain('❌ VALIDATION FAILED');
        expect(formatted).toContain('PATH_INVALID');
        expect(formatted).toContain(ViolationCodes.PATH_INVALID.description);
        expect(formatted).toContain(ViolationCodes.PATH_INVALID.instruction);
      });

      it('should format failed report with multiple violations', () => {
        const report = createValidationReport(
          false,
          'Multiple issues',
          [
            ViolationCodes.PATH_MULTIPLE,
            ViolationCodes.EXPORT_MISSING,
          ]
        );
        const formatted = formatValidationReportForLLM(report);
        
        expect(formatted).toContain('PATH_MULTIPLE');
        expect(formatted).toContain('EXPORT_MISSING');
        const violations = formatted.match(/⚠️/g);
        expect(violations).toHaveLength(2);
      });

      it('should include example when provided', () => {
        const report = createValidationReport(
          false,
          'Issue',
          [ViolationCodes.PATH_DESCRIPTION]
        );
        const formatted = formatValidationReportForLLM(report);
        
        expect(formatted).toContain('Example:');
        expect(formatted).toContain(ViolationCodes.PATH_DESCRIPTION.example);
      });
    });

    describe('ViolationCodes registry', () => {
      it('should have all expected violation codes', () => {
        expect(ViolationCodes.PATH_INVALID).toBeDefined();
        expect(ViolationCodes.PATH_DESCRIPTION).toBeDefined();
        expect(ViolationCodes.PATH_MULTIPLE).toBeDefined();
        expect(ViolationCodes.EXPORT_MISSING).toBeDefined();
        expect(ViolationCodes.IMPORT_UNUSED).toBeDefined();
        expect(ViolationCodes.TYPE_ANY).toBeDefined();
        expect(ViolationCodes.STRUCTURE_INCOMPLETE).toBeDefined();
      });

      it('each violation code should have required properties', () => {
        Object.values(ViolationCodes).forEach(violation => {
          expect(violation.code).toBeTruthy();
          expect(violation.severity).toBeTruthy();
          expect(['critical', 'error', 'warning']).toContain(violation.severity);
          expect(violation.description).toBeTruthy();
          expect(violation.instruction).toBeTruthy();
        });
      });
    });
  });

  describe('factories/mockFactory.ts', () => {
    describe('createLLMConfig', () => {
      it('should create default LLM config', () => {
        const config = createLLMConfig();
        
        expect(config.endpoint).toBe('http://localhost:11434');
        expect(config.model).toBe('mistral');
        expect(config.temperature).toBe(0.7);
        expect(config.maxTokens).toBe(2048);
        expect(config.timeout).toBe(30000);
      });

      it('should override default values', () => {
        const config = createLLMConfig({
          model: 'llama2',
          temperature: 0.9,
          endpoint: 'http://custom:9000',
        });
        
        expect(config.model).toBe('llama2');
        expect(config.temperature).toBe(0.9);
        expect(config.endpoint).toBe('http://custom:9000');
        expect(config.maxTokens).toBe(2048); // unchanged
      });

      it('should support partial overrides', () => {
        const config = createLLMConfig({ maxTokens: 4096 });
        
        expect(config.maxTokens).toBe(4096);
        expect(config.model).toBe('mistral');
        expect(config.endpoint).toBe('http://localhost:11434');
      });
    });

    describe('createMockResponse', () => {
      it('should create successful response', () => {
        const response = createMockResponse(200, { success: true });
        
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.statusText).toBe('OK');
        expect(response.json).toBeDefined();
      });

      it('should create error response', () => {
        const response = createMockResponse(404, { error: 'Not found' });
        
        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });

      it('should support custom status codes', () => {
        const response = createMockResponse(500);
        
        expect(response.ok).toBe(false);
        expect(response.status).toBe(500);
      });
    });

    describe('createMockFS', () => {
      it('should create mock file system', () => {
        const fs = createMockFS();
        
        expect(fs.readFileSync).toBeDefined();
        expect(fs.writeFileSync).toBeDefined();
        expect(fs.existsSync).toBeDefined();
        expect(fs.promises).toBeDefined();
      });

      it('should support synchronous operations', () => {
        const fs = createMockFS();
        
        const content = fs.readFileSync('test.ts');
        expect(content).toBeDefined();
        
        fs.writeFileSync('test.ts', 'content');
        expect(fs.writeFileSync).toHaveBeenCalled();
        
        expect(fs.existsSync('test.ts')).toBe(true);
      });

      it('should support async promises API', () => {
        const fs = createMockFS();
        
        expect(fs.promises.readFile).toBeDefined();
        expect(fs.promises.writeFile).toBeDefined();
        expect(fs.promises.mkdir).toBeDefined();
        expect(fs.promises.readdir).toBeDefined();
      });
    });

    describe('createMockGitClient', () => {
      it('should create mock git client', () => {
        const git = createMockGitClient();
        
        expect(git.getStatus).toBeDefined();
      });
    });
  });

  describe('factories/plannerFactory.ts', () => {
    describe('createPlannerConfig', () => {
      it('should create default planner config', () => {
        const config = createPlannerConfig();
        
        expect(config.llmCall).toBeDefined();
        expect(config.onProgress).toBeDefined();
        expect(config.projectContext).toBeDefined();
        expect(config.projectContext.language).toBe('TypeScript');
      });

      it('should support overrides', () => {
        const config = createPlannerConfig({
          projectContext: {
            language: 'Python',
            strategy: 'EDIT_MODE',
            extension: '.py',
            root: 'src',
            isMinimalProject: true,
          },
        });
        
        expect(config.projectContext.language).toBe('Python');
        expect(config.projectContext.extension).toBe('.py');
      });
    });

    describe('createPlanResponse', () => {
      it('should create plan response JSON', () => {
        const steps = [
          {
            step: 1,
            action: 'write' as const,
            description: 'Create component',
            path: 'src/Component.tsx',
          },
        ];
        const response = createPlanResponse(steps);
        
        expect(response).toBeTruthy();
        expect(typeof response).toBe('string');
        const parsed = JSON.parse(response);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].step).toBe(1);
      });

      it('should handle multiple steps', () => {
        const steps = [
          {
            step: 1,
            action: 'write' as const,
            description: 'Create util',
            path: 'src/utils.ts',
            notes: 'Helper functions',
          },
          {
            step: 2,
            action: 'write' as const,
            description: 'Create component',
            path: 'src/Component.tsx',
          },
        ];
        const response = createPlanResponse(steps);
        const parsed = JSON.parse(response);
        
        expect(parsed).toHaveLength(2);
        expect(parsed[1].notes).toBeUndefined(); // Step 2 has no notes
      });
    });

    describe('createStep', () => {
      it('should create basic step', () => {
        const step = createStep(1, 'write', 'Create file', 'src/test.ts');
        
        expect(step.step).toBe(1);
        expect(step.action).toBe('write');
        expect(step.description).toBe('Create file');
        expect(step.path).toBe('src/test.ts');
      });

      it('should include optional notes', () => {
        const step = createStep(1, 'write', 'Create file', 'src/test.ts', 'Important note');
        
        expect(step.notes).toBe('Important note');
      });
    });

    describe('createMockLLMCall', () => {
      it('should create successful LLM call', async () => {
        const call = createMockLLMCall('success');
        const response = await call();
        
        expect(typeof response).toBe('string');
      });

      it('should create error LLM call', async () => {
        const call = createMockLLMCall('error');
        
        await expect(call()).rejects.toThrow();
      });

      it('should create malformed LLM call', async () => {
        const call = createMockLLMCall('malformed');
        const response = await call();
        
        expect(response).toBeDefined();
      });
    });

    describe('createPlanWithDependencies', () => {
      it('should create plan with inter-step dependencies', () => {
        const steps = [
          {
            step: 1,
            action: 'write',
            description: 'Create base file',
            path: 'src/base.ts',
          },
          {
            step: 2,
            action: 'write',
            description: 'Use base file',
            path: 'src/derived.ts',
            dependsOn: [1],
          },
        ];
        const response = createPlanWithDependencies(steps);
        
        expect(response).toBeTruthy();
        expect(typeof response).toBe('string');
        const parsed = JSON.parse(response);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].step).toBe(1);
        expect(parsed[1].notes).toContain('step_1');
      });

      it('should handle multiple dependencies', () => {
        const steps = [
          {
            step: 1,
            action: 'write',
            description: 'File A',
            path: 'src/a.ts',
          },
          {
            step: 2,
            action: 'write',
            description: 'File B',
            path: 'src/b.ts',
          },
          {
            step: 3,
            action: 'write',
            description: 'File C depends on A and B',
            path: 'src/c.ts',
            dependsOn: [1, 2],
          },
        ];
        const response = createPlanWithDependencies(steps);
        const parsed = JSON.parse(response);
        
        expect(parsed[2].notes).toContain('step_1');
        expect(parsed[2].notes).toContain('step_2');
      });
    });

    describe('Dependency-based plans', () => {
      it('should create linear chain plan', () => {
        const response = createLinearChainPlan(5);
        const parsed = JSON.parse(response);
        
        expect(parsed.length).toBe(5);
        // Each step should depend on previous
        for (let i = 1; i < parsed.length; i++) {
          expect(parsed[i].notes).toContain(`Depends on: step_${i}`);
        }
      });

      it('should create parallel plan', () => {
        const response = createParallelPlan();
        const parsed = JSON.parse(response);
        
        expect(parsed.length).toBeGreaterThan(0);
        // Parallel steps shouldn't have dependencies
        const firstSteps = parsed.filter((s: any) => s.step <= 3);
        expect(firstSteps.some((s: any) => !s.notes || !s.notes.includes('Depends'))).toBe(true);
      });

      it('should create diamond dependency plan', () => {
        const response = createDiamondPlan();
        const parsed = JSON.parse(response);
        
        expect(parsed.length).toBeGreaterThan(0);
        // Diamond: A → B, C → D (B,C depend on A, D depends on B,C)
      });
    });
  });
});
