import { ArchitecturePatterns, PatternType } from './architecturePatterns';
import { FeatureAnalyzer, FatHook } from './featureAnalyzer';
import { LLMClient } from './llmClient';

/**
 * Phase 3.4.3: Service Extractor
 * Extracts business logic from hooks into service layer
 * Detects fat hooks and generates refactoring plans
 */

export interface ServiceExtraction {
  originalFile: string;
  serviceName: string;
  serviceFile: string;
  extractedCode: string;
  updatedHookCode: string;
  imports: ImportStatement[];
  exports: ExportStatement[];
  confidence: number; // 0-1
  validationErrors: string[];
  testCases: TestCase[];
}

export interface ImportStatement {
  source: string;
  items: string[];
  isDefault: boolean;
}

export interface ExportStatement {
  name: string;
  type: 'function' | 'const' | 'type' | 'interface';
  isDefault: boolean;
}

export interface TestCase {
  name: string;
  code: string;
  description: string;
}

export interface RefactoringPlan {
  hookFile: string;
  estimatedComplexity: 'low' | 'medium' | 'high' | 'critical';
  proposedChanges: ProposedChange[];
  estimatedEffort: string; // e.g., "30 minutes"
  confidence: number; // 0-1
  risks: Risk[];
}

export interface ProposedChange {
  type: 'extract' | 'simplify' | 'consolidate' | 'add';
  description: string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Risk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface HookAnalysis {
  filename: string;
  totalLines: number;
  complexity: 'simple' | 'moderate' | 'high' | 'critical';
  extractionCandidates: ExtractionCandidate[];
  dependencies: string[];
  asyncOperations: number;
  errorHandling: ErrorHandlingAnalysis;
}

export interface ExtractionCandidate {
  name: string;
  type: 'logic' | 'api' | 'state' | 'validation';
  lines: number;
  confidence: number;
  reason: string;
}

export interface ErrorHandlingAnalysis {
  hasTryCatch: boolean;
  hasErrorState: boolean;
  isComplete: boolean;
  issues: string[];
}

export class ServiceExtractor {
  private analyzer: FeatureAnalyzer;
  private patterns: ArchitecturePatterns;
  private llmClient: LLMClient | undefined;

  constructor(analyzer?: FeatureAnalyzer, patterns?: ArchitecturePatterns, llmClient?: LLMClient) {
    this.analyzer = analyzer || new FeatureAnalyzer();
    this.patterns = patterns || new ArchitecturePatterns();
    this.llmClient = llmClient;
    
    // Log which model is being used
    if (this.llmClient) {
      const config = this.llmClient.getConfig();
      console.log(`[ServiceExtractor] Using model: ${config.model} at ${config.endpoint}`);
    } else {
      console.log('[ServiceExtractor] No LLMClient provided - using pattern-based extraction only');
    }
  }

  /**
   * Analyze a hook file for extraction opportunities
   */
  analyzeHook(filename: string, code: string): HookAnalysis {
    const lines = code.split('\n');
    const totalLines = lines.length;

    // Detect extraction candidates
    const candidates = this.detectExtractionCandidates(code);

    // Analyze dependencies
    const dependencies = this.extractDependencies(code);

    // Count async operations
    const asyncOperations = (code.match(/async\s+function|async\s*\(|await\s+/g) || []).length;

    // Analyze error handling
    const errorHandling = this.analyzeErrorHandling(code);

    // Estimate complexity
    let complexity: 'simple' | 'moderate' | 'high' | 'critical' = 'simple';
    if (totalLines > 80) {complexity = 'moderate';}
    if (totalLines > 150) {complexity = 'high';}
    if (totalLines > 250) {complexity = 'critical';}

    return {
      filename,
      totalLines,
      complexity,
      extractionCandidates: candidates,
      dependencies,
      asyncOperations,
      errorHandling,
    };
  }

  /**
   * Detect what code can be extracted to a service
   */
  private detectExtractionCandidates(code: string): ExtractionCandidate[] {
    const candidates: ExtractionCandidate[] = [];

    // Detect API calls
    const fetchCalls = code.match(/fetch\([^)]+\)|axios\.[a-z]+\([^)]+\)/gi) || [];
    if (fetchCalls.length > 0) {
      const apiCode = code.match(/(?:async\s+function|const\s+\w+\s*=.*async.*\(.*\)\s*=>).*?fetch|axios/i);
      candidates.push({
        name: 'API Operations',
        type: 'api',
        lines: fetchCalls.length * 3, // Rough estimate
        confidence: 0.9,
        reason: `${fetchCalls.length} API calls detected - should be in service layer`,
      });
    }

    // Detect mutation logic
    const mutations = code.match(/useMutation|mutation|update|set[A-Z]/gi) || [];
    if (mutations.length > 2) {
      candidates.push({
        name: 'Mutation Logic',
        type: 'logic',
        lines: mutations.length * 5,
        confidence: 0.8,
        reason: `${mutations.length} mutations detected - extract to service`,
      });
    }

    // Detect validation logic
    const validation = code.match(/validate|schema|\.parse|\.refine|error/gi) || [];
    if (validation.length > 3) {
      candidates.push({
        name: 'Validation Logic',
        type: 'validation',
        lines: validation.length * 2,
        confidence: 0.7,
        reason: `${validation.length} validation checks - move to schemas`,
      });
    }

    // Detect state management
    const stateOps = code.match(/useState|setState|setData|set[A-Z]\w+\(/g) || [];
    if (stateOps.length > 3) {
      candidates.push({
        name: 'State Management',
        type: 'state',
        lines: stateOps.length * 2,
        confidence: 0.6,
        reason: `${stateOps.length} state operations - consider Zustand store`,
      });
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract imports from code
   */
  private extractDependencies(code: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:{[^}]+}|[\w*]+|\w+\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }

    // Remove duplicates
    const uniqueImports = [];
    for (const imp of imports) {
      if (!uniqueImports.includes(imp)) {
        uniqueImports.push(imp);
      }
    }

    return uniqueImports;
  }

  /**
   * Analyze error handling in hook
   */
  private analyzeErrorHandling(code: string): ErrorHandlingAnalysis {
    const hasTryCatch = code.includes('try') && code.includes('catch');
    const hasErrorState = /setError|error|Error/.test(code);
    const trycatches = (code.match(/try\s*{/g) || []).length;
    const asyncOps = (code.match(/await\s+/g) || []).length;

    const issues: string[] = [];
    if (asyncOps > 0 && !hasTryCatch) {
      issues.push('Async operations without try-catch');
    }
    if (asyncOps > 2 && trycatches < asyncOps / 2) {
      issues.push('Multiple async operations with insufficient error handling');
    }

    return {
      hasTryCatch,
      hasErrorState,
      isComplete: hasTryCatch && hasErrorState,
      issues,
    };
  }

  /**
   * Generate a refactoring plan for a fat hook
   */
  generateRefactoringPlan(analysis: HookAnalysis): RefactoringPlan {
    const changes: ProposedChange[] = [];
    const risks: Risk[] = [];

    // Propose extraction of API calls
    const apiCandidate = analysis.extractionCandidates.find(c => c.type === 'api');
    if (apiCandidate) {
      changes.push({
        type: 'extract',
        description: `Extract ${apiCandidate.name} to service layer`,
        impact: `Reduce hook size by ~${apiCandidate.lines} lines`,
        priority: 'high',
      });
    }

    // Propose simplification of mutations
    const mutationCandidate = analysis.extractionCandidates.find(c => c.type === 'logic');
    if (mutationCandidate) {
      changes.push({
        type: 'extract',
        description: `Extract ${mutationCandidate.name} to service`,
        impact: `Improve hook clarity, enable reuse`,
        priority: 'high',
      });
    }

    // Propose error handling improvement
    if (!analysis.errorHandling.isComplete) {
      changes.push({
        type: 'add',
        description: 'Add comprehensive error handling',
        impact: 'Prevent runtime errors in production',
        priority: 'high',
      });
      risks.push({
        description: 'Incomplete error handling exists',
        severity: 'medium',
        mitigation: 'Add try-catch blocks around async operations',
      });
    }

    // Estimate effort
    let estimatedEffort = '15 minutes';
    let refactoringComplexity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    if (analysis.complexity === 'moderate') {
      estimatedEffort = '20-30 minutes';
      refactoringComplexity = 'medium';
    }
    if (analysis.complexity === 'high') {
      estimatedEffort = '30-45 minutes';
      refactoringComplexity = 'high';
    }
    if (analysis.complexity === 'critical') {
      estimatedEffort = '1-2 hours';
      refactoringComplexity = 'critical';
    }

    return {
      hookFile: analysis.filename,
      estimatedComplexity: refactoringComplexity,
      proposedChanges: changes,
      estimatedEffort,
      confidence: 0.8,
      risks,
    };
  }

  /**
   * Extract API logic from hook into service
   */
  extractService(
    hookCode: string,
    hookName: string,
    serviceName: string
  ): ServiceExtraction {
    const validationErrors: string[] = [];
    const extractedCode = this.generateServiceCode(hookCode, serviceName);
    const updatedHookCode = this.generateUpdatedHook(hookCode, serviceName);
    const imports = this.extractImports(extractedCode);
    const exports = this.extractExports(extractedCode);
    const testCases = this.generateTestCases(serviceName, extractedCode);

    // Validate extraction
    if (!extractedCode.includes('export')) {
      validationErrors.push('Service should export functions');
    }
    if (!updatedHookCode.includes(`import`)) {
      validationErrors.push('Updated hook should import from service');
    }

    return {
      originalFile: hookName,
      serviceName,
      serviceFile: `${serviceName}.ts`,
      extractedCode,
      updatedHookCode,
      imports,
      exports,
      confidence: validationErrors.length === 0 ? 0.9 : 0.6,
      validationErrors,
      testCases,
    };
  }

  /**
   * Generate service code from hook logic
   */
  private generateServiceCode(hookCode: string, serviceName: string): string {
    // Extract async functions and API calls
    const asyncFuncs = this.extractAsyncFunctions(hookCode);
    const apiCalls = this.extractApiCalls(hookCode);

    let service = `/**\n * ${serviceName}\n * Auto-generated from hook extraction\n */\n\n`;

    // Add imports
    service += this.generateImports(hookCode);
    service += '\n';

    // Add extracted functions
    if (asyncFuncs.length > 0) {
      service += `// API Functions\n`;
      asyncFuncs.forEach(fn => {
        service += `${fn}\n\n`;
      });
    }

    // Add helper functions for API calls
    if (apiCalls.length > 0) {
      service += `// API Calls\n`;
      apiCalls.forEach(call => {
        service += `export ${call}\n\n`;
      });
    }

    return service;
  }

  /**
   * Extract async functions from code
   */
  private extractAsyncFunctions(code: string): string[] {
    const funcs: string[] = [];
    // Simplified: just look for async function definitions
    const asyncRegex = /async\s+function\s+\w+[^}]*\}/g;

    let match;
    while ((match = asyncRegex.exec(code)) !== null) {
      funcs.push(match[0]);
    }

    return funcs;
  }

  /**
   * Extract API calls from code
   */
  private extractApiCalls(code: string): string[] {
    const calls: string[] = [];
    // Simplified: look for fetch/axios patterns
    const fetchRegex = /(?:const|async)?\s*\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*fetch[^;]+;/g;

    let match;
    while ((match = fetchRegex.exec(code)) !== null) {
      calls.push(match[0]);
    }

    return calls;
  }

  /**
   * Generate imports for service
   */
  private generateImports(hookCode: string): string {
    const deps = this.extractDependencies(hookCode);
    let imports = '';

    // Filter imports - exclude React hooks
    const serviceImports = deps.filter(
      d => !d.includes('react') || d.includes('@tanstack/react-query')
    );

    serviceImports.forEach(imp => {
      if (imp.includes('react-query') || imp.includes('@tanstack/react-query')) {
        imports += `import { QueryClient } from '${imp}';\n`;
      } else if (imp.includes('axios')) {
        imports += `import axios from '${imp}';\n`;
      }
    });

    return imports;
  }

  /**
   * Generate updated hook code (simplified)
   */
  private generateUpdatedHook(hookCode: string, serviceName: string): string {
    // Remove async functions, keep hook logic
    let updated = hookCode;

    // Add import from service
    const hookName = hookCode.match(/export\s+(?:const|function)\s+(\w+)/)?.[1] || 'Hook';
    updated = `import * as ${serviceName} from './${serviceName}';\n\n${updated}`;

    return updated;
  }

  /**
   * Extract imports from code
   */
  private extractImports(code: string): ImportStatement[] {
    const imports: ImportStatement[] = [];
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const items = match[1] ? match[1].split(',').map(s => s.trim()) : [match[2]];
      imports.push({
        source: match[3],
        items,
        isDefault: !match[1],
      });
    }

    return imports;
  }

  /**
   * Extract exports from code
   */
  private extractExports(code: string): ExportStatement[] {
    const exports: ExportStatement[] = [];
    const exportRegex = /export\s+(?:(async\s+)?function|const|type|interface)\s+(\w+)/g;

    let match;
    while ((match = exportRegex.exec(code)) !== null) {
      const typeMap: { [key: string]: ExportStatement['type'] } = {
        function: 'function',
        const: 'const',
        type: 'type',
        interface: 'interface',
      };

      const typeKey = match[1]?.trim() || 'const';
      const type = typeMap[typeKey] || 'const';

      exports.push({
        name: match[2],
        type,
        isDefault: false,
      });
    }

    return exports;
  }

  /**
   * Generate test cases for extracted service
   */
  private generateTestCases(serviceName: string, serviceCode: string): TestCase[] {
    const testCases: TestCase[] = [];

    // Find exported functions
    const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let match;
    while ((match = funcRegex.exec(serviceCode)) !== null) {
      const funcName = match[1];
      testCases.push({
        name: `${serviceName}.${funcName}`,
        code: `
  it('${funcName} returns expected result', async () => {
    const result = await ${serviceName}.${funcName}();
    expect(result).toBeDefined();
  });
`,
        description: `Test ${funcName} function`,
      });
    }

    return testCases;
  }

  /**
   * Phase 3.4.5.1: LLM-based service extraction
   * Uses LLM to intelligently generate service code based on semantic analysis
   */
  async extractServiceWithLLM(
    hookCode: string,
    serviceName: string,
    semanticAnalysis?: any
  ): Promise<ServiceExtraction> {
    // If no LLM client, fall back to deterministic extraction
    if (!this.llmClient) {
      return this.extractService(hookCode, '', serviceName);
    }

    try {
      // Build prompt with semantic analysis insights
      const analysisContext = semanticAnalysis
        ? `
Key Issues Found:
${semanticAnalysis.unusedStates?.map((s: string) => `- Unused state: ${s}`).join('\n') || ''}
${semanticAnalysis.tightCoupling?.map((c: string) => `- Tight coupling: ${c}`).join('\n') || ''}
${semanticAnalysis.antiPatterns?.map((a: string) => `- Anti-pattern: ${a}`).join('\n') || ''}
        `
        : '';

      const prompt = `
Extract the API/business logic from this React hook into a pure service.

Hook Code:
\`\`\`typescript
${hookCode}
\`\`\`

${analysisContext}

Requirements:
1. Create a pure service (NO React imports, NO hooks)
2. Extract all API calls, data transformations, validation
3. Use TypeScript with proper types
4. Add JSDoc comments for each function
5. Export named functions (not default)
6. Keep it testable and reusable

Service Name: ${serviceName}

Generate ONLY the service code, nothing else.
`;

      const response = await this.llmClient.sendMessage(prompt);

      if (!response.success) {
        // Fall back to deterministic extraction on LLM failure
        return this.extractService(hookCode, '', serviceName);
      }

      // Extract code from LLM response
      const extractedCode = this.extractCodeFromLLMResponse(response.message);

      // Generate updated hook (still deterministic)
      const updatedHookCode = this.generateUpdatedHook(hookCode, serviceName);

      // Extract metadata
      const imports = this.extractImports(extractedCode);
      const exports = this.extractExports(extractedCode);
      const testCases = this.generateTestCases(serviceName, extractedCode);

      // Validate
      const validationErrors: string[] = [];
      if (!extractedCode.includes('export')) {
        validationErrors.push('Service should export functions');
      }
      if (extractedCode.includes('import React') || extractedCode.includes('from "react"')) {
        validationErrors.push('Service should not import React');
      }
      if (extractedCode.includes('useState') || extractedCode.includes('useEffect')) {
        validationErrors.push('Service should not use React hooks');
      }

      return {
        originalFile: '',
        serviceName,
        serviceFile: `${serviceName}.ts`,
        extractedCode,
        updatedHookCode,
        imports,
        exports,
        confidence: validationErrors.length === 0 ? 0.95 : 0.7,
        validationErrors,
        testCases,
      };
    } catch (err) {
      // Fall back to deterministic extraction on any error
      console.error('LLM extraction failed, falling back to deterministic:', err);
      return this.extractService(hookCode, '', serviceName);
    }
  }

  /**
   * Extract code from LLM response (handles markdown blocks)
   */
  private extractCodeFromLLMResponse(response: string): string {
    // Try to extract from markdown code block
    const codeBlockMatch = response.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no markdown block, return the whole response (assume it's code)
    return response.trim();
  }
}
