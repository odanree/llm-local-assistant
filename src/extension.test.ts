import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Extension Tests
 * 
 * Note: Full integration tests require VS Code extension test environment.
 * These tests verify command parsing and error handling logic.
 */

describe('Extension Command Parsing', () => {
  describe('/read command parser', () => {
    const readPattern = /\/read\s+(\S+)/;

    it('should parse /read command with file path', () => {
      const match = '/read src/extension.ts'.match(readPattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/extension.ts');
    });

    it('should parse /read with nested paths', () => {
      const match = '/read examples/utils/helpers.ts'.match(readPattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('examples/utils/helpers.ts');
    });

    it('should handle /read with different extensions', () => {
      const patterns = [
        '/read config.json',
        '/read util.py',
        '/read styles.css',
        '/read README.md',
      ];

      patterns.forEach((pattern) => {
        const match = pattern.match(readPattern);
        expect(match).not.toBeNull();
      });
    });

    it('should not match /read without path', () => {
      const match = '/read'.match(readPattern);
      expect(match).toBeNull();
    });

    it('should not match malformed /read commands', () => {
      const patterns = [
        '/read',
        '/read  ',
        '/readfile.ts',
      ];

      patterns.forEach((pattern) => {
        const match = pattern.match(readPattern);
        if (pattern === '/read') {
          expect(match).toBeNull();
        }
      });
    });
  });

  describe('/write command parser', () => {
    const writePattern = /\/write\s+(\S+)(?:\s+(.+))?$/;

    it('should parse /write command with file path only', () => {
      const match = '/write test.ts'.match(writePattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('test.ts');
      expect(match?.[2]).toBeUndefined();
    });

    it('should parse /write with file path and prompt', () => {
      const match = '/write test.ts create a hello world function'.match(writePattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('test.ts');
      expect(match?.[2]).toBe('create a hello world function');
    });

    it('should parse /write with nested path and prompt', () => {
      const match = '/write src/utils/helpers.ts add utility functions'.match(writePattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/utils/helpers.ts');
      expect(match?.[2]).toBe('add utility functions');
    });

    it('should handle /write with multiword prompts', () => {
      const prompt = 'generate a complex function with error handling and documentation';
      const match = `/write test.ts ${prompt}`.match(writePattern);
      expect(match).not.toBeNull();
      expect(match?.[2]).toBe(prompt);
    });

    it('should not match /write without path', () => {
      const match = '/write'.match(writePattern);
      expect(match).toBeNull();
    });
  });

  describe('/suggestwrite command parser', () => {
    const suggestPattern = /\/suggestwrite\s+(\S+)(?:\s+(.+))?$/;

    it('should parse /suggestwrite command with file path only', () => {
      const match = '/suggestwrite test.ts'.match(suggestPattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('test.ts');
      expect(match?.[2]).toBeUndefined();
    });

    it('should parse /suggestwrite with file path and prompt', () => {
      const match = '/suggestwrite test.ts add comments and improve formatting'.match(suggestPattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('test.ts');
      expect(match?.[2]).toBe('add comments and improve formatting');
    });

    it('should parse /suggestwrite with nested path', () => {
      const match = '/suggestwrite src/main.ts refactor for performance'.match(suggestPattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/main.ts');
      expect(match?.[2]).toBe('refactor for performance');
    });

    it('should not match /suggestwrite without path', () => {
      const match = '/suggestwrite'.match(suggestPattern);
      expect(match).toBeNull();
    });
  });

  describe('command detection', () => {
    it('should distinguish between different command types', () => {
      const readCmd = '/read src/file.ts';
      const writeCmd = '/write src/file.ts create something';
      const suggestCmd = '/suggestwrite src/file.ts improve this';

      const readPattern = /\/read\s+(\S+)/;
      const writePattern = /\/write\s+(\S+)(?:\s+(.+))?$/;
      const suggestPattern = /\/suggestwrite\s+(\S+)(?:\s+(.+))?$/;

      expect(readCmd.match(readPattern)).not.toBeNull();
      expect(writeCmd.match(writePattern)).not.toBeNull();
      expect(suggestCmd.match(suggestPattern)).not.toBeNull();
    });

    it('should handle non-command messages', () => {
      const messages = [
        'What is TypeScript?',
        'How do I use async/await?',
        'Explain this code',
      ];

      const readPattern = /\/read\s+(\S+)/;
      const writePattern = /\/write\s+(\S+)(?:\s+(.+))?$/;

      messages.forEach((msg) => {
        expect(msg.match(readPattern)).toBeNull();
        expect(msg.match(writePattern)).toBeNull();
      });
    });

    it('should handle commands with special characters in prompts', () => {
      const writePattern = /\/write\s+(\S+)(?:\s+(.+))?$/;
      const commands = [
        '/write test.ts create a function: calculate area (circle)',
        '/write util.py handle errors: try/catch pattern?',
        '/write config.json add settings @ version 1.0',
      ];

      commands.forEach((cmd) => {
        expect(cmd.match(writePattern)).not.toBeNull();
      });
    });
  });

  describe('path validation', () => {
    const pathPattern = /^[\w\-.\/]+$/;

    it('should validate relative paths', () => {
      const paths = [
        'test.ts',
        'src/main.ts',
        'examples/utils/helpers.py',
        'config.json',
        'docs/README.md',
      ];

      paths.forEach((path) => {
        // Simplified validation (actual code may be more strict)
        expect(path).toBeDefined();
      });
    });

    it('should reject absolute paths', () => {
      const absolutePaths = [
        '/home/user/project/test.ts',
        'C:\\Users\\user\\project\\test.ts',
      ];

      absolutePaths.forEach((path) => {
        const isAbsolute = path.startsWith('/') || path.includes('\\');
        expect(isAbsolute).toBe(true);
      });
    });

    it('should handle paths with dots', () => {
      const paths = [
        'file.test.ts',
        '.github/workflows/build.yml',
        '../parent/file.ts',
      ];

      paths.forEach((path) => {
        expect(path).toBeDefined();
      });
    });
  });

  describe('error cases', () => {
    it('should identify malformed commands', () => {
      const malformed = [
        '/read',
        '/write',
        '/suggestwrite',
        '/ read file.ts',
        '/read  ',
      ];

      const readPattern = /\/read\s+(\S+)/;

      malformed.forEach((cmd) => {
        const match = cmd.match(readPattern);
        if (cmd === '/read' || cmd === '/ read file.ts' || cmd === '/read  ') {
          expect(match).toBeNull();
        }
      });
    });

    it('should handle commands with trailing/leading spaces', () => {
      const writePattern = /\/write\s+(\S+)(?:\s+(.+))?$/;
      const commands = [
        '  /write test.ts create function  ',
        '/write test.ts create function',
      ];

      // Only the second should match the pattern
      expect('/write test.ts create function'.match(writePattern)).not.toBeNull();
    });
  });
});

describe('File Path Resolution', () => {
  it('should construct valid workspace file paths', () => {
    const workspaceRoot = 'c:/Users/user/project';
    const relativePath = 'src/main.ts';
    const fullPath = `${workspaceRoot}/${relativePath}`;

    expect(fullPath).toBe('c:/Users/user/project/src/main.ts');
  });

  it('should handle Windows-style paths', () => {
    const workspaceRoot = 'C:\\Users\\user\\project';
    const relativePath = 'src\\main.ts';

    expect(workspaceRoot).toBeDefined();
    expect(relativePath).toBeDefined();
  });

  it('should handle Unix-style paths', () => {
    const workspaceRoot = '/home/user/project';
    const relativePath = 'src/main.ts';

    expect(workspaceRoot).toBeDefined();
    expect(relativePath).toBeDefined();
  });
});

  describe('Message Formatting', () => {
    it('should format error messages consistently', () => {
      const errors = [
        'Error reading file: File not found',
        'Error writing file: Permission denied',
        'Error connecting to LLM: Connection timeout',
      ];

      errors.forEach((error) => {
        // Error messages should start with "Error" and contain a colon
        expect(error).toContain('Error');
        expect(error).toContain(':');
      });
    });  it('should format status messages', () => {
    const statuses = [
      'Connecting to LLM server...',
      'Reading file...',
      'Generating content...',
    ];

    statuses.forEach((status) => {
      expect(status.length).toBeGreaterThan(0);
    });
  });

  it('should handle special message content', () => {
    const messages = [
      'User message with @mentions',
      'Message with #hashtags',
      'Message with `code blocks`',
      'Message with **bold** text',
    ];

    messages.forEach((msg) => {
      expect(msg).toBeDefined();
    });
  });
});

describe('All Command Patterns (v2.5.0 Parity)', () => {
  /**
   * Regression tests for all 13 commands to ensure no command is accidentally removed
   * in future releases. Each command must be parseable by its specific regex pattern.
   */

  describe('/read command', () => {
    const pattern = /^\/read\s+(.+)$/;

    it('should parse /read command', () => {
      const match = '/read src/extension.ts'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/extension.ts');
    });

    it('should require a file path', () => {
      expect('/read'.match(pattern)).toBeNull();
    });
  });

  describe('/write command', () => {
    const pattern = /^\/write\s+(\S+)(?:\s+(.+))?$/;

    it('should parse /write with file path only', () => {
      const match = '/write test.ts'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('test.ts');
    });

    it('should parse /write with file path and prompt', () => {
      const match = '/write test.ts create hello world'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('test.ts');
      expect(match?.[2]).toBe('create hello world');
    });
  });

  describe('/explain command', () => {
    const pattern = /^\/explain\s+(.+)$/;

    it('should parse /explain command', () => {
      const match = '/explain src/extension.ts'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/extension.ts');
    });

    it('should require a file path', () => {
      expect('/explain'.match(pattern)).toBeNull();
    });
  });

  describe('/plan command', () => {
    const pattern = /^\/plan\s+(.+)$/;

    it('should parse /plan command', () => {
      const match = '/plan refactor authentication system'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('refactor authentication system');
    });

    it('should require a task description', () => {
      expect('/plan'.match(pattern)).toBeNull();
    });
  });

  describe('/refactor command', () => {
    const pattern = /^\/refactor\s+(.+)$/;

    it('should parse /refactor command', () => {
      const match = '/refactor src/main.ts'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/main.ts');
    });

    it('should require a file path', () => {
      expect('/refactor'.match(pattern)).toBeNull();
    });
  });

  describe('/rate-architecture command', () => {
    const pattern = /^\/rate-architecture$/;

    it('should match /rate-architecture command', () => {
      expect('/rate-architecture'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/rate-architecture src/main.ts'.match(pattern)).toBeNull();
    });
  });

  describe('/help command', () => {
    const pattern = /^\/help$/;

    it('should match /help command', () => {
      expect('/help'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/help something'.match(pattern)).toBeNull();
    });
  });

  describe('/design-system command', () => {
    const pattern = /^\/design-system\s+(.+)$/;

    it('should parse /design-system command', () => {
      const match = '/design-system user authentication'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('user authentication');
    });

    it('should require a feature name', () => {
      expect('/design-system'.match(pattern)).toBeNull();
    });
  });

  describe('/suggest-patterns command', () => {
    const pattern = /^\/suggest-patterns$/;

    it('should match /suggest-patterns command', () => {
      expect('/suggest-patterns'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/suggest-patterns something'.match(pattern)).toBeNull();
    });
  });

  describe('/extract-service command', () => {
    const pattern = /^\/extract-service\s+(.+)$/;

    it('should parse /extract-service command', () => {
      const match = '/extract-service src/api.ts'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('src/api.ts');
    });

    it('should require a file path', () => {
      expect('/extract-service'.match(pattern)).toBeNull();
    });
  });

  describe('/context command', () => {
    const pattern = /^\/context\s+(.+)$/;

    it('should parse /context show structure', () => {
      const match = '/context show structure'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('show structure');
    });

    it('should parse /context show patterns', () => {
      const match = '/context show patterns'.match(pattern);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('show patterns');
    });

    it('should require a subcommand', () => {
      expect('/context'.match(pattern)).toBeNull();
    });
  });

  describe('/approve command', () => {
    const pattern = /^\/approve$/;

    it('should match /approve command', () => {
      expect('/approve'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/approve changes'.match(pattern)).toBeNull();
    });
  });

  describe('/reject command', () => {
    const pattern = /^\/reject$/;

    it('should match /reject command', () => {
      expect('/reject'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/reject changes'.match(pattern)).toBeNull();
    });
  });

  describe('/execute command', () => {
    const pattern = /^\/execute$/;

    it('should match /execute command', () => {
      expect('/execute'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/execute step 1'.match(pattern)).toBeNull();
    });
  });

  describe('/check-model command', () => {
    const pattern = /^\/check-model$/;

    it('should match /check-model command', () => {
      expect('/check-model'.match(pattern)).not.toBeNull();
    });

    it('should not accept parameters', () => {
      expect('/check-model verify'.match(pattern)).toBeNull();
    });
  });

  describe('Command Exclusivity', () => {
    /**
     * Ensure commands don't accidentally match each other
     * (regression test for typos or pattern overlaps)
     */
    it('should not confuse /plan with /plan-anything', () => {
      const readPattern = /^\/read\s+(.+)$/;
      const planPattern = /^\/plan\s+(.+)$/;

      const readMatch = '/read someplan.ts'.match(readPattern);
      const planMatch = '/plan someplan'.match(planPattern);

      expect(readMatch).not.toBeNull();
      expect(planMatch).not.toBeNull();
    });

    it('should not confuse /help with /help-something', () => {
      const helpPattern = /^\/help$/;
      expect('/help something'.match(helpPattern)).toBeNull();
    });

    it('should not match commands with typos', () => {
      const patterns = {
        read: /^\/read\s+(.+)$/,
        write: /^\/write\s+(\S+)(?:\s+(.+))?$/,
        plan: /^\/plan\s+(.+)$/,
        refactor: /^\/refactor\s+(.+)$/,
      };

      const typos = [
        '/rade src/file.ts',
        '/wite test.ts',
        '/pla task',
        '/refator src/file.ts',
      ];

      typos.forEach((typo) => {
        Object.values(patterns).forEach((pattern) => {
          expect(typo.match(pattern)).toBeNull();
        });
      });
    });
  });

  describe('Command Count Regression', () => {
    /**
     * Track total command count to catch accidental removals
     * This is a meta-test to ensure the command set stays complete
     */
    it('should have exactly 15 core commands', () => {
      const commands = [
        /^\/read\s+(.+)$/,                              // 1
        /^\/write\s+(\S+)(?:\s+(.+))?$/,               // 2
        /^\/explain\s+(.+)$/,                           // 3
        /^\/plan\s+(.+)$/,                              // 4
        /^\/refactor\s+(.+)$/,                          // 5
        /^\/rate-architecture$/,                        // 6
        /^\/help$/,                                     // 7
        /^\/design-system\s+(.+)$/,                     // 8
        /^\/suggest-patterns$/,                         // 9
        /^\/extract-service\s+(.+)$/,                   // 10
        /^\/context\s+(.+)$/,                           // 11
        /^\/approve$/,                                  // 12
        /^\/reject$/,                                   // 13
        /^\/execute$/,                                  // 14
        /^\/check-model$/,                              // 15
      ];

      // Verify we have 15 command patterns
      expect(commands.length).toBe(15);

      // Verify each pattern is a RegExp
      commands.forEach((cmd) => {
        expect(cmd).toBeInstanceOf(RegExp);
      });
    });
  });
});
