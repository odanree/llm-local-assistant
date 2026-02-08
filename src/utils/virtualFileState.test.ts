import { describe, it, expect } from 'vitest';
import { VirtualFileState } from './virtualFileState';

describe('VirtualFileState', () => {
  let vfs: VirtualFileState;

  beforeEach(() => {
    vfs = new VirtualFileState();
  });

  describe('File Management', () => {
    it('should load and retrieve files', () => {
      const content = 'const x = 1;';
      vfs.loadFile('test.ts', content);
      expect(vfs.getFile('test.ts')).toBe(content);
    });

    it('should handle multiple files', () => {
      vfs.loadFile('file1.ts', 'content1');
      vfs.loadFile('file2.ts', 'content2');
      expect(vfs.getAllFiles()).toHaveLength(2);
    });

    it('should return undefined for non-existent files', () => {
      expect(vfs.getFile('nonexistent.ts')).toBeUndefined();
    });
  });

  describe('Search & Replace Edits', () => {
    it('should replace text in file', () => {
      vfs.loadFile('test.ts', 'const x = 1;\nconst y = 2;');
      const result = vfs.applyEdit({
        type: 'search-replace',
        path: 'test.ts',
        original: 'const x = 1;',
        replacement: 'const x = 10;',
      });
      expect(result.success).toBe(true);
      expect(vfs.getFile('test.ts')).toBe('const x = 10;\nconst y = 2;');
    });

    it('should fail if original text not found', () => {
      vfs.loadFile('test.ts', 'const x = 1;');
      const result = vfs.applyEdit({
        type: 'search-replace',
        path: 'test.ts',
        original: 'const y = 2;',
        replacement: 'const y = 20;',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Original text not found');
    });

    it('should fail if file does not exist', () => {
      const result = vfs.applyEdit({
        type: 'search-replace',
        path: 'nonexistent.ts',
        original: 'x',
        replacement: 'y',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });

  describe('Append & Prepend Edits', () => {
    it('should append content to file', () => {
      vfs.loadFile('test.ts', 'const x = 1;');
      vfs.applyEdit({
        type: 'append',
        path: 'test.ts',
        content: 'const y = 2;',
      });
      expect(vfs.getFile('test.ts')).toBe('const x = 1;\nconst y = 2;');
    });

    it('should prepend content to file', () => {
      vfs.loadFile('test.ts', 'const x = 1;');
      vfs.applyEdit({
        type: 'prepend',
        path: 'test.ts',
        content: 'const y = 0;',
      });
      expect(vfs.getFile('test.ts')).toBe('const y = 0;\nconst x = 1;');
    });
  });

  describe('Syntax Validation', () => {
    it('should detect unbalanced braces', () => {
      vfs.loadFile('test.ts', 'const x = { a: 1');
      const result = vfs.validateSyntax('test.ts');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unbalanced braces'))).toBe(true);
    });

    it('should detect unbalanced parentheses', () => {
      vfs.loadFile('test.ts', 'const x = (1 + 2;');
      const result = vfs.validateSyntax('test.ts');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('parentheses'))).toBe(true);
    });

    it('should detect missing useState import', () => {
      vfs.loadFile('test.tsx', 'const [x, setX] = useState(0);');
      const result = vfs.validateSyntax('test.tsx');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('useState'))).toBe(true);
    });

    it('should detect missing useEffect import', () => {
      vfs.loadFile('test.tsx', 'useEffect(() => { }, []);');
      const result = vfs.validateSyntax('test.tsx');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('useEffect'))).toBe(true);
    });

    it('should pass validation for correct code', () => {
      vfs.loadFile('test.tsx', 'import { useState } from "react";\nconst [x, setX] = useState(0);');
      const result = vfs.validateSyntax('test.tsx');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Step History', () => {
    it('should record step edits', () => {
      vfs.loadFile('test.ts', 'const x = 1;');
      vfs.recordStep(1, [
        {
          type: 'search-replace',
          path: 'test.ts',
          original: 'const x = 1;',
          replacement: 'const x = 10;',
        },
      ]);
      const history = vfs.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].step).toBe(1);
      expect(history[0].edits).toHaveLength(1);
    });
  });

  describe('Step Context Creation', () => {
    it('should create context for next step', () => {
      vfs.loadFile('LoginForm.tsx', 'const LoginForm = () => {\n  return <div>Login</div>;\n};');
      const context = vfs.createStepContext('LoginForm.tsx', 1);
      expect(context).toContain('Current File State');
      expect(context).toContain('Step 1');
      expect(context).toContain('const LoginForm');
    });

    it('should fail gracefully for non-existent file', () => {
      const context = vfs.createStepContext('nonexistent.tsx', 1);
      expect(context).toContain('File not found');
    });
  });

  describe('Clear', () => {
    it('should reset all state', () => {
      vfs.loadFile('test.ts', 'const x = 1;');
      vfs.recordStep(1, []);
      vfs.clear();
      expect(vfs.getFile('test.ts')).toBeUndefined();
      expect(vfs.getHistory()).toHaveLength(0);
    });
  });
});
