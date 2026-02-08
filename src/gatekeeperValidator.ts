// GATEKEEPER VALIDATION with Iteration Limit and Correction Tracking
// This replaces the simple validation loop with a smarter system

export interface ValidationIteration {
  attempt: number;
  errors: string[];
  content: string;
  corrected: boolean;
  timestamp: number;
}

export interface GatekeeperState {
  maxIterations: number;
  iterations: ValidationIteration[];
  isCorrecting: boolean;
  lastCorrectionAttempt?: number;
}

/**
 * GATEKEEPER: Intelligent code validation with iteration limit
 * 
 * Problem (Phase 3.1): Infinite validation loop
 * - Remove unused import → code valid
 * - Re-validate → detects import missing somewhere else  
 * - Add import back → loop repeats
 * 
 * Solution:
 * 1. Track all corrections made in current iteration
 * 2. Detect repeated corrections (same fix applied twice = loop detected)
 * 3. Max iteration limit (default: 3 attempts max)
 * 4. Better heuristics for React hooks
 * 5. Log all corrections for debugging
 */
class GatekeeperValidator {
  private maxIterations: number = 3;
  private iterationHistory: ValidationIteration[] = [];
  
  /**
   * Validate code with automatic correction up to max iterations
   * @param code The code to validate
   * @param filePath Path to file (for context)
   * @param fileExtension File extension (for context)
   * @returns { finalContent, validationPassed, iterations }
   */
  async validateAndFix(
    code: string,
    llmClient: any,
    filePath: string,
    fileExtension: string
  ): Promise<{
    finalContent: string;
    validationPassed: boolean;
    iterations: ValidationIteration[];
    loopDetected: boolean;
  }> {
    this.iterationHistory = [];
    let currentContent = code;
    let validationErrors: string[] = [];
    let loopDetected = false;
    
    for (let attempt = 1; attempt <= this.maxIterations; attempt++) {
      console.log(`[Gatekeeper] Validation attempt ${attempt}/${this.maxIterations}`);
      
      // Run validation checks
      validationErrors = this.validateCode(currentContent, filePath, fileExtension);
      
      // Track iteration
      const iteration: ValidationIteration = {
        attempt,
        errors: [...validationErrors],
        content: currentContent,
        corrected: attempt > 1,
        timestamp: Date.now()
      };
      this.iterationHistory.push(iteration);
      
      // If no errors, we're done
      if (validationErrors.length === 0) {
        console.log(`[Gatekeeper] ✅ Validation passed on attempt ${attempt}`);
        return {
          finalContent: currentContent,
          validationPassed: true,
          iterations: this.iterationHistory,
          loopDetected: false
        };
      }
      
      // If last attempt, give up
      if (attempt === this.maxIterations) {
        console.log(`[Gatekeeper] ❌ Max iterations (${this.maxIterations}) reached - validation still failing`);
        console.log(`[Gatekeeper] Final errors: ${validationErrors.join('\n')}`);
        return {
          finalContent: currentContent,
          validationPassed: false,
          iterations: this.iterationHistory,
          loopDetected: false
        };
      }
      
      // LOOP DETECTION: Check if we're applying the same fix repeatedly
      if (attempt > 1) {
        const loopInfo = this.detectValidationLoop(this.iterationHistory);
        if (loopInfo.isLooping) {
          console.log(`[Gatekeeper] 🔄 LOOP DETECTED: ${loopInfo.reason}`);
          console.log(`[Gatekeeper] Pattern: ${loopInfo.repeatingFix}`);
          loopDetected = true;
          
          // Instead of trying again, return what we have and report the issue
          return {
            finalContent: currentContent,
            validationPassed: false,
            iterations: this.iterationHistory,
            loopDetected: true
          };
        }
      }
      
      // Attempt auto-correction
      console.log(`[Gatekeeper] Attempting auto-correction for errors:`);
      validationErrors.forEach(err => console.log(`  - ${err}`));
      
      const correctionPrompt = this.buildCorrectionPrompt(
        currentContent,
        validationErrors,
        filePath,
        fileExtension
      );
      
      let correctedContent = '';
      try {
        const response = await llmClient.sendMessage(correctionPrompt);
        if (response.success) {
          correctedContent = response.message || '';
        } else {
          throw new Error(response.error || 'LLM correction failed');
        }
      } catch (err) {
        console.log(`[Gatekeeper] LLM correction failed: ${err}`);
        return {
          finalContent: currentContent,
          validationPassed: false,
          iterations: this.iterationHistory,
          loopDetected: false
        };
      }
      
      // Extract code from markdown if wrapped
      const codeMatch = correctedContent.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/);
      if (codeMatch) {
        correctedContent = codeMatch[1];
        console.log(`[Gatekeeper] Extracted code from markdown block`);
      }
      
      // Ensure we have content
      if (!correctedContent || correctedContent.trim().length === 0) {
        console.log(`[Gatekeeper] ⚠️ LLM returned empty content, giving up`);
        return {
          finalContent: currentContent,
          validationPassed: false,
          iterations: this.iterationHistory,
          loopDetected: false
        };
      }
      
      currentContent = correctedContent;
      console.log(`[Gatekeeper] Auto-correction generated ${currentContent.length} bytes of code`);
    }
    
    // Should not reach here
    return {
      finalContent: currentContent,
      validationPassed: false,
      iterations: this.iterationHistory,
      loopDetected
    };
  }
  
  /**
   * Detect if we're in an infinite validation loop
   * Loop pattern: Same correction is applied multiple times
   */
  private detectValidationLoop(history: ValidationIteration[]): {
    isLooping: boolean;
    reason: string;
    repeatingFix: string;
  } {
    if (history.length < 2) {
      return { isLooping: false, reason: 'Not enough iterations', repeatingFix: '' };
    }
    
    // Check if last 2 iterations have the same error
    const lastErr = history[history.length - 1].errors;
    const prevErr = history[history.length - 2].errors;
    
    // Exact match = loop
    if (JSON.stringify(lastErr.sort()) === JSON.stringify(prevErr.sort())) {
      return {
        isLooping: true,
        reason: 'Same validation errors appearing twice - infinite loop detected',
        repeatingFix: lastErr[0] || 'Unknown error'
      };
    }
    
    // Check for ping-pong: errors alternate between two states
    if (history.length >= 3) {
      const curr = JSON.stringify(history[history.length - 1].errors.sort());
      const prev = JSON.stringify(history[history.length - 2].errors.sort());
      const prev2 = JSON.stringify(history[history.length - 3].errors.sort());
      
      if (curr === prev2 && curr !== prev) {
        return {
          isLooping: true,
          reason: 'Ping-pong pattern: errors oscillating between two states',
          repeatingFix: `State A: ${history[history.length - 3].errors[0]}, State B: ${history[history.length - 2].errors[0]}`
        };
      }
    }
    
    return { isLooping: false, reason: 'No loop pattern detected', repeatingFix: '' };
  }
  
  /**
   * Build smart correction prompt for LLM
   */
  private buildCorrectionPrompt(
    code: string,
    errors: string[],
    filePath: string,
    fileExtension: string
  ): string {
    const errorList = errors.map((e, i) => `${i + 1}. ${e}`).join('\n');
    
    return `Fix the following validation errors in ${filePath}:

ERRORS TO FIX:
${errorList}

CURRENT CODE:
${code}

INSTRUCTIONS:
1. Fix EVERY error listed above
2. Provide ONLY raw code - NO markdown, NO backticks, NO explanations
3. Start with the first line of code immediately
4. Make MINIMAL changes - only fix what's broken
5. Keep all other code unchanged
6. Do NOT remove or modify code that works
7. Return ONLY valid executable ${fileExtension} code
8. If import is missing, ADD it at the top
9. If import is unused, REMOVE it completely
10. Test your logic before responding

Start with code now:`;
  }
  
  /**
   * Comprehensive validation checks
   */
  private validateCode(
    code: string,
    filePath: string,
    fileExtension: string
  ): string[] {
    const errors: string[] = [];
    
    // Check 1: Markdown backticks
    if (code.includes('```')) {
      errors.push('❌ Code wrapped in markdown backticks');
    }
    
    // Check 2: Documentation instead of code
    if (/^#+\s+(Setup|Installation|Introduction)/mi.test(code)) {
      errors.push('❌ Content is documentation/markdown instead of code');
    }
    
    // Check 3: Multiple file references (should only generate one file)
    const fileRefs = (code.match(/\/\/\s*Create|\/\/\s*Step|\/\/\s*Then|\/\/\s*In |\/\/\s*Next/gi) || []).length;
    if (fileRefs > 1) {
      errors.push(`❌ Multiple file instructions - should only generate ${filePath}`);
    }
    
    // Check 4: Any types (unless necessary)
    if (code.includes(': any') || code.includes(' as any')) {
      const anyCount = (code.match(/any/g) || []).length;
      if (anyCount > 2) {
        errors.push(`❌ Too many 'any' types (${anyCount}) - use specific types`);
      }
    }
    
    // Check 5: Missing imports
    const importedItems = this.extractImports(code);
    const usedItems = this.extractUsages(code, importedItems);
    usedItems.missing.forEach(item => {
      errors.push(`❌ Missing import: '${item}' is used but not imported`);
    });
    
    // Check 6: Unused imports (with React exception)
    usedItems.unused.forEach(item => {
      if (!['React', 'Component'].includes(item)) {
        errors.push(`⚠️ Unused import: '${item}' imported but not used`);
      }
    });
    
    // Check 7: Brace matching
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`❌ Syntax: ${Math.abs(openBraces - closeBraces)} unmatched brace(s)`);
    }
    
    // Check 8: Hook names (must start with 'use' and be in hooks/)
    const isHookFile = filePath.includes('hooks/') || filePath.includes('hook');
    if (isHookFile) {
      const funcMatch = code.match(/export\s+(?:function|const)\s+(\w+)\s*[=({]/);
      if (funcMatch && !funcMatch[1].startsWith('use')) {
        errors.push(`⚠️ Hook naming: export function '${funcMatch[1]}' should start with 'use'`);
      }
    }
    
    // Check 9: Component names (must be PascalCase and in components/)
    const isComponentFile = filePath.includes('component') || filePath.endsWith('.tsx');
    if (isComponentFile && fileExtension === 'tsx') {
      const funcMatch = code.match(/export\s+(?:function|const)\s+(\w+)\s*[=({]/);
      if (funcMatch && !/^[A-Z]/.test(funcMatch[1])) {
        errors.push(`⚠️ Component naming: '${funcMatch[1]}' should be PascalCase`);
      }
    }
    
    return errors;
  }
  
  /**
   * Extract imported items from code
   */
  private extractImports(code: string): Set<string> {
    const imports = new Set<string>();
    
    // Named imports: import { A, B } from 'module'
    code.replace(/import\s+{([^}]+)}/g, (_, items) => {
      items.split(',').forEach((item: string) => {
        imports.add(item.trim());
      });
      return '';
    });
    
    // Default imports: import X from 'module'
    code.replace(/import\s+(\w+)\s+from/g, (_, name) => {
      imports.add(name.trim());
      return '';
    });
    
    // Namespace imports: import * as X from 'module'
    code.replace(/import\s+\*\s+as\s+(\w+)/g, (_, name) => {
      imports.add(name.trim());
      return '';
    });
    
    return imports;
  }
  
  /**
   * Extract usage of items in code
   */
  private extractUsages(code: string, imports: Set<string>): {
    missing: string[];
    unused: string[];
  } {
    const missing: string[] = [];
    const unused: string[] = [];
    
    // Check each imported item
    imports.forEach(item => {
      const usagePattern = new RegExp(`\\b${item}\\b`, 'g');
      const usages = code.match(usagePattern) || [];
      
      // First match is the import itself, so need 2+ for actual usage
      if (usages.length <= 1) {
        unused.push(item);
      }
    });
    
    return { missing, unused };
  }
}

export default GatekeeperValidator;
