import * as path from 'path';
import * as fs from 'fs';
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

export interface ContentChunk {
  text: string;   // raw text of this chunk
  vec: number[];  // embedding vector
}

export interface FileEntry {
  path: string;
  name: string;
  purpose: string; // "schema", "hook", "service", "component", etc.
  imports: string[];
  exports: string[];
  dependencies: string[]; // Other files this depends on
  patterns: string[]; // Detected patterns (Zod, TanStack Query, etc.)
  embeddings?: number[];      // export-list embedding (legacy, kept for resolveExportSource)
  contentChunks?: ContentChunk[]; // content-based chunk embeddings
  lastUpdated: number;
}

export interface DependencyGraph {
  [filePath: string]: string[]; // Maps file to files it depends on
}

export interface EmbeddingsCache {
  model: string;
  savedAt: number;
  files: Array<{ path: string; embeddings: number[]; contentChunks?: ContentChunk[] }>;
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

      const imports: string[] = [];
      const exports: string[] = [];

      // Extract external imports via regex (avoids heavy babel dependency)
      const importRe = /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(content)) !== null) {
        if (!m[1].startsWith('.')) { imports.push(m[1]); }
      }

      // Extract named exports
      const namedExportRe = /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gm;
      while ((m = namedExportRe.exec(content)) !== null) { exports.push(m[1]); }
      // export { foo, bar as baz }
      const reExportRe = /^export\s+\{([^}]+)\}/gm;
      while ((m = reExportRe.exec(content)) !== null) {
        m[1].split(',').forEach(name => {
          const alias = name.trim().split(/\s+as\s+/).pop()?.trim();
          if (alias) { exports.push(alias); }
        });
      }
      if (/^export\s+default\b/m.test(content)) { exports.push('default'); }

      const purpose = this.determinePurpose(filePath);

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
  private determinePurpose(filePath: string): string {
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
   * Find files similar to a given file path using embeddings when available,
   * falling back to purpose-matching when embeddings are absent.
   */
  async findSimilarByPath(filePath: string, limit = 5): Promise<FileEntry[]> {
    const relative = path.isAbsolute(filePath)
      ? path.relative(this.projectRoot, filePath)
      : filePath;
    const file = this.files.get(relative);
    if (!file) { return []; }

    if (file.embeddings && file.embeddings.length > 0) {
      return Array.from(this.files.values())
        .filter(f => f.path !== relative && f.embeddings && f.embeddings.length > 0)
        .map(f => ({ f, score: cosineSimilarity(file.embeddings!, f.embeddings!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ f }) => f);
    }

    // Fallback: same-purpose files
    return Array.from(this.files.values())
      .filter(f => f.purpose === file.purpose && f.path !== relative)
      .slice(0, limit);
  }

  /**
   * Find files most relevant to a free-text query (e.g. a /plan request).
   * Uses embedding similarity when available; falls back to token overlap.
   */
  async queryByText(query: string, limit = 5): Promise<FileEntry[]> {
    if (this.embeddingClient) {
      try {
        const queryVec = await this.embeddingClient.embed(query);

        // Score each file by its best-matching content chunk (if available),
        // falling back to export-list embedding
        const scored = Array.from(this.files.values()).map(f => {
          let score = 0;
          if (f.contentChunks && f.contentChunks.length > 0) {
            // Best chunk score for this file
            score = Math.max(...f.contentChunks.map(c => cosineSimilarity(queryVec, c.vec)));
          } else if (f.embeddings && f.embeddings.length > 0) {
            score = cosineSimilarity(queryVec, f.embeddings);
          }
          return { f, score };
        });

        const results = scored
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ f }) => f);

        if (results.length > 0) { return results; }
        // Fall through if nothing scored > 0
      } catch {
        // Fall through to keyword fallback
      }
    }

    // Fallback: score by token overlap between query tokens and path+exports
    const tokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    return Array.from(this.files.values())
      .map(f => {
        const haystack = (f.path + ' ' + f.exports.join(' ')).toLowerCase();
        const score = tokens.filter(t => haystack.includes(t)).length;
        return { f, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ f }) => f);
  }

  /**
   * Build a compact context string from a list of files for prompt injection.
   * Format: "path (purpose) — exports: foo, bar"
   */
  getMetadataContext(files: FileEntry[]): string {
    if (files.length === 0) { return ''; }
    return files
      .map(f => {
        const exports = f.exports.length ? `exports: ${f.exports.slice(0, 6).join(', ')}` : 'no exports';
        return `- ${f.path} (${f.purpose}) — ${exports}`;
      })
      .join('\n');
  }

  /**
   * Persist a lightweight metadata index (path → exports/purpose) to disk.
   * Used as a fast-startup fallback before embeddings finish loading.
   */
  saveMetadataIndex(indexPath: string): void {
    const index: Record<string, { purpose: string; exports: string[]; imports: string[] }> = {};
    this.files.forEach((entry, relPath) => {
      index[relPath] = { purpose: entry.purpose, exports: entry.exports, imports: entry.imports };
    });
    try {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    } catch {
      // Non-fatal — embeddings cache is the primary persistence
    }
  }

  /**
   * Load a previously saved metadata index into the files map.
   * Fills in purpose/exports/imports without requiring a full re-scan.
   */
  loadMetadataIndex(indexPath: string): boolean {
    try {
      const raw = fs.readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(raw) as Record<string, { purpose: string; exports: string[]; imports: string[] }>;
      Object.entries(index).forEach(([relPath, meta]) => {
        if (!this.files.has(relPath)) {
          this.files.set(relPath, {
            path: relPath,
            name: path.basename(relPath),
            purpose: meta.purpose,
            exports: meta.exports,
            imports: meta.imports,
            dependencies: [],
            patterns: [],
            lastUpdated: 0,
          });
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  /** @deprecated Use findSimilarByPath instead */
  async findSimilar(filePath: string, limit: number = 5): Promise<FileEntry[]> {
    return this.findSimilarByPath(filePath, limit);
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
  /** Optional embedding client — set once via setEmbeddingClient() after embedAll(). */
  private embeddingClient?: EmbeddingClient;
  /** Debounce timer for cache saves triggered by addFile(). */
  private saveCacheTimer?: ReturnType<typeof setTimeout>;
  /** Path to the on-disk embeddings cache file. */
  private cacheFilePath?: string;

  // ---- readiness tracking ----
  private _isReady = false;
  private _readyResolve!: () => void;
  /** Resolves once scan() + embedAll() have both completed. */
  readonly readyPromise: Promise<void> = new Promise<void>(resolve => { this._readyResolve = resolve; });

  /** True once embeddings are fully built and ready for semantic search. */
  get isReady(): boolean { return this._isReady; }

  /** True if any files have been indexed (from cache or live scan). Token-overlap RAG works at this point. */
  get hasIndex(): boolean { return this.files.size > 0; }

  /** Called by extension.ts after scan + embedAll complete. Resolves readyPromise. */
  markReady(): void {
    this._isReady = true;
    this._readyResolve?.();
  }

  /** Awaitable: resolves when the index is fully ready (scan + embedAll done). */
  async waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  setEmbeddingClient(client: EmbeddingClient): void {
    this.embeddingClient = client;
  }

  addFile(filePath: string, content: string): void {
    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      const imports: string[] = [];
      const exports: string[] = [];

      const importRe2 = /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
      let m2: RegExpExecArray | null;
      while ((m2 = importRe2.exec(content)) !== null) { imports.push(m2[1]); }

      const namedExportRe2 = /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gm;
      while ((m2 = namedExportRe2.exec(content)) !== null) { exports.push(m2[1]); }
      const reExportRe2 = /^export\s+\{([^}]+)\}/gm;
      while ((m2 = reExportRe2.exec(content)) !== null) {
        m2[1].split(',').forEach(name => {
          const alias = name.trim().split(/\s+as\s+/).pop()?.trim();
          if (alias) { exports.push(alias); }
        });
      }
      if (/^export\s+default\b/m.test(content)) { exports.push('default'); }

      const fileEntry: FileEntry = {
        path: relativePath,
        name: path.basename(filePath),
        purpose: this.determinePurpose(filePath),
        imports,
        exports,
        dependencies: [],
        patterns: this.detectFilePatterns({
          path: relativePath,
          name: path.basename(filePath),
          purpose: 'unknown',
          imports,
          exports,
          dependencies: [],
          patterns: [],
          lastUpdated: Date.now(),
        }),
        lastUpdated: Date.now(),
      };

      this.files.set(relativePath, fileEntry);
      this.extractDependencies();
      this.detectPatterns();

      // Fire-and-forget embed so resolveExportSource works immediately for this file
      if (this.embeddingClient && exports.length > 0) {
        const client = this.embeddingClient;
        const text = `exports: ${exports.join(', ')}  path: ${relativePath}`;
        client.embed(text).then(vec => {
          fileEntry.embeddings = vec;
          // Debounce cache save — flush 3s after the last addFile embed
          if (this.saveCacheTimer) { clearTimeout(this.saveCacheTimer); }
          this.saveCacheTimer = setTimeout(() => this.saveEmbeddingsCache(), 3000);
        }).catch(() => { /* Ollama unavailable — exact-match still works */ });
      }
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
  // RAG: embedding cache (persist vectors across restarts)
  // ============================================================

  /**
   * Load previously saved embeddings from disk into matching FileEntry objects.
   * Call before embedAll() — entries with embeddings already populated are skipped.
   *
   * @param cacheFile  Absolute path to the cache file (e.g. `<workspace>/.lla-embeddings.json`)
   * @param model      Model name; cache is ignored if it was built with a different model
   * @returns Number of entries restored from cache
   */
  loadEmbeddingsCache(cacheFile: string, model = 'nomic-embed-text'): number {
    this.cacheFilePath = cacheFile;
    try {
      const raw = this.fs.readFileSync(cacheFile, 'utf-8');
      const cache = JSON.parse(raw) as EmbeddingsCache;
      if (cache.model !== model) {
        console.log(`[CodebaseIndex] Cache model mismatch (${cache.model} vs ${model}), ignoring`);
        return 0;
      }
      let restored = 0;
      for (const entry of cache.files) {
        const fileEntry = this.files.get(entry.path);
        if (fileEntry && entry.embeddings.length > 0) {
          fileEntry.embeddings = entry.embeddings;
          if (entry.contentChunks && entry.contentChunks.length > 0) {
            fileEntry.contentChunks = entry.contentChunks;
          }
          restored++;
        }
      }
      console.log(`[CodebaseIndex] Restored ${restored} embeddings from cache (${cacheFile})`);
      return restored;
    } catch {
      return 0; // Cache missing or corrupt — embedAll() will regenerate
    }
  }

  /**
   * Persist current embeddings to disk.
   * Safe to call repeatedly — overwrites the previous cache.
   *
   * @param cacheFile  Absolute path to write (defaults to the path set by loadEmbeddingsCache)
   * @param model      Model name to tag the cache with
   */
  saveEmbeddingsCache(cacheFile?: string, model = 'nomic-embed-text'): void {
    const target = cacheFile ?? this.cacheFilePath;
    if (!target) return;
    const files = Array.from(this.files.values())
      .filter(e => e.embeddings && e.embeddings.length > 0)
      .map(e => ({
        path: e.path,
        embeddings: e.embeddings!,
        ...(e.contentChunks && e.contentChunks.length > 0 ? { contentChunks: e.contentChunks } : {}),
      }));
    const cache: EmbeddingsCache = { model, savedAt: Date.now(), files };
    try {
      this.fs.writeFileSync(target, JSON.stringify(cache));
      console.log(`[CodebaseIndex] Saved ${files.length} embeddings to cache`);
    } catch (err) {
      console.warn('[CodebaseIndex] Failed to save embeddings cache:', err);
    }
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
      // Export-list embedding (used by resolveExportSource / findSimilarByPath)
      if (!entry.embeddings || entry.embeddings.length === 0) {
        if (entry.exports.length > 0) {
          const text = `exports: ${entry.exports.join(', ')}  path: ${entry.path}`;
          try {
            entry.embeddings = await client.embed(text);
          } catch {
            // Ollama unavailable — skip
          }
        }
      }

      // Content chunk embeddings (used by queryByText for semantic search)
      if (!entry.contentChunks || entry.contentChunks.length === 0) {
        try {
          const absPath = path.join(this.projectRoot, entry.path);
          const content = this.fs.readFileSync(absPath, 'utf-8');
          const rawChunks = CodebaseIndex.chunkText(content, 512, 64);
          const chunks: ContentChunk[] = [];
          for (const { text: chunkText } of rawChunks) {
            try {
              const vec = await client.embed(chunkText);
              chunks.push({ text: chunkText, vec });
            } catch {
              break; // Ollama unavailable mid-file — stop embedding this file
            }
          }
          if (chunks.length > 0) {
            entry.contentChunks = chunks;
          }
        } catch {
          // File unreadable — skip content chunks
        }
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
