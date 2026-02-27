import { describe, it, expect } from 'vitest';
import {
  classifyLayerPure,
  extractImportsPure,
  isImportAllowedPure,
  validateLayerImportsPure,
  detectForbiddenImportsPure,
  validateLayerPatternsPure,
  buildViolationDetailsPure,
  LAYER_RULES,
} from './layerValidator';

describe('layerValidator - Pure Layer Validation', () => {
  describe('Layer Classification', () => {
    const testCases = [
      {
        filePath: 'src/services/userService.ts',
        expected: 'services/',
        description: 'services folder classified as services',
      },
      {
        filePath: 'src/hooks/useUser.ts',
        expected: 'hooks/',
        description: 'hooks folder classified as hooks',
      },
      {
        filePath: 'src/components/UserCard.tsx',
        expected: 'components/',
        description: 'components folder classified as components',
      },
      {
        filePath: 'src/types/user.ts',
        expected: 'types/',
        description: 'types folder classified as types',
      },
      {
        filePath: 'src/utils/helpers.ts',
        expected: 'utils/',
        description: 'utils folder classified as utils',
      },
      {
        filePath: 'src/other/random.ts',
        expected: 'unknown/',
        description: 'unknown layer returns unknown',
      },
    ];

    it.each(testCases)(
      'layer classification: $description',
      ({ filePath, expected }) => {
        const result = classifyLayerPure(filePath);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Import Extraction', () => {
    const testCases = [
      {
        code: 'import { useState } from "react";',
        expectedImports: ['react'],
        description: 'extracts named imports',
      },
      {
        code: 'import React from "react";',
        expectedImports: ['react'],
        description: 'extracts default imports',
      },
      {
        code: 'import "styles.css";',
        expectedImports: ['styles.css'],
        description: 'extracts side effect imports',
      },
      {
        code: `
          import { x } from "module-a";
          import y from "module-b";
          import "side-effect";
        `,
        expectedCount: 3,
        description: 'extracts multiple imports',
      },
      {
        code: 'const x = 5;',
        expectedCount: 0,
        description: 'no imports returns empty',
      },
    ];

    it.each(testCases)(
      'import extraction: $description',
      ({ code, expectedImports, expectedCount }) => {
        const result = extractImportsPure(code);
        if (expectedImports) {
          expect(result).toEqual(expectedImports);
        } else {
          expect(result.length).toBe(expectedCount);
        }
      }
    );
  });

  describe('Import Validation', () => {
    const testCases = [
      {
        importModule: 'react',
        forbidden: ['react'],
        allowed: [],
        expected: false,
        description: 'rejects forbidden imports',
      },
      {
        importModule: 'lodash',
        forbidden: [],
        allowed: ['lodash'],
        expected: true,
        description: 'allows whitelisted imports',
      },
      {
        importModule: 'date-fns',
        forbidden: [],
        allowed: [],
        expected: true,
        description: 'allows common libraries',
      },
      {
        importModule: 'my-custom-lib',
        forbidden: [],
        allowed: [],
        expected: false,
        description: 'rejects unknown imports',
      },
      {
        importModule: 'services/userService',
        forbidden: [],
        allowed: ['services/'],
        expected: true,
        description: 'allows pattern-based imports',
      },
    ];

    it.each(testCases)(
      'import validation: $description',
      ({ importModule, forbidden, allowed, expected }) => {
        const result = isImportAllowedPure(importModule, forbidden, allowed);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Layer Import Validation', () => {
    const testCases = [
      {
        imports: ['react', 'lodash'],
        layer: 'services/',
        expectsForbidden: ['react'],
        expectedAllowed: ['lodash'],
        description: 'services layer rejects React',
      },
      {
        imports: ['@tanstack/react-query', 'services/userService'],
        layer: 'hooks/',
        expectsForbidden: [],
        expectedAllowed: 2,
        description: 'hooks layer allows React Query and services',
      },
      {
        imports: ['react', 'hooks/useUser', 'services/api'],
        layer: 'components/',
        expectsForbidden: [],
        expectedAllowed: 3,
        description: 'components layer allows all standard imports',
      },
      {
        imports: ['react', 'services/userService'],
        layer: 'types/',
        expectsForbidden: 2,
        expectedAllowed: [],
        description: 'types layer forbids React and services',
      },
    ];

    it.each(testCases)(
      'layer import validation: $description',
      ({ imports, layer, expectsForbidden, expectedAllowed }) => {
        const result = validateLayerImportsPure(imports, layer);
        if (Array.isArray(expectsForbidden)) {
          expect(result.forbidden.length).toBe(expectsForbidden.length);
        } else {
          expect(result.forbidden.length).toBe(expectsForbidden);
        }
        if (typeof expectedAllowed === 'number') {
          expect(result.allowed.length).toBe(expectedAllowed);
        }
      }
    );
  });

  describe('Forbidden Import Detection', () => {
    const testCases = [
      {
        content: 'import React from "react";',
        forbiddenList: ['react'],
        expectedCount: 1,
        description: 'detects single forbidden import',
      },
      {
        content: `
          import { useState } from "react";
          import { useSelector } from "redux";
        `,
        forbiddenList: ['react', 'redux'],
        expectedCount: 2,
        description: 'detects multiple forbidden imports',
      },
      {
        content: 'import { helper } from "lodash";',
        forbiddenList: ['react'],
        expectedCount: 0,
        description: 'no violations for allowed imports',
      },
    ];

    it.each(testCases)(
      'forbidden detection: $description',
      ({ content, forbiddenList, expectedCount }) => {
        const result = detectForbiddenImportsPure(content, forbiddenList);
        expect(result.length).toBe(expectedCount);
      }
    );
  });

  describe('Export Pattern Validation', () => {
    const testCases = [
      {
        content: 'export const getUserById = (id: string) => {};',
        layer: 'services/',
        expectValid: true,
        description: 'services allows export const',
      },
      {
        content: 'export function getUser() {}',
        layer: 'services/',
        expectValid: true,
        description: 'services allows export function',
      },
      {
        content: 'export const useUser = () => {};',
        layer: 'hooks/',
        expectValid: true,
        description: 'hooks allows export const use*',
      },
      {
        content: 'export type User = { id: string; };',
        layer: 'types/',
        expectValid: true,
        description: 'types allows export type',
      },
    ];

    it.each(testCases)(
      'export validation: $description',
      ({ content, layer, expectValid }) => {
        const result = validateLayerPatternsPure(content, layer);
        const exportPattern = result.find(r => r.type === 'exportPattern');
        if (expectValid) {
          expect(exportPattern?.found).toBe(true);
        } else {
          expect(exportPattern?.found).toBe(false);
        }
      }
    );
  });

  describe('Violation Details Builder', () => {
    it('should format violations correctly', () => {
      const violations = [
        { type: 'import', message: 'React imported in service' },
        { type: 'export', message: 'Invalid export pattern' },
      ];
      const result = buildViolationDetailsPure(violations);
      expect(result).toContain('import: React imported in service');
      expect(result).toContain('export: Invalid export pattern');
    });
  });

  describe('Layer-Specific Rules Integration', () => {
    it('should have services layer rules', () => {
      expect(LAYER_RULES['services/']).toBeDefined();
      expect(LAYER_RULES['services/'].forbiddenImports).toContain('react');
    });

    it('should have hooks layer rules', () => {
      expect(LAYER_RULES['hooks/']).toBeDefined();
      expect(LAYER_RULES['hooks/'].allowedImportPatterns).toContain('react');
    });

    it('should have components layer rules', () => {
      expect(LAYER_RULES['components/']).toBeDefined();
      expect(LAYER_RULES['components/'].forbiddenImports.length).toBe(0);
    });

    it('should have types layer rules', () => {
      expect(LAYER_RULES['types/']).toBeDefined();
      expect(LAYER_RULES['types/'].forbiddenImports).toContain('react');
    });

    it('should have utils layer rules', () => {
      expect(LAYER_RULES['utils/']).toBeDefined();
      expect(LAYER_RULES['utils/'].forbiddenImports).toContain('react');
    });
  });

  describe('Performance Regression Suite', () => {
    it('should validate large code files in <50ms', () => {
      // Create a large code file with many imports
      const largeCode = Array(500)
        .fill(
          `
        import { useState } from "react";
        import { helper } from "lodash";
        import { getUser } from "../services/user";
        export const MyComponent = () => {};
      `
        )
        .join('\n');

      const start = performance.now();
      const imports = extractImportsPure(largeCode);
      validateLayerImportsPure(imports, 'components/');
      validateLayerPatternsPure(largeCode, 'components/');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      expect(imports.length).toBeGreaterThan(0);
    });

    it('should handle complex multi-layer scenarios in <50ms', () => {
      const complexCode = `
        ${Array(100).fill('import { x } from "module";').join('\n')}
        export const a = 1;
        export function b() {}
        export type C = string;
        export interface D {}
      `;

      const start = performance.now();
      classifyLayerPure('src/services/complex.ts');
      detectForbiddenImportsPure(complexCode, ['react', 'redux']);
      validateLayerPatternsPure(complexCode, 'services/');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
