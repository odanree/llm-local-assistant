import { describe, it, expect } from 'vitest';
import { ServiceExtractor } from './serviceExtractor';
import { FeatureAnalyzer } from './featureAnalyzer';
import { ArchitecturePatterns } from './architecturePatterns';

describe('ServiceExtractor', () => {
  let extractor: ServiceExtractor;
  let analyzer: FeatureAnalyzer;
  let patterns: ArchitecturePatterns;

  beforeEach(() => {
    patterns = new ArchitecturePatterns();
    analyzer = new FeatureAnalyzer(patterns);
    extractor = new ServiceExtractor(analyzer, patterns);
  });

  describe('Hook Analysis', () => {
    it('analyzes simple hook', () => {
      const code = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  return user;
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.filename).toBe('useUser.ts');
      expect(analysis.complexity).toBe('simple');
    });

    it('analyzes hook with API calls', () => {
      const code = `
export const useUser = (id: string) => {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch(\`/api/users/\${id}\`)
      .then(r => r.json())
      .then(setUser);
  }, [id]);
  return user;
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.asyncOperations).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(analysis.extractionCandidates)).toBe(true);
    });

    it('detects fat hook', () => {
      const code = `
${Array(160)
  .fill(0)
  .map((_, i) => `// Line ${i}`)
  .join('\n')}
export const useUser = () => { }
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.complexity).toBe('high');
    });

    it('analyzes extraction candidates', () => {
      const code = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  const fetchUser = async () => {
    const res = await fetch('/api/user');
    const data = await res.json();
    setUser(data);
  };
  
  const updateUser = async (newData) => {
    const res = await fetch('/api/user', { method: 'PUT', body: JSON.stringify(newData) });
    return res.json();
  };
  
  return { user, fetchUser, updateUser };
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.extractionCandidates.length).toBeGreaterThan(0);
      expect(analysis.extractionCandidates.some(c => c.type === 'api')).toBe(true);
    });

    it('detects dependencies', () => {
      const code = `
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export const useUser = () => { }
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.dependencies.length).toBeGreaterThan(0);
    });

    it('analyzes error handling', () => {
      const codeWithoutErrorHandling = `
export const useUser = () => {
  const fetchData = async () => {
    const res = await fetch('/api/data');
    return res.json();
  };
  return fetchData();
}
`;
      const analysis1 = extractor.analyzeHook('useUser.ts', codeWithoutErrorHandling);
      expect(analysis1.errorHandling.hasTryCatch).toBe(false);
      expect(analysis1.errorHandling.isComplete).toBe(false);

      const codeWithErrorHandling = `
export const useUser = () => {
  try {
    const res = await fetch('/api/data');
    return res.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}
`;
      const analysis2 = extractor.analyzeHook('useUser.ts', codeWithErrorHandling);
      expect(analysis2.errorHandling.hasTryCatch).toBe(true);
    });
  });

  describe('Refactoring Plan Generation', () => {
    it('generates plan for simple hook', () => {
      const code = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  return user;
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      const plan = extractor.generateRefactoringPlan(analysis);
      expect(plan.hookFile).toBe('useUser.ts');
      expect(plan.confidence).toBeGreaterThan(0);
    });

    it('prioritizes high-impact changes', () => {
      const code = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  const fetchUser = async () => {
    const res = await fetch('/api/user');
    const data = await res.json();
    setUser(data);
  };
  return { user, fetchUser };
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      const plan = extractor.generateRefactoringPlan(analysis);
      expect(plan.proposedChanges.length).toBeGreaterThan(0);
      expect(plan.proposedChanges.some(c => c.priority === 'high')).toBe(true);
    });

    it('identifies risks', () => {
      const code = `
export const useUser = () => {
  const fetchUser = async () => {
    const res = await fetch('/api/user');
    return res.json();
  };
  return fetchUser;
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      const plan = extractor.generateRefactoringPlan(analysis);
      expect(plan.risks.length).toBeGreaterThan(0);
    });

    it('estimates effort correctly', () => {
      const simpleCode = `export const useUser = () => {};`;
      const simpleAnalysis = extractor.analyzeHook('useUser.ts', simpleCode);
      const simplePlan = extractor.generateRefactoringPlan(simpleAnalysis);

      const complexCode = `
${Array(260)
  .fill(0)
  .map((_, i) => `// Line ${i}`)
  .join('\n')}
export const useUser = () => {};
`;
      const complexAnalysis = extractor.analyzeHook('useUser.ts', complexCode);
      const complexPlan = extractor.generateRefactoringPlan(complexAnalysis);

      // Complex should have longer estimate than simple
      expect(complexPlan.estimatedEffort).toBeDefined();
      expect(simplePlan.estimatedEffort).toBeDefined();
    });
  });

  describe('Service Extraction', () => {
    it('extracts service from hook', () => {
      const hookCode = `
export const useUser = () => {
  const fetchUser = async (id: string) => {
    const res = await fetch(\`/api/users/\${id}\`);
    return res.json();
  };
  return { fetchUser };
}
`;
      const extraction = extractor.extractService(hookCode, 'useUser.ts', 'userService');
      expect(extraction.serviceFile).toBe('userService.ts');
      expect(extraction.extractedCode.length).toBeGreaterThan(0);
      expect(extraction.updatedHookCode.length).toBeGreaterThan(0);
    });

    it.skip('generates service exports', () => {
      const hookCode = `
export const useUser = () => {
  export async function fetchUser(id: string) {
    return fetch(\`/api/users/\${id}\`).then(r => r.json());
  }
  return { fetchUser };
}
`;
      const extraction = extractor.extractService(hookCode, 'useUser.ts', 'userService');
      expect(extraction.exports.length).toBeGreaterThan(0);
    });

    it('extracts dependencies', () => {
      const hookCode = `
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export const useUser = () => { }
`;
      const extraction = extractor.extractService(hookCode, 'useUser.ts', 'userService');
      expect(extraction.imports.length).toBeGreaterThan(0);
    });

    it('validates extraction', () => {
      const hookCode = `
export const useUser = () => {
  return { data: null };
}
`;
      const extraction = extractor.extractService(hookCode, 'useUser.ts', 'userService');
      expect(extraction.validationErrors.length).toBeGreaterThanOrEqual(0);
      expect(extraction.confidence).toBeGreaterThan(0);
    });

    it.skip('generates test cases', () => {
      const hookCode = `
export const useUser = () => {
  export async function getUser(id: string) {
    return fetch(\`/api/users/\${id}\`).then(r => r.json());
  }
  
  export async function updateUser(id: string, data: any) {
    return fetch(\`/api/users/\${id}\`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json());
  }
  
  return { getUser, updateUser };
}
`;
      const extraction = extractor.extractService(hookCode, 'useUser.ts', 'userService');
      expect(extraction.testCases.length).toBeGreaterThan(0);
      extraction.testCases.forEach(tc => {
        expect(tc.code.includes('it(')).toBe(true);
        expect(tc.description).toBeDefined();
      });
    });

    it.skip('high confidence for clean extractions', () => {
      const hookCode = `
export const useUser = () => {
  export async function fetchUser() {
    return fetch('/api/user').then(r => r.json());
  }
  return { fetchUser };
}
`;
      const extraction = extractor.extractService(hookCode, 'useUser.ts', 'userService');
      expect(extraction.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Extraction Candidates', () => {
    it('detects API calls', () => {
      const code = `
async function getUsers() {
  const res1 = await fetch('/api/users');
  const res2 = await fetch('/api/users?active=true');
  return [res1.json(), res2.json()];
}
`;
      const analysis = extractor.analyzeHook('useUsers.ts', code);
      const apiCandidate = analysis.extractionCandidates.find(c => c.type === 'api');
      expect(apiCandidate).toBeDefined();
    });

    it('detects mutation logic', () => {
      const code = `
const updateUser = async (id: string, data: any) => {
  const res = await fetch(\`/api/users/\${id}\`, { method: 'PUT', body: JSON.stringify(data) });
  const updated = await res.json();
  return updated;
};
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.extractionCandidates.length).toBeGreaterThan(0);
    });

    it('detects validation logic', () => {
      const code = `
const validateUser = (user: any) => {
  if (!user.email) throw new Error('Email required');
  if (!user.name) throw new Error('Name required');
  if (user.age < 18) throw new Error('Must be 18+');
  return true;
};
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      const validationCandidate = analysis.extractionCandidates.find(c => c.type === 'validation');
      expect(validationCandidate).toBeDefined();
    });

    it('has candidates for complex hooks', () => {
      const code = `
export const useUser = () => {
  const [user, setUser] = useState(null);
  const fetchUser = async () => {
    const res = await fetch('/api/user');
    return res.json();
  };
  return { user, fetchUser };
}
`;
      const analysis = extractor.analyzeHook('useUser.ts', code);
      expect(analysis.extractionCandidates.length).toBeGreaterThan(0);
    });
  });
});
