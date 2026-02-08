import { LLMClient } from './llmClient';

export type PatternType = 
  | 'CRUD'
  | 'Authentication'
  | 'Forms'
  | 'DataFetching'
  | 'StateManagement'
  | 'Notifications'
  | 'SearchFilter'
  | 'Pagination'
  | 'None';

export interface PatternDetectionResult {
  pattern: PatternType;
  confidence: number; // 0-1
  reasoning: string;
  suggestedImprovements: string[];
}

/**
 * Smart pattern detection using LLM analysis
 * Replaces keyword-based detection with semantic understanding
 */
export class PatternDetector {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * Detect architectural pattern in file using LLM
   * Much smarter than keyword matching - understands actual code structure
   */
  async detectPatternWithLLM(code: string, filepath: string): Promise<PatternDetectionResult> {
    const prompt = `Analyze this file and determine what architectural pattern it implements or should implement.

File: ${filepath}
Code:
\`\`\`typescript
${code}
\`\`\`

Available patterns:
- CRUD: Create, Read, Update, Delete operations on a resource
- Authentication: User login, registration, authorization, token management
- Forms: Complex form handling with validation, submission, error handling
- DataFetching: API calls with caching, loading states, error handling
- StateManagement: Global state with Zustand, Redux, Context API
- Notifications: Toast/alert/notification system integration
- SearchFilter: Search and filtering functionality
- Pagination: Paginated list display
- None: Pure UI component with no special pattern

Respond in JSON format:
{
  "pattern": "PATTERN_NAME",
  "confidence": 0.0-1.0,
  "reasoning": "Why this pattern fits (or doesn't)",
  "suggestedImprovements": ["improvement 1", "improvement 2"]
}

Be strict: if the file doesn't clearly implement a pattern, return "None".
Don't force a pattern just because of coincidental keywords.`;

    try {
      // Wrap with 5-second timeout to prevent hanging
      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error('Pattern detection timeout after 5s')), 5000)
      );
      
      const response = await Promise.race([
        this.llmClient.sendMessage(prompt),
        timeoutPromise
      ]);
      
      if (!response.success || !response.message) {
        return this.fallbackKeywordDetection(code);
      }

      // Parse JSON from response
      const jsonMatch = response.message.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackKeywordDetection(code);
      }

      let result;
      try {
        // Try direct parse first
        result = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        // If direct parse fails, try sanitizing escape sequences
        try {
          const sanitized = jsonMatch[0]
            .replace(/\\x([0-9a-f]{2})/gi, '') // Remove hex escapes
            .replace(/\\u([0-9a-f]{4})/gi, '\\u$1') // Keep unicode escapes
            .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
          result = JSON.parse(sanitized);
        } catch (sanitizeError) {
          return this.fallbackKeywordDetection(code);
        }
      }
      
      return {
        pattern: result.pattern || 'None',
        confidence: Math.min(1, Math.max(0, result.confidence !== undefined ? result.confidence : 0.5)),
        reasoning: result.reasoning || 'LLM analysis',
        suggestedImprovements: Array.isArray(result.suggestedImprovements) 
          ? result.suggestedImprovements 
          : [],
      };
    } catch (error) {
      console.log(`[PatternDetector] LLM analysis failed: ${error}, falling back to keywords`);
      return this.fallbackKeywordDetection(code);
    }
  }

  /**
   * Fallback: keyword-based detection (fast, less accurate)
   * Used when LLM is unavailable
   */
  private fallbackKeywordDetection(code: string): PatternDetectionResult {
    const codeUpper = code.toUpperCase();
    let pattern: PatternType = 'None';
    let confidence = 0;

    // Notifications
    if (codeUpper.includes('TOAST') || codeUpper.includes('SONNER') || codeUpper.includes('REACT-HOT-TOAST')) {
      return {
        pattern: 'Notifications',
        confidence: 0.8,
        reasoning: 'Found notification library usage',
        suggestedImprovements: ['Consider centralizing toast configuration'],
      };
    }

    // Authentication
    if (codeUpper.includes('LOGIN') || codeUpper.includes('AUTH') || codeUpper.includes('JWT')) {
      return {
        pattern: 'Authentication',
        confidence: 0.75,
        reasoning: 'Found authentication-related code',
        suggestedImprovements: ['Ensure token storage is secure', 'Add auth state persistence'],
      };
    }

    // Forms
    if (codeUpper.includes('USEFORM') || codeUpper.includes('REACT-HOOK-FORM') || codeUpper.includes('ZOD')) {
      return {
        pattern: 'Forms',
        confidence: 0.8,
        reasoning: 'Found form handling library',
        suggestedImprovements: ['Consider adding custom validation', 'Add loading state during submission'],
      };
    }

    // DataFetching
    if (codeUpper.includes('USEQUERY') || codeUpper.includes('USEMUTATION') || codeUpper.includes('FETCH(')) {
      return {
        pattern: 'DataFetching',
        confidence: 0.85,
        reasoning: 'Found data fetching pattern',
        suggestedImprovements: ['Add error boundary', 'Consider retry logic for failed requests'],
      };
    }

    // StateManagement
    if (codeUpper.includes('ZUSTAND') || codeUpper.includes('REDUX') || codeUpper.includes('CONTEXT')) {
      return {
        pattern: 'StateManagement',
        confidence: 0.9,
        reasoning: 'Found state management library',
        suggestedImprovements: ['Normalize state shape', 'Add state persistence if needed'],
      };
    }

    // Search & Filter
    if (codeUpper.includes('SEARCH') && codeUpper.includes('FILTER')) {
      return {
        pattern: 'SearchFilter',
        confidence: 0.7,
        reasoning: 'Found search and filter functionality',
        suggestedImprovements: ['Debounce search input', 'Cache filter results'],
      };
    }

    // Pagination
    if (codeUpper.includes('PAGE') && codeUpper.includes('LIMIT')) {
      return {
        pattern: 'Pagination',
        confidence: 0.75,
        reasoning: 'Found pagination logic',
        suggestedImprovements: ['Add page size selector', 'Preserve pagination state in URL'],
      };
    }

    // CRUD
    const crudKeywords = ['CREATE', 'READ', 'UPDATE', 'DELETE'].filter(k => codeUpper.includes(k));
    if (crudKeywords.length >= 2) {
      return {
        pattern: 'CRUD',
        confidence: 0.65,
        reasoning: 'Found multiple CRUD operations',
        suggestedImprovements: ['Separate schema and service layers', 'Add optimistic updates'],
      };
    }

    return {
      pattern: 'None',
      confidence: 0,
      reasoning: 'No clear architectural pattern detected',
      suggestedImprovements: ['Consider adding type safety with schemas', 'Extract reusable logic to hooks or services'],
    };
  }

  /**
   * Check if a pattern detection result is worth flagging
   * Prevents false positives in /suggest-patterns
   */
  shouldFlagPattern(result: PatternDetectionResult): boolean {
    // Only flag if we have reasonable confidence
    if (result.confidence < 0.6) {
      return false;
    }

    // Don't flag "None"
    if (result.pattern === 'None') {
      return false;
    }

    return true;
  }
}
