import * as fs from 'fs';
import * as path from 'path';
import { ContextBuilder } from './contextBuilder';

describe('ContextBuilder', () => {
  // Mock workspace for testing
  const mockWorkspace = '/tmp/test-project';

  beforeAll(() => {
    // Create mock workspace structure
    if (!fs.existsSync(mockWorkspace)) {
      fs.mkdirSync(mockWorkspace, { recursive: true });
    }

    // Create mock package.json
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        axios: '^1.0.0',
      },
      devDependencies: {
        typescript: '^4.9.0',
        '@types/react': '^18.0.0',
      },
    };

    fs.writeFileSync(path.join(mockWorkspace, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create mock src directory
    const srcDir = path.join(mockWorkspace, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Create mock source files with imports
    fs.writeFileSync(
      path.join(srcDir, 'App.tsx'),
      `
import React, { useState, useEffect } from 'react';
import axios from 'axios';

export const App = () => {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    axios.get('/api').then(res => setData(res.data));
  }, []);
  
  return <div>{data}</div>;
};
      `
    );

    fs.writeFileSync(
      path.join(srcDir, 'utils.ts'),
      `
import axios from 'axios';

export const fetchData = async (url: string) => {
  const res = await axios.get(url);
  return res.data;
};
      `
    );
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(mockWorkspace)) {
      fs.rmSync(mockWorkspace, { recursive: true });
    }
  });

  describe('readPackageJson', () => {
    it('should read package.json correctly', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      expect(context.projectName).toBe('test-project');
      expect(context.dependencies.name).toBe('test-project');
      expect(context.dependencies.dependencies.has('react')).toBe(true);
      expect(context.dependencies.dependencies.has('axios')).toBe(true);
    });
  });

  describe('findSourceFiles', () => {
    it('should find TypeScript source files', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      expect(context.sourceFiles.length).toBeGreaterThan(0);
      expect(context.sourceFiles.some((f) => f.includes('App.tsx'))).toBe(true);
    });
  });

  describe('detectFrameworks', () => {
    it('should detect React framework', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      expect(context.detectedFrameworks).toContain('react');
    });
  });

  describe('analyzeImports', () => {
    it('should find common imports', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      expect(context.commonImports.length).toBeGreaterThan(0);

      const reactImports = context.commonImports.find((p) => p.source === 'react');
      expect(reactImports).toBeDefined();
      expect(reactImports?.imports.has('useState')).toBe(true);
    });

    it('should track import frequency', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      const axiosImports = context.commonImports.find((p) => p.source === 'axios');
      expect(axiosImports?.frequency).toBeGreaterThan(0);
    });
  });

  describe('generateContextPrompt', () => {
    it('should generate context prompt', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      const prompt = ContextBuilder.generateContextPrompt(context);

      expect(prompt).toContain('Project Context');
      expect(prompt).toContain('react');
      expect(prompt).toContain('Available Dependencies');
      expect(prompt).toContain('Guidelines');
    });

    it('should include common imports in prompt', async () => {
      const context = await ContextBuilder.buildContext(mockWorkspace);
      const prompt = ContextBuilder.generateContextPrompt(context);

      expect(prompt).toContain('Common Imports');
    });
  });
});
