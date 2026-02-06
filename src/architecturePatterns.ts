import CodebaseIndex from './codebaseIndex';

/**
 * Phase 3.4: Intelligent Refactoring - Architectural Pattern Library
 * Recognizes and suggests architectural patterns used in codebase
 */

export type PatternType = 
  | 'CRUD'
  | 'Authentication'
  | 'Forms'
  | 'DataFetching'
  | 'StateManagement'
  | 'Notifications'
  | 'SearchFilter'
  | 'Pagination';

export interface PatternTemplate {
  name: PatternType;
  description: string;
  files: PatternFile[];
  complexity: 'simple' | 'medium' | 'complex';
  libraries: string[];
}

export interface PatternFile {
  type: 'schema' | 'service' | 'hook' | 'component';
  namingPattern: string;
  description: string;
}

export interface FeatureAnalysis {
  name: string;
  description: string;
  detectedOperations: string[];
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  suggestedPatterns: PatternType[];
  rationale: string;
}

export interface PatternSuggestion {
  pattern: PatternType;
  confidence: number; // 0-1
  reason: string;
  files: PatternFile[];
}

export interface ArchitectureSuggestion {
  feature: string;
  primaryPattern: PatternType;
  supportingPatterns: PatternType[];
  estimatedFiles: number;
  architecture: ArchitectureLayer[];
  complexity: 'simple' | 'medium' | 'complex';
}

export interface ArchitectureLayer {
  name: string;
  files: LayerFile[];
  responsibility: string;
}

export interface LayerFile {
  filename: string;
  purpose: string;
  dependencies: string[];
}

export class ArchitecturePatterns {
  private patterns: Map<PatternType, PatternTemplate>;

  constructor() {
    this.patterns = new Map();
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // CRUD Pattern - Most common: Create, Read, Update, Delete
    this.patterns.set('CRUD', {
      name: 'CRUD',
      description: 'Create, Read, Update, Delete operations on a resource',
      complexity: 'medium',
      libraries: ['zod', '@tanstack/react-query', 'react-hook-form'],
      files: [
        { type: 'schema', namingPattern: '[resource]Schema.ts', description: 'Zod schemas for validation' },
        { type: 'service', namingPattern: '[resource]Service.ts', description: 'API calls and business logic' },
        { type: 'hook', namingPattern: 'use[Resource].ts', description: 'Data fetching with caching' },
        { type: 'hook', namingPattern: 'use[Resource]Mutations.ts', description: 'Create/Update/Delete mutations' },
        { type: 'component', namingPattern: '[Resource]List.tsx', description: 'Display resource list' },
        { type: 'component', namingPattern: '[Resource]Form.tsx', description: 'Create/Edit form' },
        { type: 'component', namingPattern: '[Resource]Detail.tsx', description: 'Single resource view' },
      ],
    });

    // Authentication Pattern
    this.patterns.set('Authentication', {
      name: 'Authentication',
      description: 'User authentication and authorization',
      complexity: 'complex',
      libraries: ['zustand', '@tanstack/react-query', 'jwt-decode'],
      files: [
        { type: 'schema', namingPattern: 'authSchema.ts', description: 'Login/register validation' },
        { type: 'service', namingPattern: 'authService.ts', description: 'Auth API calls' },
        { type: 'hook', namingPattern: 'useAuth.ts', description: 'Auth state management' },
        { type: 'hook', namingPattern: 'useLogin.ts', description: 'Login mutation' },
        { type: 'hook', namingPattern: 'useRegister.ts', description: 'Registration mutation' },
        { type: 'component', namingPattern: 'PrivateRoute.tsx', description: 'Protected route wrapper' },
        { type: 'component', namingPattern: 'LoginForm.tsx', description: 'Login UI' },
      ],
    });

    // Forms Pattern
    this.patterns.set('Forms', {
      name: 'Forms',
      description: 'Complex form handling with validation',
      complexity: 'medium',
      libraries: ['react-hook-form', '@hookform/resolvers', 'zod'],
      files: [
        { type: 'schema', namingPattern: '[form]Schema.ts', description: 'Form validation schema' },
        { type: 'hook', namingPattern: 'use[Form].ts', description: 'Form state and submission' },
        { type: 'component', namingPattern: '[Form].tsx', description: 'Form component' },
        { type: 'component', namingPattern: '[Form]Field.tsx', description: 'Reusable form field' },
      ],
    });

    // Data Fetching Pattern
    this.patterns.set('DataFetching', {
      name: 'DataFetching',
      description: 'Data fetching with caching and error handling',
      complexity: 'simple',
      libraries: ['@tanstack/react-query', 'axios'],
      files: [
        { type: 'service', namingPattern: '[resource]Api.ts', description: 'API client' },
        { type: 'hook', namingPattern: 'use[Resource].ts', description: 'Data fetching hook' },
        { type: 'hook', namingPattern: 'use[Resource]List.ts', description: 'List fetching with pagination' },
      ],
    });

    // State Management Pattern
    this.patterns.set('StateManagement', {
      name: 'StateManagement',
      description: 'Global state management with Zustand',
      complexity: 'medium',
      libraries: ['zustand', 'immer'],
      files: [
        { type: 'hook', namingPattern: 'use[Store].ts', description: 'Zustand store' },
        { type: 'hook', namingPattern: 'use[Entity].ts', description: 'Store hook wrapper' },
      ],
    });

    // Notifications Pattern
    this.patterns.set('Notifications', {
      name: 'Notifications',
      description: 'Toast/notification system',
      complexity: 'simple',
      libraries: ['react-hot-toast', 'sonner'],
      files: [
        { type: 'hook', namingPattern: 'useNotification.ts', description: 'Notification hook' },
        { type: 'component', namingPattern: 'NotificationProvider.tsx', description: 'Notification context' },
      ],
    });

    // Search & Filter Pattern
    this.patterns.set('SearchFilter', {
      name: 'SearchFilter',
      description: 'Search and filtering functionality',
      complexity: 'medium',
      libraries: ['@tanstack/react-query', 'zustand'],
      files: [
        { type: 'hook', namingPattern: 'useSearch[Resource].ts', description: 'Search logic' },
        { type: 'hook', namingPattern: 'useFilter[Resource].ts', description: 'Filter logic' },
        { type: 'component', namingPattern: '[Resource]SearchBar.tsx', description: 'Search input' },
        { type: 'component', namingPattern: '[Resource]Filters.tsx', description: 'Filter controls' },
      ],
    });

    // Pagination Pattern
    this.patterns.set('Pagination', {
      name: 'Pagination',
      description: 'Paginated list display',
      complexity: 'simple',
      libraries: ['@tanstack/react-query'],
      files: [
        { type: 'hook', namingPattern: 'use[Resource]Pagination.ts', description: 'Pagination logic' },
        { type: 'component', namingPattern: 'Pagination.tsx', description: 'Pagination controls' },
        { type: 'component', namingPattern: '[Resource]List.tsx', description: 'Paginated list' },
      ],
    });
  }

  /**
   * Detect which pattern a piece of code follows
   */
  detectPattern(code: string): PatternType | null {
    const codeUpper = code.toUpperCase();

    // Notifications - check first (more specific)
    if (
      codeUpper.includes('TOAST') ||
      codeUpper.includes('REACT-HOT-TOAST') ||
      codeUpper.includes('SONNER')
    ) {
      return 'Notifications';
    }

    // Authentication - check early (more specific)
    if (
      codeUpper.includes('LOGIN') ||
      codeUpper.includes('REGISTER') ||
      (codeUpper.includes('AUTH') && !codeUpper.includes('AUTHORIZE')) ||
      codeUpper.includes('JWT-DECODE') ||
      codeUpper.includes('AUTH_TOKEN')
    ) {
      return 'Authentication';
    }

    // Forms detection
    if (
      codeUpper.includes('USEFORM') ||
      codeUpper.includes('REACT-HOOK-FORM') ||
      codeUpper.includes('ZODRESOLVER') ||
      codeUpper.includes('FORMSTATE')
    ) {
      return 'Forms';
    }

    // Data fetching (before generic CREATE check)
    if (
      codeUpper.includes('USEQUERY') ||
      codeUpper.includes('USEMUTATION') ||
      codeUpper.includes('FETCH(') ||
      codeUpper.includes('AXIOS')
    ) {
      return 'DataFetching';
    }

    // State management (specific Zustand check)
    if (codeUpper.includes('ZUSTAND') || codeUpper.includes('CREATE((SET)')) {
      return 'StateManagement';
    }

    // Search & Filter
    if (codeUpper.includes('SEARCH') && codeUpper.includes('FILTER')) {
      return 'SearchFilter';
    }

    // Pagination
    if (codeUpper.includes('PAGE') && codeUpper.includes('LIMIT')) {
      return 'Pagination';
    }

    // CRUD detection: look for create, read, update, delete operations (lowest priority)
    const crudIndicators = [
      'CREATE',
      'READ',
      'UPDATE',
      'DELETE',
    ].filter(i => codeUpper.includes(i));

    if (crudIndicators.length >= 2) {
      return 'CRUD';
    }

    return null;
  }

  /**
   * Get pattern template by type
   */
  getTemplate(pattern: PatternType): PatternTemplate | undefined {
    return this.patterns.get(pattern);
  }

  /**
   * Get all available patterns
   */
  getAllPatterns(): PatternTemplate[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Suggest patterns based on feature description
   */
  suggestPatterns(featureDescription: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const descUpper = featureDescription.toUpperCase();

    // CRUD features
    if (descUpper.includes('CREATE') || descUpper.includes('MANAGE') || descUpper.includes('RESOURCE')) {
      suggestions.push({
        pattern: 'CRUD',
        confidence: 0.9,
        reason: 'Feature involves resource management',
        files: this.patterns.get('CRUD')?.files || [],
      });
    }

    // Authentication features
    if (descUpper.includes('LOGIN') || descUpper.includes('AUTH')) {
      suggestions.push({
        pattern: 'Authentication',
        confidence: 0.95,
        reason: 'Feature requires authentication',
        files: this.patterns.get('Authentication')?.files || [],
      });
    }

    // Forms
    if (descUpper.includes('FORM') || descUpper.includes('INPUT')) {
      suggestions.push({
        pattern: 'Forms',
        confidence: 0.85,
        reason: 'Feature includes form handling',
        files: this.patterns.get('Forms')?.files || [],
      });
    }

    // Data fetching
    if (descUpper.includes('FETCH') || descUpper.includes('LOAD')) {
      suggestions.push({
        pattern: 'DataFetching',
        confidence: 0.8,
        reason: 'Feature involves data loading',
        files: this.patterns.get('DataFetching')?.files || [],
      });
    }

    // Notifications
    if (descUpper.includes('ALERT') || descUpper.includes('NOTIFY')) {
      suggestions.push({
        pattern: 'Notifications',
        confidence: 0.75,
        reason: 'Feature includes notifications',
        files: this.patterns.get('Notifications')?.files || [],
      });
    }

    // Search & Filter
    if (descUpper.includes('SEARCH') || descUpper.includes('FILTER')) {
      suggestions.push({
        pattern: 'SearchFilter',
        confidence: 0.85,
        reason: 'Feature involves search/filter',
        files: this.patterns.get('SearchFilter')?.files || [],
      });
    }

    // Pagination
    if (descUpper.includes('LIST') || descUpper.includes('PAGINATION')) {
      suggestions.push({
        pattern: 'Pagination',
        confidence: 0.7,
        reason: 'Feature displays paginated list',
        files: this.patterns.get('Pagination')?.files || [],
      });
    }

    // Sort by confidence descending
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Estimate complexity of feature
   */
  estimateComplexity(patterns: PatternType[]): 'simple' | 'medium' | 'complex' {
    const complexities = patterns
      .map(p => this.patterns.get(p)?.complexity || 'simple')
      .map(c => ({ simple: 1, medium: 2, complex: 3 }[c]));

    const avg = complexities.reduce((a, b) => a + b, 0) / complexities.length;

    if (avg <= 1.3) return 'simple';
    if (avg <= 2.3) return 'medium';
    return 'complex';
  }

  /**
   * Generate architecture suggestion for feature
   */
  generateArchitecture(
    featureName: string,
    patterns: PatternType[]
  ): ArchitectureSuggestion {
    const layers: ArchitectureLayer[] = [];
    const allFiles = new Set<LayerFile>();

    // Collect files from all patterns
    patterns.forEach(patternType => {
      const template = this.patterns.get(patternType);
      if (template) {
        template.files.forEach(f => {
          allFiles.add({
            filename: f.namingPattern.replace('[resource]', featureName).replace('[Resource]', this.capitalize(featureName)),
            purpose: f.description,
            dependencies: [],
          });
        });
      }
    });

    // Organize by layer
    const schemaFiles = Array.from(allFiles).filter(f => f.filename.includes('Schema'));
    const serviceFiles = Array.from(allFiles).filter(f => f.filename.includes('Service') || f.filename.includes('Api'));
    const hookFiles = Array.from(allFiles).filter(f => f.filename.includes('use'));
    const componentFiles = Array.from(allFiles).filter(f => f.filename.endsWith('.tsx'));

    if (schemaFiles.length > 0) {
      layers.push({
        name: 'Schema/Validation',
        files: schemaFiles,
        responsibility: 'Data validation and type definitions',
      });
    }

    if (serviceFiles.length > 0) {
      layers.push({
        name: 'Service/API',
        files: serviceFiles,
        responsibility: 'Business logic and API integration',
      });
    }

    if (hookFiles.length > 0) {
      layers.push({
        name: 'Hooks',
        files: hookFiles,
        responsibility: 'State management and side effects',
      });
    }

    if (componentFiles.length > 0) {
      layers.push({
        name: 'Components',
        files: componentFiles,
        responsibility: 'UI presentation and interaction',
      });
    }

    return {
      feature: featureName,
      primaryPattern: patterns[0],
      supportingPatterns: patterns.slice(1),
      estimatedFiles: allFiles.size,
      architecture: layers,
      complexity: this.estimateComplexity(patterns),
    };
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
