/**
 * ProjectProfile: Detects and caches project-level conventions for generation constraints.
 *
 * Detects at startup:
 * - Tailwind CSS presence (tailwind.config.*)
 * - cn() utility path and import pattern
 * - CSS module presence/absence (*.module.css)
 * - Named export convention (majority of components use named exports)
 * - Existing component variants (e.g. Button's primary/secondary/danger)
 *
 * Persists to .lla-profile.json so future activations load instantly.
 * Injected into Executor + Planner prompts as hard constraints — shifting
 * from "validate output" to "constrain generation".
 */

import * as fs from 'fs';
import * as path from 'path';

interface ProjectProfileData {
  hasTailwind: boolean;
  cnUtilityPath: string | null;    // e.g. "src/utils/cn.ts"
  cnImportStatement: string | null; // e.g. "import { cn } from '@/utils/cn'"
  hasCssModules: boolean;
  namedExportConvention: boolean;  // true = prefer named exports
  existingVariants: string[];      // e.g. ["primary", "secondary", "danger"]
  detectedAt: string;              // ISO timestamp
}

const DEFAULTS: ProjectProfileData = {
  hasTailwind: false,
  cnUtilityPath: null,
  cnImportStatement: null,
  hasCssModules: false,
  namedExportConvention: true,
  existingVariants: [],
  detectedAt: new Date().toISOString(),
};

export class ProjectProfile {
  private data: ProjectProfileData = { ...DEFAULTS };
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Load cached profile from disk. Returns true if cache was found and loaded. */
  load(cacheFile: string): boolean {
    try {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ProjectProfileData>;
      this.data = { ...DEFAULTS, ...parsed };
      console.log(`[ProjectProfile] Loaded from cache: Tailwind=${this.data.hasTailwind}, cn=${this.data.cnUtilityPath}, cssModules=${this.data.hasCssModules}`);
      return true;
    } catch {
      return false;
    }
  }

  /** Persist current profile to disk. */
  save(cacheFile: string): void {
    try {
      this.data.detectedAt = new Date().toISOString();
      fs.writeFileSync(cacheFile, JSON.stringify(this.data, null, 2), 'utf-8');
      console.log(`[ProjectProfile] Saved to cache: ${cacheFile}`);
    } catch (err) {
      console.warn('[ProjectProfile] Could not save cache:', err);
    }
  }

  /**
   * Scan workspace for project conventions.
   * Runs file system checks — call after workspace is available.
   */
  async scan(): Promise<void> {
    console.log(`[ProjectProfile] Scanning workspace: ${this.workspacePath}`);

    const [hasTailwind, cnInfo, hasCssModules, exportConvention, variants] = await Promise.all([
      this.detectTailwind(),
      this.detectCnUtility(),
      this.detectCssModules(),
      this.detectExportConvention(),
      this.detectExistingVariants(),
    ]);

    this.data = {
      hasTailwind,
      cnUtilityPath: cnInfo?.filePath ?? null,
      cnImportStatement: cnInfo?.importStatement ?? null,
      hasCssModules,
      namedExportConvention: exportConvention,
      existingVariants: variants,
      detectedAt: new Date().toISOString(),
    };

    console.log(
      `[ProjectProfile] Scan complete — Tailwind:${hasTailwind} cn:${this.data.cnUtilityPath} ` +
      `cssModules:${hasCssModules} namedExports:${exportConvention} variants:[${variants.join(',')}]`
    );
  }

  /**
   * Returns a formatted constraint block for injection into LLM generation prompts.
   * Only emits constraints that were actually detected — avoids false rules.
   */
  getGenerationConstraints(): string {
    const lines: string[] = [];

    if (this.data.hasTailwind) {
      lines.push('- Tailwind CSS is the styling system — DO NOT use plain CSS, CSS modules, or inline styles');
    }

    if (this.data.cnUtilityPath) {
      lines.push(`- Import cn from "${this.data.cnUtilityPath}" — use cn() for ALL className merging (never string concat or template literals)`);
      if (this.data.cnImportStatement) {
        lines.push(`  Correct import: ${this.data.cnImportStatement}`);
      }
    }

    if (!this.data.hasCssModules) {
      lines.push('- No CSS modules in this project — DO NOT import *.module.css files');
    }

    if (this.data.namedExportConvention) {
      lines.push('- Named exports only: `export function MyComponent()` or `export const MyComponent =` — NO `export default`');
    }

    if (this.data.existingVariants.length > 0) {
      lines.push(`- Existing component variants already in codebase: ${this.data.existingVariants.join(', ')} — extend these, do not recreate`);
    }

    if (lines.length === 0) {
      return '';
    }

    return `PROJECT STYLING CONSTRAINTS (auto-detected — enforce strictly):\n${lines.join('\n')}\n`;
  }

  // ---------------------------------------------------------------------------
  // Getters (for tests / inspection)
  // ---------------------------------------------------------------------------

  get hasTailwind(): boolean { return this.data.hasTailwind; }
  get cnUtilityPath(): string | null { return this.data.cnUtilityPath; }
  get hasCssModules(): boolean { return this.data.hasCssModules; }
  get namedExportConvention(): boolean { return this.data.namedExportConvention; }
  get existingVariants(): string[] { return this.data.existingVariants; }

  // ---------------------------------------------------------------------------
  // Detection helpers (private)
  // ---------------------------------------------------------------------------

  private async detectTailwind(): Promise<boolean> {
    const candidates = [
      'tailwind.config.ts',
      'tailwind.config.js',
      'tailwind.config.cjs',
      'tailwind.config.mjs',
    ];
    for (const name of candidates) {
      if (this.exists(path.join(this.workspacePath, name))) {
        return true;
      }
    }
    // Also check for @tailwindcss/vite or tailwindcss in package.json dependencies
    try {
      const pkgPath = path.join(this.workspacePath, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['tailwindcss'] || deps['@tailwindcss/vite']) {
        return true;
      }
    } catch { /* package.json absent or malformed */ }
    return false;
  }

  private async detectCnUtility(): Promise<{ filePath: string; importStatement: string } | null> {
    // Common locations for cn utility
    const candidatePaths = [
      'src/utils/cn.ts',
      'src/utils/cn.js',
      'src/lib/cn.ts',
      'src/lib/cn.js',
      'src/lib/utils.ts',    // shadcn/ui convention — cn is in utils.ts
      'src/lib/utils.js',
      'lib/utils.ts',
      'lib/cn.ts',
      'utils/cn.ts',
    ];

    for (const rel of candidatePaths) {
      const abs = path.join(this.workspacePath, rel);
      if (!this.exists(abs)) { continue; }
      try {
        const content = fs.readFileSync(abs, 'utf-8');
        // Check if this file exports a `cn` function
        if (/export\s+(?:function|const)\s+cn\b/.test(content) || /export\s+\{[^}]*\bcn\b/.test(content)) {
          const importStatement = `import { cn } from '${this.toImportPath(rel)}'`;
          return { filePath: rel, importStatement };
        }
      } catch { continue; }
    }

    // Fallback: search src/ for a file that exports cn
    const found = this.grepForCnExport(path.join(this.workspacePath, 'src'));
    if (found) {
      const rel = path.relative(this.workspacePath, found).replace(/\\/g, '/');
      const importStatement = `import { cn } from '${this.toImportPath(rel)}'`;
      return { filePath: rel, importStatement };
    }

    return null;
  }

  private async detectCssModules(): Promise<boolean> {
    return this.walkHasPattern(this.workspacePath, /\.module\.css$/, 3);
  }

  private async detectExportConvention(): Promise<boolean> {
    const componentsDir = path.join(this.workspacePath, 'src', 'components');
    if (!this.exists(componentsDir)) { return true; } // default: named

    let named = 0;
    let defaultExports = 0;

    const files = this.listFiles(componentsDir, /\.(tsx|jsx)$/, 2);
    for (const file of files.slice(0, 20)) { // cap at 20 to stay fast
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (/export\s+default\s+/.test(content)) { defaultExports++; }
        if (/export\s+(?:const|function|class)\s+[A-Z]/.test(content)) { named++; }
      } catch { continue; }
    }

    // Named wins if equal or more than default
    return named >= defaultExports;
  }

  private async detectExistingVariants(): Promise<string[]> {
    // Look for a Button component with a variant prop
    const candidates = [
      'src/components/Button.tsx',
      'src/components/Button.jsx',
      'src/components/ui/Button.tsx',
      'src/components/ui/button.tsx',
    ];

    for (const rel of candidates) {
      const abs = path.join(this.workspacePath, rel);
      if (!this.exists(abs)) { continue; }
      try {
        const content = fs.readFileSync(abs, 'utf-8');
        const variants = this.extractVariantValues(content);
        if (variants.length > 0) { return variants; }
      } catch { continue; }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private exists(p: string): boolean {
    try {
      fs.accessSync(p);
      return true;
    } catch {
      return false;
    }
  }

  /** Convert a relative file path to a TypeScript import path (remove extension, add ./ prefix) */
  private toImportPath(rel: string): string {
    const withoutExt = rel.replace(/\.(ts|tsx|js|jsx)$/, '');
    return withoutExt.startsWith('src/') ? `@/${withoutExt.slice(4)}` : `./${withoutExt}`;
  }

  /** Walk a directory up to maxDepth and return true if any file matches the pattern. */
  private walkHasPattern(dir: string, pattern: RegExp, maxDepth: number): boolean {
    if (maxDepth <= 0 || !this.exists(dir)) { return false; }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return false; }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') { continue; }
      const full = path.join(dir, entry.name);
      if (entry.isFile() && pattern.test(entry.name)) { return true; }
      if (entry.isDirectory() && this.walkHasPattern(full, pattern, maxDepth - 1)) { return true; }
    }
    return false;
  }

  /** List all files matching pattern up to maxDepth. */
  private listFiles(dir: string, pattern: RegExp, maxDepth: number): string[] {
    if (maxDepth <= 0 || !this.exists(dir)) { return []; }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return []; }

    const result: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') { continue; }
      const full = path.join(dir, entry.name);
      if (entry.isFile() && pattern.test(entry.name)) { result.push(full); }
      else if (entry.isDirectory()) {
        result.push(...this.listFiles(full, pattern, maxDepth - 1));
      }
    }
    return result;
  }

  /** Search for a file exporting `cn` inside a directory (depth 4). */
  private grepForCnExport(dir: string): string | null {
    const files = this.listFiles(dir, /\.(ts|js)$/, 4);
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (/export\s+(?:function|const)\s+cn\b/.test(content)) {
          return file;
        }
      } catch { continue; }
    }
    return null;
  }

  /** Extract variant string values from a TypeScript union type or cva call. */
  private extractVariantValues(content: string): string[] {
    const variants = new Set<string>();

    // Pattern 1: variant?: 'primary' | 'secondary' | 'danger'
    const unionMatch = content.match(/variant\??:\s*(['"]\w+['"]\s*(?:\|\s*['"]\w+['"])*)/);
    if (unionMatch) {
      const matches = unionMatch[1].matchAll(/['"](\w+)['"]/g);
      for (const m of matches) { variants.add(m[1]); }
    }

    // Pattern 2: cva(..., { variants: { variant: { primary: ..., secondary: ... } } })
    const cvaMatch = content.match(/variants:\s*\{[^}]*variant:\s*\{([^}]*)\}/s);
    if (cvaMatch) {
      const matches = cvaMatch[1].matchAll(/(\w+)\s*:/g);
      for (const m of matches) { variants.add(m[1]); }
    }

    // Filter out common non-variant words
    const blacklist = new Set(['string', 'undefined', 'null', 'boolean', 'number', 'object']);
    return [...variants].filter(v => !blacklist.has(v));
  }
}
