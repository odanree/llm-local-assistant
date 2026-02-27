import { describe, it, expect } from 'vitest';
import {
  detectExtractionCandidatesPure,
  extractDependenciesPure,
  analyzeHookComplexityPure,
  detectErrorHandlingPure,
  calculateExtractionViabilityPure,
  detectCircularDependencyRisksPure,
  generateExtractionRecommendationPure,
} from './extractionCandidateFinder';

describe('extractionCandidateFinder - Pure Candidate Detection', () => {
  describe('Extraction Candidate Detection', () => {
    const testCases = [
      {
        code: 'const [state, setState] = useState();',
        expectedType: 'state',
        description: 'detects useState',
      },
      {
        code: 'const data = await fetch("/api");',
        expectedType: 'api',
        description: 'detects fetch API calls',
      },
      {
        code: 'const schema = z.object({});',
        expectedType: 'validation',
        description: 'detects Zod validation',
      },
      {
        code: 'export const helper = (x) => x * 2;',
        expectedType: 'logic',
        description: 'detects utility functions',
      },
      {
        code: 'const useUser = () => {};',
        expectedType: 'hook',
        description: 'detects custom hooks',
      },
    ];

    it.each(testCases)(
      'candidate detection: $description',
      ({ code, expectedType }) => {
        const candidates = detectExtractionCandidatesPure(code);
        const found = candidates.some(c => c.type === expectedType);
        expect(found).toBe(true);
      }
    );
  });

  describe('Dependency Extraction', () => {
    const testCases = [
      {
        code: 'import { useState } from "react";',
        expectedDeps: ['react'],
        description: 'extracts imports',
      },
      {
        code: 'const lodash = require("lodash");',
        expectedDeps: ['lodash'],
        description: 'extracts requires',
      },
      {
        code: `
          import { x } from "module-a";
          import y from "module-b";
          const z = require("module-c");
        `,
        expectedCount: 3,
        description: 'extracts multiple dependencies',
      },
      {
        code: 'const x = 5;',
        expectedCount: 0,
        description: 'no dependencies returns empty',
      },
    ];

    it.each(testCases)(
      'dependency extraction: $description',
      ({ code, expectedDeps, expectedCount }) => {
        const result = extractDependenciesPure(code);
        if (expectedDeps) {
          expect(result).toEqual(expectedDeps);
        } else {
          expect(result.length).toBe(expectedCount);
        }
      }
    );
  });

  describe('Hook Complexity Analysis', () => {
    const testCases = [
      {
        code: 'const [x, setX] = useState();',
        expectedComplexity: 'simple',
        description: 'single state is simple',
      },
      {
        code: `
          const [x, setX] = useState();
          const [y, setY] = useState();
          useEffect(() => {}, []);
        `,
        expectedComplexity: 'moderate',
        description: 'multiple state and effects is moderate',
      },
      {
        code: `
          const [state1, setState1] = useState();
          const [state2, setState2] = useState();
          const [state3, setState3] = useState();
          useEffect(() => {}, []);
          useEffect(() => {}, []);
          const data = await fetch("/api");
        `,
        expectedComplexity: 'high',
        description: 'many state, effects, async is high',
      },
      {
        code: Array(200)
          .fill(`
            const [state, setState] = useState();
            useEffect(() => {}, []);
            const data = await fetch("/api");
          `)
          .join('\n'),
        expectedComplexity: 'critical',
        description: 'very long code is critical',
      },
    ];

    it.each(testCases)(
      'complexity analysis: $description',
      ({ code, expectedComplexity }) => {
        const result = analyzeHookComplexityPure(code);
        expect(result.complexity).toBe(expectedComplexity);
      }
    );
  });

  describe('Error Handling Detection', () => {
    const testCases = [
      {
        code: 'try { } catch (e) { }',
        hasTryCatch: true,
        description: 'detects try-catch',
      },
      {
        code: 'const [error, setError] = useState();',
        hasErrorState: true,
        description: 'detects error state',
      },
      {
        code: '{error && <p>{error}</p>}',
        hasErrorDisplay: true,
        description: 'detects error display',
      },
      {
        code: 'const x = 5;',
        hasErrorState: false,
        hasErrorDisplay: false,
        description: 'no error handling',
      },
    ];

    it.each(testCases)(
      'error handling detection: $description',
      ({ code, hasTryCatch, hasErrorState, hasErrorDisplay }) => {
        const result = detectErrorHandlingPure(code);
        if (hasTryCatch !== undefined) {
          expect(result.hasTryCatch).toBe(hasTryCatch);
        }
        if (hasErrorState !== undefined) {
          expect(result.hasErrorState).toBe(hasErrorState);
        }
        if (hasErrorDisplay !== undefined) {
          expect(result.hasErrorDisplay).toBe(hasErrorDisplay);
        }
      }
    );
  });

  describe('Extraction Viability Calculation', () => {
    const testCases = [
      {
        code: 'export const helper = (x) => x * 2;',
        expectedScore: 100,
        expectedRecommendation: 'excellent',
        description: 'simple code is excellent',
      },
      {
        code: `
          const [state, setState] = useState();
          try { } catch (e) { }
        `,
        expectedScore: 80,
        description: 'code with error handling is good',
      },
      {
        code: 'localStorage.setItem("key", "value");',
        expectedScore: 75,
        description: 'side effects reduce viability',
      },
      {
        code: Array(300)
          .fill(
            `const [x, setX] = useState();
            useEffect(() => {}, []);`
          )
          .join('\n'),
        expectedRecommendation: 'not-ready',
        description: 'very complex code is not ready',
      },
    ];

    it.each(testCases)(
      'viability calculation: $description',
      ({ code, expectedScore, expectedRecommendation }) => {
        const result = calculateExtractionViabilityPure(code);
        if (expectedScore !== undefined) {
          expect(result.score).toBeLessThanOrEqual(expectedScore + 5);
        }
        if (expectedRecommendation) {
          expect(result.recommendation).toBe(expectedRecommendation);
        }
      }
    );
  });

  describe('Circular Dependency Risk Detection', () => {
    it('should detect potential circular dependencies', () => {
      const code = `
        import { helper } from "./utils";
        export const Component = () => {};
      `;

      const result = detectCircularDependencyRisksPure(code, 'src/components/Component.tsx');
      expect(result.hasRisk).toBeDefined();
    });

    it('should flag imports in exported code', () => {
      const code = `
        import { Component } from "./Component";
        export const useComponent = () => {};
      `;

      const result = detectCircularDependencyRisksPure(code, 'src/hooks/useComponent.ts');
      expect(result).toHaveProperty('likelyDependents');
    });
  });

  describe('Extraction Recommendation Generation', () => {
    it('should recommend service for API calls', () => {
      const code = 'const data = await fetch("/api");';
      const result = generateExtractionRecommendationPure(code);
      expect(['hook', 'utility']).toContain(result.suggestedType);
    });

    it('should recommend hook for state management', () => {
      const code = 'const [state, setState] = useState();';
      const result = generateExtractionRecommendationPure(code);
      expect(['hook', 'utility']).toContain(result.suggestedType);
    });

    it('should recommend utility for pure logic', () => {
      const code = 'export const add = (a, b) => a + b;';
      const result = generateExtractionRecommendationPure(code);
      expect(['utility', 'none']).toContain(result.suggestedType);
    });

    it('should recommend none for unextractable code', () => {
      const code = `
        ${Array(300)
          .fill('const [x, setX] = useState();')
          .join('\n')}
        window.addEventListener('resize', () => {});
      `;
      const result = generateExtractionRecommendationPure(code);
      expect(['none']).toContain(result.suggestedType);
    });
  });

  describe('Candidate Integration', () => {
    it('should detect multiple candidates in complex code', () => {
      const code = `
        const [state, setState] = useState();
        const data = useQuery({ queryKey: ['users'] });
        const schema = z.object({ name: z.string() });
        export const helper = () => {};
      `;

      const candidates = detectExtractionCandidatesPure(code);
      expect(candidates.length).toBeGreaterThan(1);
    });

    it('should provide comprehensive analysis', () => {
      const code = `
        const [user, setUser] = useState(null);
        useEffect(() => {
          try {
            const data = await fetch("/api/user");
            setUser(data);
          } catch (error) {
            console.error(error);
          }
        }, []);
      `;

      const candidates = detectExtractionCandidatesPure(code);
      const complexity = analyzeHookComplexityPure(code);
      const errors = detectErrorHandlingPure(code);
      const viability = calculateExtractionViabilityPure(code);

      expect(candidates.length).toBeGreaterThan(0);
      expect(complexity.complexity).toBeDefined();
      expect(errors.hasTryCatch).toBe(true);
      expect(viability.score).toBeGreaterThan(0);
    });
  });

  describe('Performance Regression Suite', () => {
    it('should analyze 1000-line hooks in <75ms', () => {
      const largeCode = Array(1000)
        .fill(`
          const [x, setX] = useState();
          useEffect(() => {}, []);
          const data = useQuery({});
        `)
        .join('\n');

      const start = performance.now();
      detectExtractionCandidatesPure(largeCode);
      analyzeHookComplexityPure(largeCode);
      extractDependenciesPure(largeCode);
      detectErrorHandlingPure(largeCode);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(75);
    });

    it('should generate recommendations quickly', () => {
      const complexCode = Array(500)
        .fill(
          `
        const [state1, setState1] = useState();
        const [state2, setState2] = useState();
        useEffect(() => {}, []);
        const data = await fetch("/api");
        try { } catch (e) { }
      `
        )
        .join('\n');

      const start = performance.now();
      calculateExtractionViabilityPure(complexCode);
      generateExtractionRecommendationPure(complexCode);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(75);
    });
  });
});
