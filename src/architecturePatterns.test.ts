import { describe, it, expect } from 'vitest';
import { ArchitecturePatterns } from './architecturePatterns';

describe('ArchitecturePatterns', () => {
  let patterns: ArchitecturePatterns;

  beforeEach(() => {
    patterns = new ArchitecturePatterns();
  });

  describe('Pattern Detection', () => {
    it('detects CRUD pattern from code', () => {
      const crudCode = `
        export async function getUser(id: string) { }
        export async function createUser(data) { }
        export async function updateUser(id: string, data) { }
        export async function deleteUser(id: string) { }
      `;
      expect(patterns.detectPattern(crudCode)).toBe('CRUD');
    });

    it('detects Authentication pattern', () => {
      const authCode = `
        export async function login(email: string, password: string) { }
        export async function register(data: RegisterInput) { }
        const token = localStorage.getItem('auth_token');
      `;
      expect(patterns.detectPattern(authCode)).toBe('Authentication');
    });

    it('detects Forms pattern', () => {
      const formCode = `
        import { useForm } from 'react-hook-form';
        import { zodResolver } from '@hookform/resolvers/zod';
        const { formState } = useForm();
      `;
      expect(patterns.detectPattern(formCode)).toBe('Forms');
    });

    it('detects DataFetching pattern', () => {
      const fetchCode = `
        import { useQuery } from '@tanstack/react-query';
        const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
      `;
      expect(patterns.detectPattern(fetchCode)).toBe('DataFetching');
    });

    it('detects StateManagement pattern', () => {
      const stateCode = `
        import { create } from 'zustand';
        const useStore = create((set) => ({ /* ... */ }));
      `;
      expect(patterns.detectPattern(stateCode)).toBe('StateManagement');
    });

    it('detects Notifications pattern', () => {
      const notifCode = `
        import toast from 'react-hot-toast';
        toast.success('User created');
      `;
      expect(patterns.detectPattern(notifCode)).toBe('Notifications');
    });

    it('detects Pagination pattern', () => {
      const paginCode = `
        const { page, limit } = useParams();
        const offset = (page - 1) * limit;
      `;
      expect(patterns.detectPattern(paginCode)).toBe('Pagination');
    });
  });

  describe('Pattern Suggestions', () => {
    it('suggests CRUD pattern for resource management', () => {
      const suggestions = patterns.suggestPatterns('User profile management system');
      const crud = suggestions.find(s => s.pattern === 'CRUD');
      expect(crud).toBeDefined();
      expect(crud?.confidence).toBeGreaterThan(0.8);
    });

    it('suggests Authentication for login feature', () => {
      const suggestions = patterns.suggestPatterns('User login and authentication');
      const auth = suggestions.find(s => s.pattern === 'Authentication');
      expect(auth).toBeDefined();
      expect(auth?.confidence).toBeGreaterThan(0.9);
    });

    it('suggests Forms for form handling', () => {
      const suggestions = patterns.suggestPatterns('Create new user form with validation');
      const forms = suggestions.find(s => s.pattern === 'Forms');
      expect(forms).toBeDefined();
      expect(forms?.confidence).toBeGreaterThan(0.8);
    });

    it('sorts suggestions by confidence', () => {
      const suggestions = patterns.suggestPatterns('Search and filter users');
      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i].confidence).toBeGreaterThanOrEqual(suggestions[i + 1].confidence);
      }
    });
  });

  describe('Pattern Templates', () => {
    it('returns CRUD template', () => {
      const template = patterns.getTemplate('CRUD');
      expect(template).toBeDefined();
      expect(template?.name).toBe('CRUD');
      expect(template?.files.length).toBeGreaterThan(0);
    });

    it('includes schema files in CRUD template', () => {
      const template = patterns.getTemplate('CRUD');
      const schemaFiles = template?.files.filter(f => f.type === 'schema');
      expect(schemaFiles?.length).toBeGreaterThan(0);
    });

    it('includes service files in CRUD template', () => {
      const template = patterns.getTemplate('CRUD');
      const serviceFiles = template?.files.filter(f => f.type === 'service');
      expect(serviceFiles?.length).toBeGreaterThan(0);
    });

    it('includes hook files in CRUD template', () => {
      const template = patterns.getTemplate('CRUD');
      const hookFiles = template?.files.filter(f => f.type === 'hook');
      expect(hookFiles?.length).toBeGreaterThan(0);
    });

    it('includes component files in CRUD template', () => {
      const template = patterns.getTemplate('CRUD');
      const componentFiles = template?.files.filter(f => f.type === 'component');
      expect(componentFiles?.length).toBeGreaterThan(0);
    });

    it('returns all patterns', () => {
      const allPatterns = patterns.getAllPatterns();
      expect(allPatterns.length).toBe(8); // 8 pattern types
    });
  });

  describe('Complexity Estimation', () => {
    it('estimates simple complexity for single simple pattern', () => {
      const complexity = patterns.estimateComplexity(['Pagination']);
      expect(complexity).toBe('simple');
    });

    it('estimates medium complexity for mixed patterns', () => {
      const complexity = patterns.estimateComplexity(['CRUD', 'Forms']);
      expect(complexity).toBe('medium');
    });

    it('estimates complex for multiple complex patterns', () => {
      const complexity = patterns.estimateComplexity(['Authentication', 'StateManagement', 'CRUD']);
      expect(complexity).toBe('complex');
    });
  });

  describe('Architecture Generation', () => {
    it('generates architecture for User CRUD', () => {
      const arch = patterns.generateArchitecture('User', ['CRUD']);
      expect(arch.feature).toBe('User');
      expect(arch.primaryPattern).toBe('CRUD');
      expect(arch.architecture.length).toBeGreaterThan(0);
    });

    it('generates layers for CRUD architecture', () => {
      const arch = patterns.generateArchitecture('User', ['CRUD']);
      const layerNames = arch.architecture.map(l => l.name);
      expect(layerNames).toContain('Schema/Validation');
      expect(layerNames).toContain('Service/API');
    });

    it('includes schema layer files', () => {
      const arch = patterns.generateArchitecture('User', ['CRUD']);
      const schemaLayer = arch.architecture.find(l => l.name === 'Schema/Validation');
      expect(schemaLayer?.files.length).toBeGreaterThan(0);
    });

    it('includes hook layer files', () => {
      const arch = patterns.generateArchitecture('User', ['CRUD']);
      const hookLayer = arch.architecture.find(l => l.name === 'Hooks');
      expect(hookLayer?.files.length).toBeGreaterThan(0);
    });

    it('generates multi-pattern architecture', () => {
      const arch = patterns.generateArchitecture('Post', ['CRUD', 'SearchFilter', 'Pagination']);
      expect(arch.primaryPattern).toBe('CRUD');
      expect(arch.supportingPatterns).toContain('SearchFilter');
      expect(arch.supportingPatterns).toContain('Pagination');
    });

    it('estimates complexity for generated architecture', () => {
      const arch = patterns.generateArchitecture('User', ['CRUD', 'Forms']);
      expect(['simple', 'medium', 'complex']).toContain(arch.complexity);
    });

    it('generates reasonable file count', () => {
      const arch = patterns.generateArchitecture('User', ['CRUD']);
      expect(arch.estimatedFiles).toBeGreaterThan(0);
      expect(arch.estimatedFiles).toBeLessThan(20); // Sanity check
    });
  });

  describe('Template Integration', () => {
    it('template has correct libraries', () => {
      const template = patterns.getTemplate('CRUD');
      expect(template?.libraries).toContain('zod');
      expect(template?.libraries).toContain('@tanstack/react-query');
    });

    it('Authentication template has auth libraries', () => {
      const template = patterns.getTemplate('Authentication');
      expect(template?.libraries).toContain('zustand');
    });

    it('Forms template has form libraries', () => {
      const template = patterns.getTemplate('Forms');
      expect(template?.libraries).toContain('react-hook-form');
      expect(template?.libraries).toContain('zod');
    });
  });
});
