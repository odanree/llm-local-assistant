/**
 * PromptEngine: Heuristic RAG for Grounded Agent
 * 
 * Danh's "10/10 Perfect Run" fix: Instead of asking the 32B model to guess
 * how libraries work, we provide explicit reference samples and architectural
 * rules in the prompt itself.
 * 
 * This transforms the system from:
 *   "Generate code for cn.ts" → Model guesses → Hallucination risk
 * To:
 *   "Generate cn.ts using this reference → Model follows reference → 100% match
 * 
 * Strategy: Intercept prompt generation and hydrate with grounded knowledge.
 * Result: Model's attention mechanism prioritizes explicit text over fuzzy training.
 * 
 * Single Source of Truth: References come from src/constants/templates.ts
 * This prevents logic desync across Planner, Executor, PromptEngine, Validator.
 */

import { GOLDEN_TEMPLATES, TEMPLATE_METADATA } from '../constants/templates';

export interface PromptContext {
  filePath: string;
  fileDescription: string;
  basePrompt: string;
  projectContext?: Record<string, any>;
}

export interface HydratedPrompt {
  original: string;
  augmented: string;
  reference?: string;
  appliedRules: string[];
}

export class PromptEngine {
  /**
   * Grounded Knowledge Base: Reference samples for files with known patterns
   * 
   * Key insight: These aren't templates - they're explicit examples that the
   * model's attention mechanism will prioritize over its own fuzzy training data.
   */
  private static readonly REFERENCE_SAMPLES: Record<string, string> = {
    'cn.ts': `### MANDATORY REFERENCE FOR cn.ts (Single Source of Truth)

**Golden Template (From src/constants/templates.ts):**
\`\`\`typescript
${GOLDEN_TEMPLATES.CN_UTILITY}
\`\`\`

**Critical Points (Do NOT deviate):**
${TEMPLATE_METADATA.CN_UTILITY.criticalPoints.map(p => `- ${p}`).join('\n')}

**Common Hallucinations (AVOID):**
${TEMPLATE_METADATA.CN_UTILITY.commonHallucinations.map(h => `- ${h}`).join('\n')}

**Why This Matters:**
This exact pattern is used by Executor, Validator, and Planner.
Any deviation causes logic desync.
Follow this reference EXACTLY.`,

    'constants.ts': `### MANDATORY REFERENCE FOR constants.ts

**Pattern for API Constants:**
\`\`\`typescript
// Use process.env for dynamic values, defaults for safety
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';
export const API_TIMEOUT = 30000; // milliseconds
export const API_RETRY_ATTEMPTS = 3;

// Use 'as const' for type safety with enums
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;
\`\`\`

**Key Points:**
- Use environment variables for configuration
- Provide sensible defaults
- Use 'as const' for immutable object types
- Real HTTP status codes (not made-up)`,

    'Button.tsx': `### MANDATORY REFERENCE FOR Button.tsx

**Pattern for React Button Components:**
\`\`\`typescript
import React from 'react';
import { cn } from '@/utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium',
          // Variant styles
          variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
          variant === 'secondary' && 'bg-gray-200 text-gray-900 hover:bg-gray-300',
          variant === 'ghost' && 'bg-transparent text-gray-900 hover:bg-gray-100',
          // Size styles
          size === 'sm' && 'px-3 py-1 text-sm',
          size === 'md' && 'px-4 py-2 text-base',
          size === 'lg' && 'px-6 py-3 text-lg',
          // State styles
          isLoading && 'opacity-60 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {isLoading ? 'Loading...' : props.children}
      </button>
    );
  }
);

Button.displayName = 'Button';
\`\`\`

**Key Points:**
- Use interface for props (not Zod at component level)
- Extend React.ButtonHTMLAttributes for HTML compatibility
- Use forwardRef for ref forwarding
- Always accept className and use cn() utility
- Use variant and size for styling patterns
- Default button type is 'button' (not 'submit')`,

    'useQuery.ts': `### MANDATORY REFERENCE FOR useQuery.ts

**Pattern for Custom React Query Hook:**
\`\`\`typescript
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export interface UseQueryParams<TData> {
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  options?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>;
}

export function useCustomQuery<TData>({
  queryKey,
  queryFn,
  options,
}: UseQueryParams<TData>) {
  return useQuery<TData>({
    queryKey,
    queryFn,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    ...options,
  });
}
\`\`\`

**Key Points:**
- Import from @tanstack/react-query (not react-query)
- Use generic TData for type safety
- Use UseQueryOptions for extensibility
- Always provide sensible defaults (staleTime, gcTime, retry)
- Use 'Omit' to prevent option conflicts`,
  };

  /**
   * Architectural rules that apply across all files
   * These are prepended to every prompt to ensure consistency
   */
  private static readonly ARCHITECTURAL_RULES = `### ARCHITECTURAL RULES (Apply to all code generation)

1. **Import Correctness**
   - Named imports: import { name } from 'lib'
   - Named imports with types: import { name, type Type } from 'lib'
   - NOT default imports unless explicitly documented
   - Verify library names in package.json (not made-up variants)

2. **Type Safety**
   - Use interface for component props
   - Use type for union types and type aliases
   - Import types with 'import type { Type }'
   - Always specify generic types explicitly

3. **React Patterns**
   - Use React.forwardRef for ref forwarding
   - Always set displayName on forwardRef components
   - Use React.HTMLAttributes extensions for semantic HTML
   - Never make up HTML attribute names

4. **Utility Functions**
   - Use cn() from @/utils/cn for class merging
   - Never import or call classnames/clsx directly in components
   - Always pass className to cn() when accepting it as prop

5. **File Organization**
   - Keep exports clean (one default or multiple named)
   - Group related imports at top
   - Use consistent naming conventions
   - Export types alongside implementations`;

  /**
   * Hydrate a prompt with grounded references and architectural rules
   * 
   * This is the core RAG logic: We intercept the prompt and add explicit
   * reference samples that the model's attention mechanism will prioritize.
   */
  public static hydratePrompt(context: PromptContext): HydratedPrompt {
    const appliedRules: string[] = [];
    let augmentedPrompt = context.basePrompt;

    // Step 1: Always prepend architectural rules
    augmentedPrompt = `${PromptEngine.ARCHITECTURAL_RULES}

---

${augmentedPrompt}`;
    appliedRules.push('architectural-rules');

    // Step 2: Check for file-specific reference samples
    const fileName = context.filePath.split('/').pop() || '';
    let reference: string | undefined;

    if (PromptEngine.REFERENCE_SAMPLES[fileName]) {
      reference = PromptEngine.REFERENCE_SAMPLES[fileName];
      augmentedPrompt = `${reference}

---

${augmentedPrompt}`;
      appliedRules.push(`reference-sample-${fileName}`);
    }

    // Step 3: Add context-specific hints
    if (context.fileDescription) {
      const contextHint = PromptEngine.buildContextHint(context.fileDescription);
      if (contextHint) {
        augmentedPrompt = `${augmentedPrompt}

---

${contextHint}`;
        appliedRules.push('context-hint');
      }
    }

    return {
      original: context.basePrompt,
      augmented: augmentedPrompt,
      reference,
      appliedRules,
    };
  }

  /**
   * Build context-specific hints based on the file description
   * This adds domain knowledge to guide the model
   */
  private static buildContextHint(description: string): string | null {
    const desc = description.toLowerCase();

    // Utility file hints
    if (desc.includes('utility') || desc.includes('helper') || desc.includes('utils')) {
      return `### CONTEXT HINT: Utility File
This file exports reusable utility functions.
- Keep functions pure (no side effects)
- Use generics for flexibility
- Provide clear type signatures
- Document with JSDoc comments`;
    }

    // Component hints
    if (desc.includes('component') || desc.includes('button') || desc.includes('input')) {
      return `### CONTEXT HINT: React Component
This file exports a React component.
- Accept className prop
- Use cn() for class merging
- Provide TypeScript props interface
- Use forwardRef if accepting ref prop
- Set displayName for debugging`;
    }

    // Hook hints
    if (desc.includes('hook') || desc.includes('use')) {
      return `### CONTEXT HINT: React Hook
This file exports a custom React hook.
- Start function name with 'use'
- Call other hooks at top level
- Return consistent data structure
- Document dependencies in JSDoc`;
    }

    // Config hints
    if (desc.includes('config') || desc.includes('constant') || desc.includes('env')) {
      return `### CONTEXT HINT: Configuration File
This file exports constants and configuration.
- Use environment variables for dynamic values
- Provide sensible defaults
- Use 'as const' for immutable objects
- Document what each constant is for`;
    }

    return null;
  }

  /**
   * Get the reference sample for a specific file (for debugging/inspection)
   */
  public static getReference(fileName: string): string | null {
    return PromptEngine.REFERENCE_SAMPLES[fileName] || null;
  }

  /**
   * List all available reference samples
   */
  public static listReferences(): string[] {
    return Object.keys(PromptEngine.REFERENCE_SAMPLES);
  }

  /**
   * Add a custom reference sample (for extensibility)
   */
  public static registerReference(fileName: string, reference: string): void {
    PromptEngine.REFERENCE_SAMPLES[fileName] = reference;
  }
}

/**
 * Export a simple helper for common use case
 */
export function hydratePrompt(
  filePath: string,
  basePrompt: string,
  description?: string
): string {
  return PromptEngine.hydratePrompt({
    filePath,
    fileDescription: description || '',
    basePrompt,
  }).augmented;
}
