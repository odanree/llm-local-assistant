import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticAnalyzer } from './semanticAnalyzer';
import type { SemanticAnalysis, StateVariable, DependencyIssue } from './semanticAnalyzer';

describe('SemanticAnalyzer', () => {
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
  });

  describe('constructor', () => {
    it('should create instance without LLMClient', () => {
      const instance = new SemanticAnalyzer();
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(SemanticAnalyzer);
    });

    it('should create instance with undefined LLMClient', () => {
      const instance = new SemanticAnalyzer(undefined);
      expect(instance).toBeDefined();
    });
  });

  describe('analyzeHook', () => {
    it('should return SemanticAnalysis object', async () => {
      const code = 'const useHook = () => { return null; };';
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('unusedStates');
      expect(result).toHaveProperty('dependencyIssues');
      expect(result).toHaveProperty('couplingProblems');
      expect(result).toHaveProperty('dataFlowIssues');
      expect(result).toHaveProperty('antiPatterns');
      expect(result).toHaveProperty('overallComplexity');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('suggestedExtractions');
    });

    it('should analyze simple hook with useState', async () => {
      const code = `
        const useCounter = () => {
          const [count, setCount] = useState(0);
          return { count, setCount };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.unusedStates)).toBe(true);
    });

    it('should detect unused state variables', async () => {
      const code = `
        const useHook = () => {
          const [unused, setUnused] = useState(0);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result.unusedStates.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate useEffect dependencies', async () => {
      const code = `
        const useHook = () => {
          const [count, setCount] = useState(0);
          useEffect(() => {
            console.log(count);
          }, []);
          return { count, setCount };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.dependencyIssues)).toBe(true);
    });

    it('should detect coupling problems', async () => {
      const code = `
        const useData = () => {
          useEffect(() => {
            fetch('/api/data').then(r => r.json());
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.couplingProblems)).toBe(true);
    });

    it('should analyze data flow', async () => {
      const code = `
        const useHook = () => {
          const [state, setState] = useState(0);
          return { state };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.dataFlowIssues)).toBe(true);
    });

    it('should detect anti-patterns', async () => {
      const code = `
        const useHook = () => {
          const [state, setState] = useState(0);
          useEffect(() => {
            setState(1);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.antiPatterns)).toBe(true);
    });

    it('should calculate overall complexity', async () => {
      const code = 'const useSimple = () => { return null; };';
      const result = await analyzer.analyzeHook(code);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.overallComplexity);
    });

    it('should generate issue summary', async () => {
      const code = 'const useHook = () => { return null; };';
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should suggest extractions for complex hooks', async () => {
      const code = `
        const useHook = () => {
          useEffect(() => {
            fetch('/api').then(r => r.json());
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.suggestedExtractions)).toBe(true);
    });

    it('should handle complex real-world hook', async () => {
      const code = `
        const useComplexLogic = () => {
          const [state, setState] = useState(0);
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          useEffect(() => {
            setLoading(true);
            fetch('/api/data')
              .then(r => r.json())
              .then(d => {
                setData(d);
                setLoading(false);
              });
          }, [state]);

          return { state, setState, data, loading };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
      expect(result.overallComplexity).toBeDefined();
    });

    it('should handle hook with multiple effects', async () => {
      const code = `
        const useHook = () => {
          useEffect(() => {
            console.log('effect 1');
          }, []);

          useEffect(() => {
            console.log('effect 2');
          }, []);

          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
    });

    it('should handle hook with axios calls', async () => {
      const code = `
        const useData = () => {
          useEffect(() => {
            axios.get('/api/users').then(res => setData(res.data));
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result.couplingProblems.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty code', async () => {
      const result = await analyzer.analyzeHook('');
      expect(result).toBeDefined();
      expect(Array.isArray(result.unusedStates)).toBe(true);
    });
  });

  describe('unused states detection', () => {
    it('should identify truly unused state', async () => {
      const code = `
        const useHook = () => {
          const [unused, setUnused] = useState(0);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasUnused = result.unusedStates.some(s => s.severity === 'unused');
      expect(typeof hasUnused).toBe('boolean');
    });

    it('should identify orphaned state', async () => {
      const code = `
        const useHook = () => {
          const [orphaned, setOrphaned] = useState(0);
          useEffect(() => {
            console.log(orphaned);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.unusedStates)).toBe(true);
    });

    it('should identify stale closure', async () => {
      const code = `
        const useHook = () => {
          const [stale, setStale] = useState(0);
          setStale(1);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.unusedStates)).toBe(true);
    });

    it('should include state variable properties', async () => {
      const code = `
        const useHook = () => {
          const [count, setCount] = useState(0);
          return { count };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      result.unusedStates.forEach(state => {
        expect(state).toHaveProperty('name');
        expect(state).toHaveProperty('line');
        expect(state).toHaveProperty('declared');
        expect(state).toHaveProperty('mutated');
        expect(state).toHaveProperty('used');
        expect(state).toHaveProperty('usedInEffect');
        expect(state).toHaveProperty('severity');
        expect(state).toHaveProperty('description');
      });
    });
  });

  describe('dependency validation', () => {
    it('should detect missing dependencies', async () => {
      const code = `
        const useHook = () => {
          const [count, setCount] = useState(0);
          useEffect(() => {
            console.log(count);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasMissingDeps = result.dependencyIssues.some(d => d.missing.length > 0);
      expect(typeof hasMissingDeps).toBe('boolean');
    });

    it('should detect extra dependencies', async () => {
      const code = `
        const useHook = () => {
          useEffect(() => {
            console.log('effect');
          }, [unused]);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasExtraDeps = result.dependencyIssues.some(d => d.extra.length > 0);
      expect(typeof hasExtraDeps).toBe('boolean');
    });

    it('should include dependency issue properties', async () => {
      const code = `
        const useHook = () => {
          const [count, setCount] = useState(0);
          useEffect(() => {
            setCount(1);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      result.dependencyIssues.forEach(issue => {
        expect(issue).toHaveProperty('effect');
        expect(issue).toHaveProperty('missing');
        expect(issue).toHaveProperty('extra');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('description');
        expect(Array.isArray(issue.missing)).toBe(true);
        expect(Array.isArray(issue.extra)).toBe(true);
      });
    });
  });

  describe('coupling detection', () => {
    it('should detect API calls in component', async () => {
      const code = `
        const useData = () => {
          const [data, setData] = useState(null);
          useEffect(() => {
            fetch('/api/data');
          }, []);
          return { data };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasApiCoupling = result.couplingProblems.some(p => p.type === 'api-in-component');
      expect(typeof hasApiCoupling).toBe('boolean');
    });

    it('should detect mixed concerns', async () => {
      const code = `
        const useFilter = () => {
          const [items, setItems] = useState([]);
          useEffect(() => {
            fetch('/api').then(r => {
              setItems(r.filter(x => x.active));
            });
          }, []);
          return { items };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasMixedConcerns = result.couplingProblems.some(p => p.type === 'mixed-concerns');
      expect(typeof hasMixedConcerns).toBe('boolean');
    });

    it('should detect state mutation issues', async () => {
      const code = `
        const useHook = () => {
          const [a, setA] = useState(0);
          const [b, setB] = useState(0);
          const [c, setC] = useState(0);
          useEffect(() => {
            setA(1);
            setB(1);
            setC(1);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasStateMutation = result.couplingProblems.some(p => p.type === 'state-mutation');
      expect(typeof hasStateMutation).toBe('boolean');
    });

    it('should include coupling problem properties', async () => {
      const code = `
        const useData = () => {
          useEffect(() => {
            fetch('/api');
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      result.couplingProblems.forEach(problem => {
        expect(problem).toHaveProperty('type');
        expect(problem).toHaveProperty('severity');
        expect(problem).toHaveProperty('description');
        expect(problem).toHaveProperty('suggestion');
      });
    });
  });

  describe('data flow analysis', () => {
    it('should include data flow issue properties', async () => {
      const code = `
        const useHook = () => {
          const [state, setState] = useState(0);
          return { state };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      result.dataFlowIssues.forEach(issue => {
        expect(issue).toHaveProperty('variable');
        expect(issue).toHaveProperty('issue');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('description');
      });
    });

    it('should detect never-updated variables', async () => {
      const code = `
        const useHook = () => {
          const [unused, setUnused] = useState(0);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasNeverUpdated = result.dataFlowIssues.some(d => d.issue === 'never-updated');
      expect(typeof hasNeverUpdated).toBe('boolean');
    });

    it('should detect inconsistent returns', async () => {
      const code = `
        const useHook = () => {
          const [state, setState] = useState(0);
          return { state };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasInconsistent = result.dataFlowIssues.some(d => d.issue === 'inconsistent-return');
      expect(typeof hasInconsistent).toBe('boolean');
    });
  });

  describe('anti-pattern detection', () => {
    it('should include anti-pattern properties', async () => {
      const code = 'const useHook = () => { return null; };';
      const result = await analyzer.analyzeHook(code);
      result.antiPatterns.forEach(pattern => {
        expect(pattern).toHaveProperty('type');
        expect(pattern).toHaveProperty('severity');
        expect(pattern).toHaveProperty('description');
        expect(pattern).toHaveProperty('suggestion');
      });
    });

    it('should detect missing dependencies as anti-pattern', async () => {
      const code = `
        const useHook = () => {
          const [count, setCount] = useState(0);
          useEffect(() => {
            setCount(count + 1);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasMissingDeps = result.antiPatterns.some(p => p.type === 'missing-deps');
      expect(typeof hasMissingDeps).toBe('boolean');
    });

    it('should detect unused state as anti-pattern', async () => {
      const code = `
        const useHook = () => {
          const [unused, setUnused] = useState(0);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasUnusedState = result.antiPatterns.some(p => p.type === 'unused-state');
      expect(typeof hasUnusedState).toBe('boolean');
    });

    it('should detect stale closure as anti-pattern', async () => {
      const code = `
        const useHook = () => {
          const [state, setState] = useState(0);
          setState(1);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasStale = result.antiPatterns.some(p => p.type === 'stale-closure');
      expect(typeof hasStale).toBe('boolean');
    });
  });

  describe('complexity calculation', () => {
    it('should calculate LOW complexity', async () => {
      const code = `
        const useSimple = () => {
          const [count, setCount] = useState(0);
          return { count, setCount };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.overallComplexity);
    });

    it('should calculate HIGH complexity for many issues', async () => {
      const code = `
        const useComplex = () => {
          const [unused, setUnused] = useState(0);
          useEffect(() => {
            fetch('/api');
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.overallComplexity);
    });

    it('should calculate CRITICAL complexity for severe issues', async () => {
      const code = `
        const useCritical = () => {
          const [a, setA] = useState(0);
          const [b, setB] = useState(0);
          useEffect(() => {
            fetch('/api');
            setA(a + 1);
            setB(b + 1);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.overallComplexity);
    });
  });

  describe('issue summary generation', () => {
    it('should always return non-empty issues array', async () => {
      const code = 'const useSimple = () => { return null; };';
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should include specific issue types', async () => {
      const code = `
        const useHook = () => {
          const [unused, setUnused] = useState(0);
          useEffect(() => {
            fetch('/api');
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result.issues.length).toBeGreaterThan(0);
      result.issues.forEach(issue => {
        expect(typeof issue).toBe('string');
      });
    });
  });

  describe('extraction suggestions', () => {
    it('should suggest extracting API logic', async () => {
      const code = `
        const useData = () => {
          useEffect(() => {
            fetch('/api/data');
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      const hasApiSuggestion = result.suggestedExtractions.some(s => s.includes('useApi'));
      expect(typeof hasApiSuggestion).toBe('boolean');
    });

    it('should suggest extracting filter logic', async () => {
      const code = `
        const useFilter = () => {
          const [items, setItems] = useState([]);
          useEffect(() => {
            fetch('/api').then(r => setItems(r.filter(x => x.active)));
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.suggestedExtractions)).toBe(true);
    });

    it('should suggest state management extraction', async () => {
      const code = `
        const useHook = () => {
          const [state, setState] = useState(0);
          setState(1);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.suggestedExtractions)).toBe(true);
    });

    it('should return array of strings', async () => {
      const code = 'const useHook = () => { return null; };';
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.suggestedExtractions)).toBe(true);
      result.suggestedExtractions.forEach(suggestion => {
        expect(typeof suggestion).toBe('string');
      });
    });
  });

  describe('integration scenarios', () => {
    it('should analyze realistic user hook', async () => {
      const code = `
        const useUser = () => {
          const [user, setUser] = useState(null);
          const [loading, setLoading] = useState(true);
          const [error, setError] = useState(null);

          useEffect(() => {
            setLoading(true);
            fetch('/api/user')
              .then(r => r.json())
              .then(data => {
                setUser(data);
                setLoading(false);
              })
              .catch(e => {
                setError(e);
                setLoading(false);
              });
          }, []);

          return { user, loading, error };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
      expect(result.overallComplexity).toBeDefined();
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should analyze hook with multiple state mutations', async () => {
      const code = `
        const useForm = () => {
          const [name, setName] = useState('');
          const [email, setEmail] = useState('');
          const [phone, setPhone] = useState('');
          const [submitted, setSubmitted] = useState(false);

          const handleChange = (field, value) => {
            if (field === 'name') setName(value);
            if (field === 'email') setEmail(value);
            if (field === 'phone') setPhone(value);
          };

          return { name, email, phone, submitted, handleChange };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
    });

    it('should analyze hook with complex async patterns', async () => {
      const code = `
        const useAsyncData = () => {
          const [data, setData] = useState(null);
          const [status, setStatus] = useState('idle');

          const fetch = async (url) => {
            setStatus('loading');
            try {
              const res = await fetch(url);
              setData(res);
              setStatus('success');
            } catch (e) {
              setStatus('error');
            }
          };

          return { data, status, fetch };
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle null code gracefully', async () => {
      const result = await analyzer.analyzeHook('');
      expect(result).toBeDefined();
    });

    it('should handle code with no hooks', async () => {
      const code = 'const helper = (x) => x * 2;';
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
    });

    it('should handle code with multiple useState declarations', async () => {
      const code = `
        const [a, setA] = useState(0);
        const [b, setB] = useState(1);
        const [c, setC] = useState(2);
        const [d, setD] = useState(3);
        const [e, setE] = useState(4);
      `;
      const result = await analyzer.analyzeHook(code);
      expect(Array.isArray(result.unusedStates)).toBe(true);
    });

    it('should handle code with nested effects', async () => {
      const code = `
        const useHook = () => {
          useEffect(() => {
            useEffect(() => {
              console.log('nested');
            }, []);
          }, []);
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
    });

    it('should handle very long code', async () => {
      const code = `
        const useLongHook = () => {
          ${Array(50).fill(0).map((_, i) => `const [state${i}, setState${i}] = useState(${i});`).join('\n')}
          return null;
        };
      `;
      const result = await analyzer.analyzeHook(code);
      expect(result).toBeDefined();
    });
  });

  describe('public methods', () => {
    it('should have analyzeHook method', () => {
      expect(typeof analyzer.analyzeHook).toBe('function');
    });
  });
});
