import * as path from 'path';
import * as t from '@babel/types';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { IFileSystem } from './providers/IFileSystem';
import { FileSystemProvider } from './providers/FileSystemProvider';

// ---------------------------------------------------------------------------
// EmbeddingClient — thin wrapper around Ollama /api/embeddings
// ---------------------------------------------------------------------------

export interface EmbeddingClientConfig {
  endpoint?: string;       // default: http://localhost:11434
  model?: string;          // default: nomic-embed-text
}

export class EmbeddingClient {
  private endpoint: string;
  private model: string;

  constructor(config: EmbeddingClientConfig = {}) {
    this.endpoint = (config.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model ?? 'nomic-embed-text';
  }

  /** Embed a single string. Returns a float vector or throws on network error. */
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json() as { embedding: number[] };
    return json.embedding;
  }

  /** Embed multiple strings in sequence. Returns same-order vectors. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

/** Cosine similarity between two equal-length vectors (range −1 … 1). */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * CodebaseIndex: Tracks and indexes the codebase for context-aware code generation
 *
 * Phase 3.3 Component 1: Enables /context command and intelligent planning
 *
 * What it does:
 * - Scan TypeScript files in project
 * - Extract file purpose and patterns
 * - Track dependencies between files
 * - Generate embeddings for similarity search
 * - Enable /context command queries
 */

export interface FileEntry {
  path: string;
  name: string;
  purpose: string; // "schema", "hook", "service", "component", etc.
  imports: string[];
  exports: string[];
  dependencies: string[]; // Other files this depends on
  patterns: string[]; // Detected patterns (Zod, TanStack Query, etc.)
  embeddings?: number[];
  lastUpdated: number;
}

export interface DependencyGraph {
  [filePath: string]: string[]; // Maps file to files it depends on
}

export interface PatternRegistry {
  [patternName: string]: {
    count: number;
    examples: string[];
    description: string;
  };
}

export class CodebaseIndex {
  private files: Map<string, FileEntry> = new Map();
  private dependencies: DependencyGraph = {};
  private patterns: PatternRegistry = {};
  private projectRoot: string = '';
  private fs: IFileSystem;

  constructor(projectRoot?: string, fs?: IFileSystem) {
    this.projectRoot = projectRoot || process.cwd();
    this.fs = fs || new FileSystemProvider();
  }

  /**
   * Scan project directory and index all TypeScript files
   * Auto-detects source directories (src, app, components, etc.)
   * Also scans project root for files not in a src directory
   */
  async scan(srcDir?: string): Promise<void> {
    let scanDirs: string[] = [];

    // If no explicit dir provided, auto-detect source directories
    if (!srcDir) {
      scanDirs = this.autoDetectSourceDirs();
    } else {
      scanDirs = [srcDir];
    }

    if (scanDirs.length === 0) {
      console.log(`[CodebaseIndex] No source directories found`);
      return;
    }

    console.log(`[CodebaseIndex] Scanning from: ${scanDirs.join(', ')}`);
    
    // Scan all directories
    for (const dir of scanDirs) {
      if (this.fs.existsSync(dir)) {
        this.scanDirectory(dir);
      }
    }
    
    this.extractDependencies();
    this.detectPatterns();
  }

  /**
   * Auto-detect source directories in project
   * Looks for common patterns: src/, app/, components/, lib/
   * Also includes project root if it has component files
   * Returns array of directories to scan (both src AND root)
   */
  private autoDetectSourceDirs(): string[] {
    const dirs: string[] = [];
    const commonSourceDirs = ['src', 'app', 'components', 'lib', 'source', 'code'];

    // Check for standard source directories
    for (const dir of commonSourceDirs) {
      const fullPath = path.join(this.projectRoot, dir);
      try {
        if (this.fs.existsSync(fullPath) && this.fs.statSync(fullPath).isDirectory()) {
          console.log(`[CodebaseIndex] Found source dir: ${dir}`);
          dirs.push(fullPath);
        }
      } catch (error) {
        // Ignore stat errors (permission denied, etc.)
        continue;
      }
    }

    // Always include project root if it has TypeScript files
    try {
      const rootFiles = this.fs.readdirSync(this.projectRoot).filter(f =>
        (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')) &&
        !f.startsWith('.')
      );

      if (rootFiles.length > 0) {
        console.log(`[CodebaseIndex] Found ${rootFiles.length} files at project root`);
        dirs.push(this.projectRoot);
      }
    } catch (error) {
      // If can't read root, skip it
      console.debug(`[CodebaseIndex] Could not read project root for file enumeration`);
    }

    // If no directories found, default to project root
    if (dirs.length === 0) {
      console.log(`[CodebaseIndex] No source directories found, using project root`);
      dirs.push(this.projectRoot);
    }

    return dirs;
  }

  /**
   * Recursively scan directory for TypeScript files
   * Skips node_modules, .next, .git, and other common non-source directories
   */
  private scanDirectory(dir: string): void {
    try {
      // Skip directories that shouldn't be scanned
      const dirName = path.basename(dir);
      const skipDirs = [
        'node_modules',
        '.next',
        '.git',
        '.venv',
        'dist',
        'build',
        'coverage',
        '.nuxt',
        'out',
        '__pycache__',
        '.pytest_cache',
      ];

      if (skipDirs.includes(dirName)) {
        return;
      }

      const entries = this.fs.readdirSync(dir, { withFileTypes: true });

      entries.forEach(entry => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories (unless skipped)
          this.scanDirectory(fullPath);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          // Parse TypeScript file
          this.indexFile(fullPath);
        }
      });
    } catch (error) {
      console.error(`[CodebaseIndex] Error scanning ${dir}:`, error);
    }
  }

  /**
   * Index a single TypeScript file
   */
  private indexFile(filePath: string): void {
    try {
      const content = this.fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(this.projectRoot, filePath);

      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });

      const imports: string[] = [];
      const exports: string[] = [];
      const purpose = this.determinePurpose(filePath, ast);

      traverse(ast, {
        ImportDeclaration(nodePath) {
          const source = nodePath.node.source.value;
          if (!source.startsWith('.')) {
            // External import (react, zod, etc.)
            imports.push(source);
          }
        },
        ExportNamedDeclaration(nodePath) {
          if (t.isIdentifier(nodePath.node.declaration?.id)) {
            exports.push(nodePath.node.declaration.id.name);
          }
        },
        ExportDefaultDeclaration(nodePath) {
          exports.push('default');
        },
      });

      const fileEntry: FileEntry = {
        path: relativePath,
        name: path.basename(filePath),
        purpose,
        imports,
        exports,
        dependencies: [], // Filled in extractDependencies()
        patterns: [],
        lastUpdated: Date.now(),
      };

      this.files.set(relativePath, fileEntry);
    } catch (error) {
      console.error(`[CodebaseIndex] Error indexing ${filePath}:`, error);
    }
  }

  /**
   * Determine file purpose from path and content
   */
  private determinePurpose(filePath: string, ast: t.File): string {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();

    // Priority 1: Classify by directory (most reliable)
    if (dirName.includes('schema')) {return 'schema';}
    if (dirName.includes('service') || dirName.includes('api')) {return 'service';}
    if (dirName.includes('component')) {return 'component';}
    if (dirName.includes('hook')) {return 'hook';}
    if (dirName.includes('util') || dirName.includes('helper')) {return 'utility';}
    if (dirName.includes('type') || fileName === 'index.ts') {return 'types';}
    if (dirName.includes('constant')) {return 'constant';}

    // Priority 2: Classify by file extension (if not in a classified directory)
    if (fileName.endsWith('.tsx')) {return 'component';}

    // Priority 3: Classify by naming pattern (only if directory didn't classify it)
    // Files named useXxx in root/unknown locations are hooks
    if (fileName.startsWith('use')) {return 'hook';}

    return 'unknown';
  }

  /**
   * Extract dependencies between files
   */
  private extractDependencies(): void {
    this.files.forEach((file, filePath) => {
      const fileDir = path.dirname(filePath);
      const dependencies: string[] = [];

      file.imports.forEach(importPath => {
        if (importPath.startsWith('.')) {
          // Relative import
          const resolvedPath = path.normalize(
            path.join(fileDir, importPath)
          );

          // Try various extensions
          for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
            const fullPath = resolvedPath.endsWith(ext)
              ? resolvedPath
              : resolvedPath + ext;

            if (this.files.has(fullPath)) {
              dependencies.push(fullPath);
              break;
            }
          }
        }
      });

      file.dependencies = dependencies;
      this.dependencies[filePath] = dependencies;
    });
  }

  /**
   * Detect patterns used across codebase
   */
  private detectPatterns(): void {
    this.files.forEach(file => {
      const patterns = this.detectFilePatterns(file);
      file.patterns = patterns;

      patterns.forEach(pattern => {
        if (!this.patterns[pattern]) {
          this.patterns[pattern] = {
            count: 0,
            examples: [],
            description: '',
          };
        }
        this.patterns[pattern].count++;
        this.patterns[pattern].examples.push(file.path);
      });
    });
  }

  /**
   * Detect patterns in a specific file
   */
  private detectFilePatterns(file: FileEntry): string[] {
    const patterns: string[] = [];

    // Check for Zod
    if (file.imports.includes('zod')) {
      patterns.push('Zod schema');
    }

    // Check for TanStack Query
    if (
      file.imports.includes('@tanstack/react-query') ||
      file.imports.includes('react-query')
    ) {
      patterns.push('TanStack Query');
    }

    // Check for React Hook Form
    if (file.imports.includes('react-hook-form')) {
      patterns.push('React Hook Form');
    }

    // Check for Zustand
    if (file.imports.includes('zustand')) {
      patterns.push('Zustand store');
    }

    // Check for React
    if (file.imports.includes('react') && file.purpose === 'component') {
      patterns.push('React component');
    }

    if (file.purpose === 'hook' && file.name.startsWith('use')) {
      patterns.push('Custom hook');
    }

    if (file.purpose === 'schema') {
      patterns.push('Validation schema');
    }

    if (file.purpose === 'service') {
      patterns.push('API service');
    }

    return patterns;
  }

  /**
   * Get file by path
   */
  getFile(filePath: string): FileEntry | undefined {
    return this.files.get(filePath);
  }

  /**
   * Get all files matching a purpose
   */
  getFilesByPurpose(purpose: string): FileEntry[] {
    return Array.from(this.files.values()).filter(f => f.purpose === purpose);
  }

  /**
   * Get files by pattern
   */
  getFilesByPattern(pattern: string): FileEntry[] {
    return Array.from(this.files.values()).filter(f =>
      f.patterns.includes(pattern)
    );
  }

  /**
   * Get dependency tree for a file
   */
  getDependencies(filePath: string): string[] {
    return this.dependencies[filePath] || [];
  }

  /**
   * Get dependents (files that depend on this one)
   */
  getDependents(filePath: string): string[] {
    const dependents: string[] = [];
    Object.entries(this.dependencies).forEach(([file, deps]) => {
      if (deps.includes(filePath)) {
        dependents.push(file);
      }
    });
    return dependents;
  }

  /**
   * Get all files in dependency order (topological sort)
   */
  getFilesInDependencyOrder(): FileEntry[] {
    const sorted: FileEntry[] = [];
    const visited = new Set<string>();

    const visit = (filePath: string) => {
      if (visited.has(filePath)) {return;}
      visited.add(filePath);

      const deps = this.dependencies[filePath] || [];
      deps.forEach(dep => visit(dep));

      const file = this.files.get(filePath);
      if (file) {
        sorted.push(file);
      }
    };

    this.files.forEach((_, filePath) => visit(filePath));
    return sorted;
  }

  /**
   * Get all detected patterns
   */
  getPatterns(): PatternRegistry {
    return this.patterns;
  }

  /**
   * Find similar files (stub for Phase 3.3.2 - embeddings)
   */
  async findSimilar(filePath: string, limit: number = 5): Promise<FileEntry[]> {
    // TODO: Phase 3.3.2 - implement embedding-based similarity search
    // For now, return files with similar purpose
    const file = this.files.get(filePath);
    if (!file) {return [];}

    return Array.from(this.files.values())
      .filter(f => f.purpose === file.purpose && f.path !== filePath)
      .slice(0, limit);
  }

  /**
   * Get codebase summary for LLM context
   */
  getSummary(): string {
    const summary: string[] = [];

    summary.push('# Codebase Structure\n');

    // File organization
    const byPurpose = new Map<string, FileEntry[]>();
    this.files.forEach(file => {
      if (!byPurpose.has(file.purpose)) {
        byPurpose.set(file.purpose, []);
      }
      byPurpose.get(file.purpose)!.push(file);
    });

    summary.push('## Files by Purpose\n');
    byPurpose.forEach((files, purpose) => {
      summary.push(`### ${purpose}`);
      files.forEach(f => {
        summary.push(`- ${f.path}`);
      });
      summary.push('');
    });

    // Patterns
    summary.push('## Detected Patterns\n');
    Object.entries(this.patterns).forEach(([pattern, info]) => {
      if (info.count > 0) {
        summary.push(`- ${pattern} (${info.count} files)`);
      }
    });

    return summary.join('\n');
  }

  /**
   * Add a new file to the index (called during plan execution)
   */
  addFile(filePath: string, content: string): void {
    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });

      const imports: string[] = [];
      traverse(ast, {
        ImportDeclaration(nodePath) {
          imports.push(nodePath.node.source.value);
        },
      });

      const fileEntry: FileEntry = {
        path: relativePath,
        name: path.basename(filePath),
        purpose: this.determinePurpose(filePath, ast),
        imports,
        exports: [],
        dependencies: [],
        patterns: this.detectFilePatterns({
          path: relativePath,
          name: path.basename(filePath),
          purpose: 'unknown',
          imports,
          exports: [],
          dependencies: [],
          patterns: [],
          lastUpdated: Date.now(),
        }),
        lastUpdated: Date.now(),
      };

      this.files.set(relativePath, fileEntry);
      this.extractDependencies();
      this.detectPatterns();
    } catch (error) {
      console.error(`[CodebaseIndex] Error adding file ${filePath}:`, error);
    }
  }

  // ============================================================
  // RAG Bridge: flat metadata + chunking (prep for vector store)
  // ============================================================

  /**
   * Return all indexed files as a flat metadata array.
   * Swap `embeddings` in later when a local embedding model is available.
   */
  getMetadataJSON(): Array<{
    path: string;
    name: string;
    purpose: string;
    imports: string[];
    exports: string[];
    patterns: string[];
    lastUpdated: number;
  }> {
    return Array.from(this.files.values()).map(f => ({
      path: f.path,
      name: f.name,
      purpose: f.purpose,
      imports: f.imports,
      exports: f.exports,
      patterns: f.patterns,
      lastUpdated: f.lastUpdated,
    }));
  }

  /**
   * Split text into overlapping chunks suitable for embedding.
   * Default: 512-char chunks with 64-char overlap.
   */
  static chunkText(
    text: string,
    chunkSize = 512,
    overlap = 64
  ): Array<{ text: string; start: number; end: number }> {
    const chunks: Array<{ text: string; start: number; end: number }> = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push({ text: text.slice(start, end), start, end });
      start += chunkSize - overlap;
      if (start >= text.length) break;
    }
    return chunks;
  }

  /**
   * Chunk all indexed file contents for downstream embedding.
   * Returns file path + chunk array pairs.
   */
  async getFileChunks(
    chunkSize = 512,
    overlap = 64
  ): Promise<Array<{ path: string; chunks: Array<{ text: string; start: number; end: number }> }>> {
    const result: Array<{ path: string; chunks: Array<{ text: string; start: number; end: number }> }> = [];

    for (const [relativePath] of this.files) {
      try {
        const absolutePath = path.join(this.projectRoot, relativePath);
        const content = this.fs.readFileSync(absolutePath, 'utf-8');
        result.push({
          path: relativePath,
          chunks: CodebaseIndex.chunkText(content, chunkSize, overlap),
        });
      } catch {
        // Skip unreadable files
      }
    }

    return result;
  }

  // ============================================================
  // RAG: embedding + symbol resolution
  // ============================================================

  /**
   * Embed every indexed file's export list and store the vector on its FileEntry.
   * Call once at startup (or after re-index). Safe to call repeatedly — only
   * re-embeds files whose `embeddings` field is still unset.
   *
   * @param client  EmbeddingClient pointing at a running Ollama instance
   */
  async embedAll(client: EmbeddingClient): Promise<void> {
    for (const [, entry] of this.files) {
      if (entry.embeddings && entry.embeddings.length > 0) continue; // already done
      if (entry.exports.length === 0) continue;                       // nothing to embed
      // Represent the file as "exports: X, Y, Z  path: src/foo/bar.ts"
      const text = `exports: ${entry.exports.join(', ')}  path: ${entry.path}`;
      try {
        entry.embeddings = await client.embed(text);
      } catch {
        // Skip — Ollama may not be running; degrades gracefully to dict fallback
      }
    }
  }

  /**
   * Find which file in the index exports a given symbol name.
   * Uses cosine similarity against pre-embedded export lists.
   * Falls back to an exact-string scan if no embeddings are available.
   *
   * @param symbolName  e.g. "cn", "SmartAutoCorrection", "useAuthStore"
   * @param client      EmbeddingClient (needed for query embedding)
   * @param threshold   Minimum similarity score (default 0.75)
   * @returns Relative file path, or null if not found
   */
  async resolveExportSource(
    symbolName: string,
    client: EmbeddingClient,
    threshold = 0.75
  ): Promise<string | null> {
    // 1. Exact match — fast path, no embedding needed
    for (const [, entry] of this.files) {
      if (entry.exports.includes(symbolName)) {
        return entry.path;
      }
    }

    // 2. Semantic match — embed the query and find closest file
    let queryVec: number[];
    try {
      queryVec = await client.embed(`exports: ${symbolName}`);
    } catch {
      return null; // Ollama unavailable
    }

    let bestScore = -1;
    let bestPath: string | null = null;

    for (const [, entry] of this.files) {
      if (!entry.embeddings || entry.embeddings.length === 0) continue;
      const score = cosineSimilarity(queryVec, entry.embeddings);
      if (score > bestScore) {
        bestScore = score;
        bestPath = entry.path;
      }
    }

    return bestScore >= threshold ? bestPath : null;
  }

}

export default CodebaseIndex;
