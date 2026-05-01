/**
 * executor-step-utils.ts
 *
 * Pure step/plan utility helpers extracted from Executor.
 * No instance state, no vscode APIs, no side effects beyond console.log.
 *
 * Extracted from executor.ts as Phase 4 of the executor decomposition.
 */

import { PlanStep } from './planner';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Return the base filename (no extension) from a relative or absolute file path.
 */
export function getFileBaseName(filePath: string): string {
  const withoutExt = filePath.replace(/\.[^.]+$/, '');
  const parts = withoutExt.split('/');
  return parts[parts.length - 1];
}

/**
 * Strip common LLM path artifacts: trailing ellipses, accidental quotes/backticks,
 * trailing commas/semicolons, and placeholder /path/to/ prefixes.
 */
export function sanitizePath(path: string): string {
  if (!path || typeof path !== 'string') { return path; }

  // Remove trailing ellipses
  let cleaned = path.replace(/\.{2,}$/, '');

  // Remove accidental quotes and backticks
  cleaned = cleaned.replace(/^[`'"]|[`'"]$/g, '');

  // Remove trailing commas and semicolons
  cleaned = cleaned.replace(/[,;]$/, '');

  // Normalize placeholder paths: /path/to/filename.tsx → src/filename.tsx
  cleaned = cleaned.replace(/^\/path\/to\//, 'src/');

  // Trim whitespace
  cleaned = cleaned.trim();

  if (cleaned !== path) {
    console.log(`[Executor] Path sanitized: "${path}" → "${cleaned}"`);
  }

  return cleaned;
}

/**
 * Calculate a relative TypeScript import statement between two source file paths.
 * Returns null if the paths cannot be resolved.
 */
export function calculateImportStatement(sourcePath: string, targetPath: string): string | null {
  try {
    // Get directories
    const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    const targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    const targetFileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);

    // Remove extension for import (import useLoginFormStore from '...', not '.ts')
    const importName = targetFileName.replace(/\.(ts|tsx|js|jsx)$/, '');

    // Calculate relative path
    const sourceParts = sourceDir.split('/').filter(p => p);
    const targetParts = targetDir.split('/').filter(p => p);

    // Find common prefix length
    let commonLength = 0;
    for (let i = 0; i < Math.min(sourceParts.length, targetParts.length); i++) {
      if (sourceParts[i] === targetParts[i]) {
        commonLength = i + 1;
      } else {
        break;
      }
    }

    // Calculate up path (..)
    const upCount = sourceParts.length - commonLength;
    const upPath = upCount > 0 ? '../'.repeat(upCount) : './';

    // Calculate down path
    const downPath = targetParts.slice(commonLength).join('/');

    // Combine to get relative path
    let relativePath: string;
    if (downPath) {
      relativePath = upPath + downPath + '/' + importName;
    } else {
      relativePath = upPath + importName;
    }

    // Detect if it's a Zustand store (starts with 'use' and ends with 'Store')
    const isZustandStore = importName.startsWith('use') && importName.endsWith('Store');

    // Generate import statement
    if (isZustandStore) {
      return `import { ${importName} } from '${relativePath}';`;
    }

    // For utilities and helpers, use named imports
    if (targetFileName === 'cn.ts' || targetFileName === 'cn.js') {
      return `import { cn } from '${relativePath}';`;
    }

    // Schema files export the TypeScript type (e.g. User) — inject ONLY the type in REQUIRED
    // IMPORTS. The schema instance (userSchema) is for validation, which coordinator components
    // should NOT be doing — they compose sub-components. Importing it unused triggers lint errors.
    // If runtime validation is genuinely needed, the LLM can add it manually.
    const isSchemaFile = /[Ss]chema$|[Vv]alidation$/.test(importName);
    if (isSchemaFile) {
      const entityRaw = importName.replace(/[Ss]chema$/, '').replace(/[Vv]alidation$/, '');
      const typeName = entityRaw.charAt(0).toUpperCase() + entityRaw.slice(1);
      return `import { ${typeName} } from '${relativePath}'; // ${typeName} is the TypeScript type — import from here, NOT from src/types/`;
    }

    // Default: assume named export with same name as file
    return `import { ${importName} } from '${relativePath}';`;
  } catch (error) {
    console.warn(`[Executor] Failed to calculate import for ${targetPath}: ${error}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step comparison / plan ordering
// ---------------------------------------------------------------------------

/**
 * Check whether two PlanStep arrays are equal by stepId and path (for logging).
 */
export function stepsAreEqual(steps1: PlanStep[], steps2: PlanStep[]): boolean {
  if (steps1.length !== steps2.length) { return false; }
  return steps1.every((s, i) => s.stepId === steps2[i].stepId && s.path === steps2[i].path);
}

/**
 * Topological sort of write steps by declared and inferred dependencies.
 *
 * Three passes:
 *  1. Use planner-declared `dependsOn` edges (structural, most reliable)
 *  2. Text-analysis fallback — basename mentions in descriptions
 *  3. Path-based structural priorities (routes → nav → layout → components → App)
 *
 * Non-write steps are preserved in their original interleaved positions.
 * Returns original order on cycle detection.
 */
export function reorderStepsByDependencies(steps: PlanStep[]): PlanStep[] {
  // Only reorder WRITE steps (READ/DELETE don't create dependencies)
  const writeSteps = steps.filter(s => s.action === 'write');
  const nonWriteSteps = steps.filter(s => s.action !== 'write');

  if (writeSteps.length <= 1) {
    return steps; // No reordering needed
  }

  // Build dependency map: for each write step, what other write steps does it depend on?
  const dependencies = new Map<number, Set<number>>();
  writeSteps.forEach((_, idx) => { dependencies.set(idx, new Set()); });

  // Build an id→index lookup for dependsOn resolution
  const stepIdToWriteIdx = new Map<string, number>();
  writeSteps.forEach((step, idx) => {
    if (step.id) { stepIdToWriteIdx.set(step.id, idx); }
  });

  // Pass 1: Use planner-declared dependsOn (structural, not linguistic — always preferred)
  writeSteps.forEach((step, currentIdx) => {
    if (step.dependsOn && step.dependsOn.length > 0) {
      for (const depId of step.dependsOn) {
        const depWriteIdx = stepIdToWriteIdx.get(depId);
        if (depWriteIdx !== undefined && depWriteIdx !== currentIdx) {
          dependencies.get(currentIdx)?.add(depWriteIdx);
        }
      }
    }
  });

  // Pass 2: Text analysis fallback — runs for steps that declared no dependsOn, OR
  // for steps whose dependsOn refs all pointed to non-WRITE steps (READ/RUN) and therefore
  // produced zero write-step edges in Pass 1. Without this, steps like Layout.tsx that
  // declare `dependsOn: ["step_1_READ"]` get zero edges and sort before Routes.ts.
  writeSteps.forEach((step, currentIdx) => {
    const hasWriteEdges = (dependencies.get(currentIdx)?.size ?? 0) > 0;
    if (step.dependsOn && step.dependsOn.length > 0 && hasWriteEdges) {
      return; // planner declared write-step dependencies — trust them, skip text analysis
    }

    const pathLower = (step.path || '').toLowerCase();
    const descLower = (step.description || '').toLowerCase();
    const fullText = `${pathLower} ${descLower}`;

    // Guard: schema/validation .ts files must never be ordered AFTER component .tsx files.
    // Schema descriptions often reference the coordinator component (e.g. "for user profile
    // data received by the UserProfile component"), making the schema look like it depends on
    // the coordinator. This inverted edge sorts schema last, breaking field-fidelity.
    const currentIsSchema = /[\\/]schemas?[\\/]|[\\/]validat|[Ss]chema\.[tj]s$|[Vv]alidation\.[tj]s$/.test(step.path || '');

    writeSteps.forEach((otherStep, otherIdx) => {
      if (currentIdx === otherIdx) { return; }
      const basename = getFileBaseName((otherStep.path || '').toLowerCase());
      // Filename appears anywhere in the description → likely a dependency
      if (basename && new RegExp(`\\b${basename}\\b`, 'i').test(fullText)) {
        // Skip inverted schema→component edge: schema files precede components, never follow.
        const otherIsComponent = (otherStep.path || '').endsWith('.tsx');
        if (currentIsSchema && otherIsComponent) { return; }
        dependencies.get(currentIdx)?.add(otherIdx);
      }
      // Store → component heuristic (layout-independent of vocabulary)
      const otherPathLower = (otherStep.path || '').toLowerCase();
      if (
        otherPathLower.includes('store') && !pathLower.includes('store') &&
        (pathLower.includes('component') || pathLower.includes('form'))
      ) {
        dependencies.get(currentIdx)?.add(otherIdx);
      }
    });
  });

  // Pass 3: Path-based structural ordering — description-independent.
  // Vague step descriptions (e.g. "Extract Layout component") don't mention their
  // dependency on Routes.ts, so Pass 2 text analysis misses the edge. This pass
  // enforces well-known decomposition conventions based purely on file path patterns:
  //   routes/       → priority 0 (config, no local imports)
  //   navigation/navbar/nav/sidebar → priority 1 (imports routes)
  //   layout        → priority 2 (imports Navigation + routes)
  //   other components/pages → priority 3
  //   App.tsx       → priority 4 (root, imports everything)
  const getStructuralPriority = (path: string): number => {
    const p = (path || '').toLowerCase();
    // Schema/validation .ts files are pure type/config — no component imports, come first.
    if (/[\\/]schemas?[\\/]|[\\/]validat[\\/]|schema\.[tj]s$|validation\.[tj]s$/i.test(p)) { return 0; }
    if (/[\\/]routes?[\\/]|[\\/]routes?\.[tj]s$|routes?\.ts$/i.test(p)) { return 0; }
    if (/[\\/](navigation|navbar|nav|sidebar)\.[tj]sx?$/i.test(p)) { return 1; }
    if (/[\\/]layout\.[tj]sx?$/i.test(p)) { return 2; }
    if (/(?:^|[\\/])app\.[tj]sx?$/i.test(p)) { return 4; }
    return 3;
  };
  writeSteps.forEach((step, currentIdx) => {
    const myPriority = getStructuralPriority(step.path || '');
    writeSteps.forEach((otherStep, otherIdx) => {
      if (currentIdx === otherIdx) { return; }
      const otherPriority = getStructuralPriority(otherStep.path || '');
      if (otherPriority < myPriority) {
        // otherStep has a lower priority number → it must come before this step
        dependencies.get(currentIdx)?.add(otherIdx);
      }
    });
  });

  // Topological sort: Kahn's algorithm
  // inDegree[i] = number of prerequisites step i has (steps that must run before it)
  const inDegree = new Map<number, number>();
  writeSteps.forEach((_, idx) => { inDegree.set(idx, dependencies.get(idx)?.size ?? 0); });

  // Build reverse map: dependents[i] = set of steps that depend on step i
  const dependents = new Map<number, Set<number>>();
  writeSteps.forEach((_, idx) => { dependents.set(idx, new Set()); });
  dependencies.forEach((deps, idx) => {
    deps.forEach(prereq => { dependents.get(prereq)?.add(idx); });
  });

  const queue: number[] = [];
  inDegree.forEach((degree, idx) => {
    if (degree === 0) { queue.push(idx); }
  });

  const sorted: number[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    // Decrement in-degree for everything that depended on current
    dependents.get(current)?.forEach(dep => {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
      if (inDegree.get(dep) === 0) {
        queue.push(dep);
      }
    });
  }

  // If we couldn't sort all (cycle detected), return original order
  if (sorted.length !== writeSteps.length) {
    console.warn('[Executor] Circular dependency detected in plan steps, keeping original order');
    return steps;
  }

  // Rebuild: [sorted writes] + [non-writes in original positions where possible]
  const result: PlanStep[] = [];
  const sortedWriteSteps = sorted.map(idx => writeSteps[idx]);
  const writeIndices = new Set(steps.map((s, i) => s.action === 'write' ? i : -1).filter(i => i >= 0));

  let writeIdx = 0;
  for (let i = 0; i < steps.length; i++) {
    if (writeIndices.has(i)) {
      result.push(sortedWriteSteps[writeIdx++]);
    } else {
      result.push(steps[i]);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step validation / pre-flight guards
// ---------------------------------------------------------------------------

/**
 * Validate that step dependencies are satisfied before execution.
 * Throws DEPENDENCY_VIOLATION if a required predecessor hasn't completed.
 */
export function validateDependencies(
  step: PlanStep,
  completedStepIds: Set<string>,
  planStepIds?: Set<string>,
  planStepOrder?: string[]
): void {
  // Only validate if step has dependencies
  if (!step.dependsOn || step.dependsOn.length === 0) { return; }

  const currentIndex = planStepOrder ? planStepOrder.indexOf(step.id ?? '') : -1;

  // Check each dependency
  for (const depId of step.dependsOn) {
    // Skip dependencies that were filtered out of the plan before execution.
    // stripStaleDependencies in the planner should remove these, but this is the
    // executor-side safety net for any that slip through.
    if (planStepIds && !planStepIds.has(depId)) {
      console.log(`[Executor] Skipping stale dep "${depId}" on step "${step.id}" — not in current plan`);
      continue;
    }
    if (!completedStepIds.has(depId)) {
      // If we know the plan order, check whether the dep precedes this step.
      // If the dep appears AFTER this step in plan order, the topo sort failed —
      // warn and skip rather than aborting the whole plan.
      if (planStepOrder && currentIndex >= 0) {
        const depIndex = planStepOrder.indexOf(depId);
        if (depIndex > currentIndex) {
          console.warn(`[Executor] Dep "${depId}" appears after "${step.id}" in plan order — topo sort anomaly, skipping`);
          continue;
        }
      }
      throw new Error(
        `DEPENDENCY_VIOLATION: Step "${step.id}" depends on "${depId}" which hasn't been completed yet. ` +
        `Steps must be executed in dependency order. ` +
        `Check that all dependencies are satisfied before this step.`
      );
    }
  }
}

/**
 * Pre-flight checks applied before any step executes.
 * Throws on greenfield READ violations and malformed paths.
 */
export function preFlightCheck(step: PlanStep, workspaceExists: boolean): void {
  // ✅ GREENFIELD GUARD: No READ on empty workspace without prior WRITE
  if (!workspaceExists && step.action === 'read') {
    throw new Error(
      `GREENFIELD_VIOLATION: Cannot READ from "${step.path}" in empty workspace. ` +
      `First step must WRITE or INIT files. Are you missing a WRITE step?`
    );
  }

  // ✅ FIX 1: STRICT "NO-SPACE" RULE (Danh's Senior Fix)
  // Multiple spaces indicate sentence/description, not a valid path
  if (step.path) {
    const spaceCount = (step.path.match(/ /g) || []).length;
    if (spaceCount > 1) {
      throw new Error(
        `PATH_VIOLATION: Path "${step.path}" contains ${spaceCount} spaces. ` +
        `This looks like a sentence, not a file path. ` +
        `Use kebab-case or camelCase instead: src/components/my-component.tsx`
      );
    }
  }

  // ✅ FIX 2: STRICT EXTENSION REQUIREMENT (Danh's Senior Fix)
  // Web project paths MUST have file extensions
  if (step.path && !step.path.includes('.')) {
    throw new Error(
      `PATH_VIOLATION: Path "${step.path}" has no file extension. ` +
      `Web project paths MUST include extension (.tsx, .ts, .js, .json, etc.).`
    );
  }

  // ✅ PATH VIOLATION: Paths with ellipses are malformed
  if (step.path && step.path.includes('...')) {
    throw new Error(
      `PATH_VIOLATION: Step path contains ellipses "...": "${step.path}". ` +
      `Provide complete filename. Remove trailing prose.`
    );
  }

  // ✅ ACTION MISMATCH: If path looks like a description, reject READ
  if (step.action === 'read' && step.path && step.path.length > 80) {
    throw new Error(
      `ACTION_MISMATCH: READ action path looks like a description (too long): "${step.path.substring(0, 60)}...". ` +
      `Provide a valid file path, not a description.`
    );
  }
}

/**
 * Validate step contract: detect hallucinated "manual" values and missing required fields.
 * May mutate step.command to '' to redirect manual-verification commands to the skip path.
 * Throws CONTRACT_VIOLATION on fatal issues.
 */
export function validateStepContract(step: PlanStep): void {
  // Check for "manual" hallucination in path
  if (step.path && typeof step.path === 'string') {
    if (step.path.toLowerCase().includes('manual')) {
      throw new Error(
        `CONTRACT_VIOLATION: Step "${step.description}" has path="${step.path}". ` +
        `Manual verification is not a valid executor action. ` +
        `Use action='manual' instead, or describe verification in summary.`
      );
    }
  }

  // Check for "manual" hallucination in command — clear the command so the step falls through
  // to the isManualVerification skip in executeStep rather than throwing a fatal error.
  if ((step as any).command && typeof (step as any).command === 'string') {
    if (/^manual\s*(verification|verify|test)/i.test(((step as any).command as string).trim())) {
      // Nullify the command so executeStep's isEmptyRunStep check will catch it as human verification
      (step as any).command = '';
    }
  }

  // Check for missing path on file-based actions
  if (['read', 'write', 'delete'].includes(step.action)) {
    if (!step.path || step.path.trim().length === 0) {
      throw new Error(
        `CONTRACT_VIOLATION: Action '${step.action}' requires a valid file path, but none was provided. ` +
        `Step: "${step.description}"`
      );
    }
  }

  // Contract validated — no error thrown
}

/**
 * When a READ step fails with ENOENT, suggest an alternative action.
 * Returns a recovery hint or null when no strategy is applicable.
 */
export function attemptStrategySwitch(
  step: PlanStep,
  error: string
): { message: string; suggestedAction: string; suggestedPath?: string } | null {
  // Only handle file not found errors
  if (!error.includes('ENOENT') && !error.includes('not found')) { return null; }

  // Heuristic: If trying to read a config file that doesn't exist, suggest init
  const configPatterns = ['tsconfig', 'package.json', '.eslintrc', 'jest.config', 'babel.config'];
  const isConfigFile = configPatterns.some(pattern => step.path?.includes(pattern));

  if (isConfigFile) {
    return {
      message: `Config file "${step.path}" doesn't exist. Would you like to WRITE it?`,
      suggestedAction: 'write',
      suggestedPath: step.path,
    };
  }

  // Source files: do NOT convert READ→WRITE. A READ step targeting a source file
  // that doesn't exist means the planner generated a wrong path. Converting it to a
  // WRITE step creates a hallucinated dependency file from scratch, which then causes
  // TS errors in the integration check. The correct behaviour is to skip the READ
  // step and let the plan continue (the WRITE step for the real output file still runs).

  // Can't determine recovery strategy
  return null;
}

// ---------------------------------------------------------------------------
// Risk assessment
// ---------------------------------------------------------------------------

/**
 * Returns true when the file path matches a pattern that warrants write confirmation
 * (config files, CI/CD, lock files, environment files, etc.).
 */
export function shouldAskForWrite(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';

  // Files that warrant confirmation
  const riskPatterns = [
    // Core config files
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /tsconfig\.json$/,
    /jsconfig\.json$/,

    // Build configs
    /webpack\.config/,
    /vite\.config/,
    /rollup\.config/,
    /next\.config/,
    /nuxt\.config/,
    /gatsby\.config/,

    // Linter/Formatter configs
    /\.eslintrc/,
    /\.prettierrc/,
    /\.stylelintrc/,
    /\.editorconfig/,

    // CI/CD configs
    /\.github\/workflows\//,
    /\.gitlab-ci\.yml/,
    /\.travis\.yml/,
    /Jenkinsfile/,

    // Environment and secrets
    /\.env/,
    /\.secrets/,
    /credentials/,

    // Critical data files
    /database\.json/,
    /config\.json/,
    /settings\.json/,
    /\.gitignore$/,
    /\.dockerignore$/,
    /Dockerfile$/,
    /docker-compose\.ya?ml$/,

    // Root-level files that are typically important
    /^README\.md$/,
    /^LICENSE$/,
    /^Makefile$/,
  ];

  // Check if file matches any risk pattern
  return riskPatterns.some(pattern => pattern.test(fileName));
}

// ---------------------------------------------------------------------------
// stderr classification
// ---------------------------------------------------------------------------

/**
 * Classify a stderr chunk as a warning (non-fatal) or an error (fatal).
 * Returns the cleaned message text and whether it is non-blocking.
 */
export function classifyStderr(data: any): { isWarning: boolean; message: string } {
  // 1. TYPE GUARD: Ensure we have a string
  // This is the key fix for preventing {} serialization
  let message: string;
  if (typeof data === 'string') {
    message = data;
  } else if (data?.chunk) {
    message = String(data.chunk);
  } else if (data?.message) {
    message = String(data.message);
  } else if (typeof data === 'object') {
    // Don't stringify - return empty to skip this chunk
    return { isWarning: true, message: '' };
  } else {
    message = String(data);
  }

  // 2. NULL FILTER: Skip empty messages to prevent blank lines and {}
  if (!message || message.trim() === '' || message === '{}') {
    return { isWarning: true, message: '' };
  }

  // 3. REGEX PATTERNS: Comprehensive warning detection
  const warningPatterns = [
    /^npm\s+(warn|notice|deprecated)/i,  // npm WARN, npm notice, npm deprecated
    /deprecated/i,
    /vulnerabilities/i,
    /looking for funding/i,               // npm funding message
    /peer\s?dependency/i,
    /optional\s+dependency/i,
    /will\s+not\s+be\s+installed/i,
    /(\d+)\s+(moderate|low|high)\s+severity/i,  // Audit summary
    /run\s+`npm\s+audit\s+fix`/i,         // Audit fix suggestion
    /WARN/i,
  ];

  // Check if this is a known non-fatal warning
  const isWarning = warningPatterns.some(pattern => pattern.test(message));

  // Clean up the message
  const cleanMessage = message
    .replace(/^\s*[❌✔️⚠️]+\s*/, '')  // Remove emoji prefix
    .replace(/^Error:\s*/i, '')        // Remove 'Error:' prefix
    .trim();

  return { isWarning, message: cleanMessage };
}
