import { describe, it, expect } from 'vitest';
import {
  ArchitectureViolation,
  ViolationCode,
  ValidationReport,
  ViolationCodes,
  createValidationReport,
  formatValidationReportForLLM,
} from '../types/validation';

/**
 * Phase 10A: Validation Module Comprehensive Testing
 *
 * Strategy: Test validation helpers and report generation
 * Target: Increase coverage from 15.38% to 50%+
 * Focus: Report creation, formatting, violation codes
 */

describe('Phase 10A: Validation Module Comprehensive Testing', () => {
  describe('ViolationCodes Registry', () => {
    it('should define PATH_INVALID violation code', () => {
      expect(ViolationCodes.PATH_INVALID).toBeDefined();
      expect(ViolationCodes.PATH_INVALID.code).toBe('PATH_INVALID');
      expect(ViolationCodes.PATH_INVALID.severity).toBe('critical');
    });

    it('should define PATH_DESCRIPTION violation code', () => {
      expect(ViolationCodes.PATH_DESCRIPTION).toBeDefined();
      expect(ViolationCodes.PATH_DESCRIPTION.code).toBe('PATH_DESCRIPTION');
      expect(ViolationCodes.PATH_DESCRIPTION.severity).toBe('critical');
    });

    it('should define PATH_MULTIPLE violation code', () => {
      expect(ViolationCodes.PATH_MULTIPLE).toBeDefined();
      expect(ViolationCodes.PATH_MULTIPLE.code).toBe('PATH_MULTIPLE');
      expect(ViolationCodes.PATH_MULTIPLE.severity).toBe('critical');
    });

    it('should define EXPORT_MISSING violation code', () => {
      expect(ViolationCodes.EXPORT_MISSING).toBeDefined();
      expect(ViolationCodes.EXPORT_MISSING.code).toBe('EXPORT_MISSING');
      expect(ViolationCodes.EXPORT_MISSING.severity).toBe('error');
    });

    it('should define IMPORT_UNUSED violation code', () => {
      expect(ViolationCodes.IMPORT_UNUSED).toBeDefined();
      expect(ViolationCodes.IMPORT_UNUSED.code).toBe('IMPORT_UNUSED');
      expect(ViolationCodes.IMPORT_UNUSED.severity).toBe('warning');
    });

    it('should define TYPE_ANY violation code', () => {
      expect(ViolationCodes.TYPE_ANY).toBeDefined();
      expect(ViolationCodes.TYPE_ANY.code).toBe('TYPE_ANY');
      expect(ViolationCodes.TYPE_ANY.severity).toBe('error');
    });

    it('should define STRUCTURE_INCOMPLETE violation code', () => {
      expect(ViolationCodes.STRUCTURE_INCOMPLETE).toBeDefined();
      expect(ViolationCodes.STRUCTURE_INCOMPLETE.code).toBe('STRUCTURE_INCOMPLETE');
      expect(ViolationCodes.STRUCTURE_INCOMPLETE.severity).toBe('error');
    });

    it('should have description in all codes', () => {
      Object.values(ViolationCodes).forEach(code => {
        expect(code.description).toBeDefined();
        expect(typeof code.description).toBe('string');
        expect(code.description.length).toBeGreaterThan(0);
      });
    });

    it('should have instruction in all codes', () => {
      Object.values(ViolationCodes).forEach(code => {
        expect(code.instruction).toBeDefined();
        expect(typeof code.instruction).toBe('string');
        expect(code.instruction.length).toBeGreaterThan(0);
      });
    });

    it('should have valid severity levels', () => {
      const validSeverities = ['critical', 'error', 'warning'];
      Object.values(ViolationCodes).forEach(code => {
        expect(validSeverities).toContain(code.severity);
      });
    });
  });

  describe('createValidationReport', () => {
    it('should create a successful validation report', () => {
      const report = createValidationReport(true, 'All checks passed');

      expect(report).toBeDefined();
      expect(report.success).toBe(true);
      expect(report.summary).toBe('All checks passed');
      expect(report.violations).toEqual([]);
    });

    it('should create a failed validation report', () => {
      const report = createValidationReport(false, 'Validation failed');

      expect(report.success).toBe(false);
      expect(report.summary).toBe('Validation failed');
    });

    it('should generate validation ID', () => {
      const report = createValidationReport(true, 'summary');
      expect(report.validationId).toBeDefined();
      expect(report.validationId).toMatch(/^val-\d+$/);
    });

    it('should set timestamp', () => {
      const beforeTime = new Date();
      const report = createValidationReport(true, 'summary');
      const afterTime = new Date();

      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      );
      expect(report.timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime() + 100 // 100ms buffer
      );
    });

    it('should include violations', () => {
      const violations: ViolationCode[] = [
        ViolationCodes.PATH_INVALID,
        ViolationCodes.EXPORT_MISSING,
      ];
      const report = createValidationReport(false, 'summary', violations);

      expect(report.violations).toEqual(violations);
      expect(report.violations).toHaveLength(2);
    });

    it('should set instruction from first violation', () => {
      const violations: ViolationCode[] = [
        ViolationCodes.PATH_INVALID,
        ViolationCodes.EXPORT_MISSING,
      ];
      const report = createValidationReport(false, 'summary', violations);

      expect(report.instruction).toBe(ViolationCodes.PATH_INVALID.instruction);
    });

    it('should not set instruction when no violations', () => {
      const report = createValidationReport(true, 'summary', []);
      expect(report.instruction).toBeUndefined();
    });

    it('should include context when provided', () => {
      const context = {
        step: 1,
        action: 'create file',
        targetFile: 'src/App.tsx',
        errorDetails: 'file already exists',
      };
      const report = createValidationReport(true, 'summary', [], context);

      expect(report.context).toEqual(context);
      expect(report.context!.step).toBe(1);
      expect(report.context!.action).toBe('create file');
    });

    it('should handle undefined context', () => {
      const report = createValidationReport(true, 'summary');
      expect(report.context).toBeUndefined();
    });

    it('should generate validation IDs with correct format', () => {
      const report1 = createValidationReport(true, 'summary');
      const report2 = createValidationReport(true, 'summary');

      // IDs should follow the val-<timestamp> format
      expect(report1.validationId).toMatch(/^val-\d+$/);
      expect(report2.validationId).toMatch(/^val-\d+$/);
      expect(report1.validationId).toBeDefined();
      expect(report2.validationId).toBeDefined();
    });
  });

  describe('formatValidationReportForLLM', () => {
    it('should format successful report', () => {
      const report = createValidationReport(true, 'All checks passed');
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('✅');
      expect(formatted).toContain('Validation successful');
      expect(formatted).toContain('All checks passed');
    });

    it('should format failed report with violations', () => {
      const violations: ViolationCode[] = [ViolationCodes.PATH_INVALID];
      const report = createValidationReport(false, 'Validation failed', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('❌');
      expect(formatted).toContain('VALIDATION FAILED');
      expect(formatted).toContain('Validation failed');
    });

    it('should include violation details in output', () => {
      const violations: ViolationCode[] = [ViolationCodes.PATH_INVALID];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('PATH_INVALID');
      expect(formatted).toContain(ViolationCodes.PATH_INVALID.description);
      expect(formatted).toContain('Example:');
      expect(formatted).toContain('Action:');
    });

    it('should include violation severity', () => {
      const violations: ViolationCode[] = [ViolationCodes.PATH_INVALID];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('critical');
    });

    it('should include violation instruction', () => {
      const violations: ViolationCode[] = [ViolationCodes.EXPORT_MISSING];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('export default');
    });

    it('should handle multiple violations', () => {
      const violations: ViolationCode[] = [
        ViolationCodes.PATH_INVALID,
        ViolationCodes.EXPORT_MISSING,
        ViolationCodes.TYPE_ANY,
      ];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('PATH_INVALID');
      expect(formatted).toContain('EXPORT_MISSING');
      expect(formatted).toContain('TYPE_ANY');
    });

    it('should not include example when not provided', () => {
      const violations: ViolationCode[] = [
        {
          code: 'CUSTOM_CODE',
          severity: 'error' as const,
          description: 'Custom violation',
          instruction: 'Do something',
          // No example
        },
      ];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      // Should not have "Example:" line for this violation
      const lines = formatted.split('\n');
      const customCodeIndex = lines.findIndex(l => l.includes('CUSTOM_CODE'));
      const nextLines = lines.slice(customCodeIndex, customCodeIndex + 4);
      expect(nextLines.some(l => l.includes('Example:'))).toBe(false);
    });

    it('should format correctly with only description (no example)', () => {
      const violations: ViolationCode[] = [
        {
          code: 'TEST_CODE',
          severity: 'warning' as const,
          description: 'Test description',
          instruction: 'Test instruction',
        },
      ];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('TEST_CODE');
      expect(formatted).toContain('warning');
      expect(formatted).toContain('Test description');
      expect(formatted).toContain('Test instruction');
    });

    it('should use warning emoji for different severities', () => {
      const violations: ViolationCode[] = [ViolationCodes.IMPORT_UNUSED];
      const report = createValidationReport(false, 'summary', violations);
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('⚠️');
    });

    it('should include summary in output', () => {
      const report = createValidationReport(false, 'Custom summary text');
      const formatted = formatValidationReportForLLM(report);

      expect(formatted).toContain('Custom summary text');
    });
  });

  describe('Integration: Complete Validation Workflow', () => {
    it('should handle complete successful validation', () => {
      const report = createValidationReport(true, 'File created successfully', []);
      const formatted = formatValidationReportForLLM(report);

      expect(report.success).toBe(true);
      expect(formatted).toContain('✅');
      expect(formatted).not.toContain('❌');
    });

    it('should handle complete failed validation with context', () => {
      const context = {
        step: 2,
        action: 'create file',
        targetFile: 'src/components/Button.tsx',
      };
      const violations: ViolationCode[] = [
        ViolationCodes.PATH_INVALID,
        ViolationCodes.STRUCTURE_INCOMPLETE,
      ];

      const report = createValidationReport(
        false,
        'File creation failed due to invalid path and incomplete structure',
        violations,
        context
      );

      expect(report.success).toBe(false);
      expect(report.context!.targetFile).toBe('src/components/Button.tsx');
      expect(report.violations).toHaveLength(2);

      const formatted = formatValidationReportForLLM(report);
      expect(formatted).toContain('❌');
      expect(formatted).toContain('PATH_INVALID');
      expect(formatted).toContain('STRUCTURE_INCOMPLETE');
    });

    it('should chain validation reports for multi-step workflow', () => {
      const report1 = createValidationReport(true, 'Step 1 passed');
      const report2 = createValidationReport(false, 'Step 2 failed', [
        ViolationCodes.EXPORT_MISSING,
      ]);

      expect(report1.success).toBe(true);
      expect(report2.success).toBe(false);
      expect(report2.instruction).toBe(ViolationCodes.EXPORT_MISSING.instruction);
    });

    it('should format workflow context for LLM', () => {
      const report = createValidationReport(
        false,
        'Import validation failed',
        [ViolationCodes.IMPORT_UNUSED],
        {
          step: 3,
          action: 'validate imports',
          targetFile: 'src/utils/helpers.ts',
          errorDetails: 'useEffect imported but not used',
        }
      );

      const formatted = formatValidationReportForLLM(report);
      expect(formatted).toContain('IMPORT_UNUSED');
      expect(formatted).toContain('unused imports');
    });
  });

  describe('Violation Code Properties', () => {
    it('PATH_INVALID should have appropriate properties', () => {
      const code = ViolationCodes.PATH_INVALID;
      expect(code.code).toBe('PATH_INVALID');
      expect(code.severity).toBe('critical');
      expect(code.description).toContain('invalid');
      expect(code.example).toBeDefined();
      expect(code.instruction).toContain('file path');
    });

    it('EXPORT_MISSING should have export-related instruction', () => {
      const code = ViolationCodes.EXPORT_MISSING;
      expect(code.instruction).toContain('export default');
    });

    it('TYPE_ANY should guide away from any type', () => {
      const code = ViolationCodes.TYPE_ANY;
      expect(code.instruction).toContain('any');
      expect(code.instruction).toContain('specific types');
    });

    it('STRUCTURE_INCOMPLETE should mention compilable code', () => {
      const code = ViolationCodes.STRUCTURE_INCOMPLETE;
      expect(code.instruction).toContain('complete');
      expect(code.instruction).toContain('compilable');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty violations array', () => {
      const report = createValidationReport(false, 'summary', []);
      expect(report.violations).toEqual([]);
      expect(report.instruction).toBeUndefined();
    });

    it('should handle very long summary', () => {
      const longSummary = 'x'.repeat(10000);
      const report = createValidationReport(true, longSummary);
      expect(report.summary).toBe(longSummary);
    });

    it('should handle special characters in summary', () => {
      const summary = 'Error: "foo" is not defined (check <template>)';
      const report = createValidationReport(false, summary);
      const formatted = formatValidationReportForLLM(report);
      expect(formatted).toContain(summary);
    });

    it('should handle context with undefined fields', () => {
      const context = {
        step: 1,
        // action undefined
        targetFile: 'src/test.tsx',
      };
      const report = createValidationReport(true, 'summary', [], context as any);
      expect(report.context).toBeDefined();
    });
  });
});
