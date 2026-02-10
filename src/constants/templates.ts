/**
 * GOLDEN TEMPLATES - Single Source of Truth
 * 
 * This is the authoritative definition of proven, working code patterns.
 * All components (Planner, PromptEngine, Executor, Validator) reference this.
 * 
 * Problem Solved:
 * - Before: cn.ts defined in 4 different places → logic desync
 * - After: One definition → consistency guaranteed
 * 
 * Usage:
 * - Executor: Force-write when needed
 * - PromptEngine: Inject into system prompt
 * - Validator: Check for required features
 * - Planner: Calculate expected outcome
 */

export const GOLDEN_TEMPLATES = {
  CN_UTILITY: `import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};`,
};

/**
 * TEMPLATE FEATURES - What each template guarantees
 * Used by Validator to check for required patterns instead of string matching
 */
export const TEMPLATE_FEATURES = {
  CN_UTILITY: {
    name: 'cn',
    imports: [
      { name: 'twMerge', from: 'tailwind-merge', type: 'named' },
      { name: 'clsx', from: 'clsx', type: 'named' },
      { name: 'ClassValue', from: 'clsx', type: 'type' },
    ],
    exports: [
      { name: 'cn', type: 'const', pattern: 'export const cn' },
    ],
    patterns: [
      'arrow function syntax',
      'ClassValue[] parameter',
      'twMerge wrapping clsx',
    ],
  },
};

/**
 * Template Metadata - For logging and diagnostics
 */
export const TEMPLATE_METADATA = {
  CN_UTILITY: {
    fileName: 'cn.ts',
    description: 'Tailwind class name merger with conflict resolution',
    criticalPoints: [
      'Named import from clsx (NOT default)',
      'twMerge wraps clsx',
      'Arrow function (const = () =>)',
      'ClassValue type import',
    ],
    commonHallucinations: [
      'import clsx from "clsx"',
      'import clsx from "classnames"',
      'import twMerge from "tailwind-merge"',
      'function cn() {} (not arrow)',
      'export function cn()',
    ],
  },
};
