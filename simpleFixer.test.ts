import { SimpleFixer } from './simpleFixer';

describe('SimpleFixer', () => {
  describe('fixMissingImports', () => {
    it('should add missing useState import', () => {
      const code = `
        const [count, setCount] = useState(0);
      `;
      const result = SimpleFixer.fix(code);
      expect(result.fixed).toBe(true);
      expect(result.code).toContain("import { useState } from 'react'");
    });

    it('should add multiple missing React hooks', () => {
      const code = `
        const [count, setCount] = useState(0);
        useEffect(() => {}, []);
      `;
      const result = SimpleFixer.fix(code);
      expect(result.fixed).toBe(true);
      expect(result.code).toContain('useState');
      expect(result.code).toContain('useEffect');
    });

    it('should not add duplicate imports', () => {
      const code = `
        import { useState } from 'react';
        const [count, setCount] = useState(0);
      `;
      const result = SimpleFixer.fix(code);
      expect(result.appliedFixes.filter((f) => f.type === 'import')).toHaveLength(0);
    });
  });

  describe('removeDuplicateImports', () => {
    it('should remove duplicate import statements', () => {
      const code = `
        import { useState } from 'react';
        import { useEffect } from 'react';
        const [count, setCount] = useState(0);
      `;
      const result = SimpleFixer.fix(code);
      const duplicateFixes = result.appliedFixes.filter((f) => f.type === 'duplicate');
      expect(duplicateFixes.length).toBeGreaterThan(0);
    });
  });

  describe('fixMissingSemicolons', () => {
    it('should add missing semicolons to variable declarations', () => {
      const code = `const x = 5\nconst y = 10`;
      const result = SimpleFixer.fix(code);
      expect(result.code).toContain('const x = 5;');
      expect(result.code).toContain('const y = 10;');
    });
  });

  describe('fixClosingBrackets', () => {
    it('should add missing closing bracket', () => {
      const code = `const arr = [1, 2, 3`;
      const result = SimpleFixer.fix(code);
      expect(result.code).toContain(']');
    });

    it('should add missing closing paren', () => {
      const code = `function test(x`;
      const result = SimpleFixer.fix(code);
      expect(result.code).toContain(')');
    });
  });
});
