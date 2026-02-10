import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceDetector } from './workspaceDetector';

describe('WorkspaceDetector', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test workspaces
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-detector-'));
  });

  afterEach(() => {
    // Clean up
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('Failed to clean temp dir:', err);
    }
  });

  describe('Single Workspace Detection', () => {
    it('should detect TypeScript project (package.json + tsconfig.json)', () => {
      const wsDir = path.join(tempDir, 'ts-project');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(wsDir, 'tsconfig.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].name).toBe('ts-project');
      expect(workspaces[0].type).toBe('typescript');
      expect(workspaces[0].indicators).toContain('package.json');
      expect(workspaces[0].indicators).toContain('tsconfig.json');
    });

    it('should detect Node.js project (package.json only)', () => {
      const wsDir = path.join(tempDir, 'node-project');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      expect(workspaces.length).toBeGreaterThanOrEqual(1);
      const found = workspaces.find((w) => w.name === 'node-project');
      expect(found).toBeDefined();
      expect(found?.type).toBe('node');
    });

    it('should detect VS Code workspace (.vscode/settings.json)', () => {
      const wsDir = path.join(tempDir, 'vscode-project');
      fs.mkdirSync(wsDir);
      fs.mkdirSync(path.join(wsDir, '.vscode'));
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(wsDir, '.vscode/settings.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const found = workspaces.find((w) => w.name === 'vscode-project');
      expect(found).toBeDefined();
      expect(found?.indicators).toContain('.vscode/settings.json');
    });

    it('should detect src folder as indicator', () => {
      const wsDir = path.join(tempDir, 'src-project');
      fs.mkdirSync(wsDir);
      fs.mkdirSync(path.join(wsDir, 'src'));
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const found = workspaces.find((w) => w.name === 'src-project');
      expect(found).toBeDefined();
      expect(found?.indicators).toContain('src/');
    });

    it('should detect git repository', () => {
      const wsDir = path.join(tempDir, 'git-project');
      fs.mkdirSync(wsDir);
      fs.mkdirSync(path.join(wsDir, '.git'));
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const found = workspaces.find((w) => w.name === 'git-project');
      expect(found).toBeDefined();
      expect(found?.indicators).toContain('.git/');
    });

    it('should not detect low-confidence folders', () => {
      const emptyDir = path.join(tempDir, 'empty-folder');
      fs.mkdirSync(emptyDir);

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const found = workspaces.find((w) => w.name === 'empty-folder');
      expect(found).toBeUndefined();
    });
  });

  describe('Multiple Workspaces Detection', () => {
    it('should detect multiple workspaces', () => {
      // Create 3 workspaces
      for (const name of ['project1', 'project2', 'project3']) {
        const wsDir = path.join(tempDir, name);
        fs.mkdirSync(wsDir);
        fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');
      }

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      expect(workspaces.length).toBeGreaterThanOrEqual(3);
      expect(workspaces.map((w) => w.name)).toContain('project1');
      expect(workspaces.map((w) => w.name)).toContain('project2');
      expect(workspaces.map((w) => w.name)).toContain('project3');
    });

    it('should sort by confidence', () => {
      // Create projects with different confidence levels
      const ts = path.join(tempDir, 'typescript');
      fs.mkdirSync(ts);
      fs.writeFileSync(path.join(ts, 'package.json'), '{}');
      fs.writeFileSync(path.join(ts, 'tsconfig.json'), '{}');

      const node = path.join(tempDir, 'nodejs');
      fs.mkdirSync(node);
      fs.writeFileSync(path.join(node, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const tsIndex = workspaces.findIndex((w) => w.name === 'typescript');
      const nodeIndex = workspaces.findIndex((w) => w.name === 'nodejs');

      // TypeScript should have higher confidence (more indicators)
      expect(tsIndex).toBeLessThan(nodeIndex);
    });
  });

  describe('Workspace Selection', () => {
    it('should get workspace by index', () => {
      const ws1 = path.join(tempDir, 'first');
      const ws2 = path.join(tempDir, 'second');
      fs.mkdirSync(ws1);
      fs.mkdirSync(ws2);
      fs.writeFileSync(path.join(ws1, 'package.json'), '{}');
      fs.writeFileSync(path.join(ws2, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      expect(workspaces.length).toBeGreaterThanOrEqual(2);

      const selected = WorkspaceDetector.getWorkspaceByIndex(workspaces, 1);
      expect(selected).toBeDefined();
      expect(selected?.name).toBe(workspaces[0].name);
    });

    it('should return null for invalid index', () => {
      const ws = path.join(tempDir, 'test');
      fs.mkdirSync(ws);
      fs.writeFileSync(path.join(ws, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      expect(WorkspaceDetector.getWorkspaceByIndex(workspaces, 0)).toBeNull();
      expect(WorkspaceDetector.getWorkspaceByIndex(workspaces, 999)).toBeNull();
    });
  });

  describe('Display Formatting', () => {
    it('should format workspaces for display', () => {
      const ws1 = path.join(tempDir, 'portfolio');
      const ws2 = path.join(tempDir, 'ai-chatbot');
      fs.mkdirSync(ws1);
      fs.mkdirSync(ws2);
      fs.writeFileSync(path.join(ws1, 'package.json'), '{}');
      fs.writeFileSync(path.join(ws2, 'package.json'), '{}');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const display = WorkspaceDetector.formatForDisplay(workspaces);

      expect(display).toContain('Detected');
      expect(display).toContain('Which workspace');
      expect(display).toContain('new');
    });

    it('should handle empty workspace list', () => {
      const display = WorkspaceDetector.formatForDisplay([]);
      expect(display).toContain('No existing workspaces');
    });
  });

  describe('Source File Detection', () => {
    it('should detect TypeScript files (with package.json)', () => {
      const wsDir = path.join(tempDir, 'ts-files');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(wsDir, 'index.ts'), '// code');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const found = workspaces.find((w) => w.name === 'ts-files');
      expect(found).toBeDefined();
      expect(found?.indicators).toContain('source-files');
    });

    it('should detect React files (.tsx)', () => {
      const wsDir = path.join(tempDir, 'react-files');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(wsDir, 'App.tsx'), '// code');

      const workspaces = WorkspaceDetector.findWorkspaces(tempDir);
      const found = workspaces.find((w) => w.name === 'react-files');
      expect(found).toBeDefined();
    });
  });
});
