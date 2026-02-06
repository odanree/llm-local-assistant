import * as vscode from 'vscode';

export interface VectorDBEntry {
  file: string;
  filePath: vscode.Uri;
  excerpt: string;
  embedding: number[];
  score?: number;
}

/**
 * Vector Database for semantic code search
 * Disabled in this phase due to bundling constraints
 * Will be re-enabled in Phase 3.2.1 with proper build config
 *
 * This is a stub implementation for now
 */
export class VectorDB {
  private initialized: boolean = false;
  private entries: VectorDBEntry[] = [];

  async initialize(): Promise<void> {
    console.warn('[VectorDB] Vector search is disabled in this build');
    this.initialized = false;
  }

  async indexWorkspace(): Promise<void> {
    console.warn('[VectorDB] Vector search is disabled in this build');
  }

  async search(query: string, topK: number = 3): Promise<VectorDBEntry[]> {
    return [];
  }

  isReady(): boolean {
    return false;
  }

  getStats(): { filesIndexed: number; embeddingsCount: number } {
    return { filesIndexed: 0, embeddingsCount: 0 };
  }
}

// Global instance
let vectorDBInstance: VectorDB | null = null;

/**
 * Get or create the global vector DB instance
 */
export function getVectorDB(): VectorDB {
  if (!vectorDBInstance) {
    vectorDBInstance = new VectorDB();
  }
  return vectorDBInstance;
}
