import { describe, it, expect } from 'vitest';
import { parseLeanOutput, validateLeanOutput } from '../utils/leanParser';

/**
 * Phase 10A: Lean Parser Pragmatic Testing
 *
 * Strategy: Test core functionality without assuming edge case behavior
 * Target: Increase coverage from 0% to 40%+
 * Focus: Header parsing, export detection, basic validation
 */

describe('Phase 10A: Lean Parser Pragmatic Testing', () => {
  describe('parseLeanOutput - Core Functionality', () => {
    it('should parse minimal valid lean output', () => {
      const input = `// @path: src/App.tsx
import React from "react";
export default function App() {
  return <div>Hello</div>;
}`;

      const result = parseLeanOutput(input);
      expect(result.filePath).toBe('src/App.tsx');
      expect(result.cleanCode).toContain('import React');
      expect(result.cleanCode).toContain('export default');
    });

    it('should extract path from header', () => {
      const input = `// @path: src/components/Button.tsx
import React from "react";
export default Button;`;

      const result = parseLeanOutput(input);
      expect(result.filePath).toBe('src/components/Button.tsx');
    });

    it('should remove @path header line', () => {
      const input = `// @path: src/App.tsx
import React from "react";
export default App;`;

      const result = parseLeanOutput(input);
      expect(result.cleanCode).not.toContain('@path');
    });

    it('should remove markdown fences', () => {
      const input = `// @path: src/App.tsx
\`\`\`tsx
import React from "react";
export default App;
\`\`\``;

      const result = parseLeanOutput(input);
      expect(result.cleanCode).not.toContain('```');
    });

    it('should trim whitespace', () => {
      const input = `// @path:   src/App.tsx
import React from "react";
export default App;`;

      const result = parseLeanOutput(input);
      expect(result.filePath).toBe('src/App.tsx');
    });
  });

  describe('parseLeanOutput - Error Cases', () => {
    it('should throw error when missing @path header', () => {
      const input = `import React from "react";
export default App;`;

      expect(() => parseLeanOutput(input)).toThrow('Missing @path header');
    });

    it('should throw error when missing export default', () => {
      const input = `// @path: src/App.tsx
import React from "react";
function App() { return null; }`;

      expect(() => parseLeanOutput(input)).toThrow('Missing Export Anchor');
    });

    it('should throw error when code does not start with import', () => {
      const input = `// @path: src/App.tsx
const App = () => <div/>;
export default App;`;

      expect(() => parseLeanOutput(input)).toThrow('must start with import statement');
    });
  });

  describe('validateLeanOutput - Core Functionality', () => {
    it('should validate correct lean output', () => {
      const input = `// @path: src/App.tsx
import React from "react";
export default App;`;

      const result = validateLeanOutput(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing @path header', () => {
      const input = `import React from "react";
export default App;`;

      const result = validateLeanOutput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing export default', () => {
      const input = `// @path: src/App.tsx
import React from "react";
const App = () => <div/>;`;

      const result = validateLeanOutput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('export'))).toBe(true);
    });
  });

  describe('validateLeanOutput - Conversational Text', () => {
    it('should detect "Here is" text', () => {
      const input = `Here is the code:
// @path: src/App.tsx
import React from "react";
export default App;`;

      const result = validateLeanOutput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('conversational'))).toBe(true);
    });

    it('should detect "Sure!" text', () => {
      const input = `Sure!
// @path: src/App.tsx
import React from "react";
export default App;`;

      const result = validateLeanOutput(input);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateLeanOutput - Edge Cases', () => {
    it('should handle empty string', () => {
      const result = validateLeanOutput('');
      expect(result.valid).toBe(false);
    });

    it('should validate code with complex JSX', () => {
      const input = `// @path: src/App.tsx
import React from "react";
const App = () => (
  <div>
    <h1>Hello</h1>
  </div>
);
export default App;`;

      const result = validateLeanOutput(input);
      expect(result.valid).toBe(true);
    });
  });

  describe('Integration: Full Workflow', () => {
    it('should validate and parse valid output', () => {
      const input = `// @path: src/App.tsx
import React from "react";
export default App;`;

      const validation = validateLeanOutput(input);
      expect(validation.valid).toBe(true);

      const parsed = parseLeanOutput(input);
      expect(parsed.filePath).toBe('src/App.tsx');
      expect(parsed.cleanCode).toContain('import React');
    });

    it('should detect invalid output before parsing', () => {
      const input = `// @path: src/App.tsx
const App = () => <div/>;`;

      const validation = validateLeanOutput(input);
      expect(validation.valid).toBe(false);

      expect(() => parseLeanOutput(input)).toThrow();
    });
  });
});
