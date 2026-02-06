# Architecture Rules - Senior Dev Example

> This is an example `.cursorrules` file. Copy to your project root and customize for your team's patterns.

## Code Style
- Always use functional components (React only, no class components)
- Prefer TypeScript strict mode (tsconfig: "strict": true)
- Use Zod for runtime schema validation
- Arrow functions for all function declarations

## Architecture Patterns
- File structure: `/src/{feature}/{component,hooks,types,utils}`
- State management: Zustand (see src/stores/) — never Redux
- Testing: Vitest + React Testing Library
- API layer: TanStack Query with typed hooks

## Component Patterns
- Export component interface as `ComponentNameProps`
- Use `React.memo` for expensive renders
- Always wrap in ErrorBoundary at route level
- Props interface must be exported, not inline

## API & Data Fetching
- All API hooks in `src/hooks/api.ts` only
- Hook naming: `use${Resource}` (e.g., `useUsers()`, `useAuth()`)
- Always use TanStack Query for server state (not useState)
- Include error boundary handling in all API hooks
- Retry strategy: `retry: 2, staleTime: 5min`

## Validation & Types
- Use Zod for all runtime validation
- All schemas in `src/types/schemas.ts` (single source of truth)
- Export types from `src/types/index.ts`
- Never use `any` type (use `unknown` with type guard if needed)

## File Organization
```
src/
  ├── components/
  │   ├── Feature/
  │   │   ├── Feature.tsx (component only)
  │   │   ├── Feature.props.ts (props interface)
  │   │   ├── useFeature.ts (custom hook if needed)
  │   │   └── Feature.test.tsx (tests)
  │   └── Common/
  │       ├── ErrorBoundary.tsx
  │       └── Loading.tsx
  ├── hooks/
  │   ├── api.ts (API hooks only - TanStack Query)
  │   ├── useAuth.ts
  │   └── custom hooks (not API related)
  ├── types/
  │   ├── index.ts (shared types)
  │   └── schemas.ts (Zod schemas)
  ├── stores/ (Zustand stores)
  │   ├── auth.ts
  │   └── ui.ts
  └── utils/
      ├── format.ts
      └── helpers.ts
```

## Error Handling
- Wrap route-level components in ErrorBoundary
- Handle API errors with try/catch in hooks
- Display user-friendly error messages (not stack traces)
- Log errors to monitoring service (Sentry)
- Never silently fail

## Testing
- Use Vitest for unit tests
- Use React Testing Library (not Enzyme)
- Test behavior, not implementation details
- Mock API calls with MSW (Mock Service Worker)
- Aim for >80% coverage on critical paths
- Name test files: `Component.test.tsx`

## Imports & Modules
- No circular imports (use index.ts files)
- Group imports: React → Libraries → Local
- Use path aliases from tsconfig: `@/components`, `@/hooks`, `@/types`
- Avoid `..` imports (use path aliases instead)

## Critical Files (Don't Touch Without Review)
- `src/types/schemas.ts` — All validation schemas (single source of truth)
- `src/middleware/` — Auth, logging, error handling
- `tsconfig.json` — Compiler settings
- `.eslintrc` — Linting rules

## Forbidden Patterns
- ❌ Direct `fetch()` calls (use api.ts hooks)
- ❌ Class components
- ❌ Redux or Context for state (use Zustand)
- ❌ Inline styles (use Tailwind CSS or CSS modules)
- ❌ `any` type (use `unknown` with type guard)
- ❌ Hardcoded environment variables
- ❌ `console.log` in production code (use debug utility)

## Recommended Commands

When using AI assistant, try these prompts:

**Generate Component:**
```
Generate a UserForm component with:
- useForm hook for state
- Zod validation schema
- TanStack Query for API call
- ErrorBoundary wrapped
- PropTypes exported as UserFormProps
```

**Create Hook:**
```
Create useUsers hook that:
- Uses TanStack Query for fetching
- Includes error handling
- Returns { data, isLoading, error }
- Follows src/hooks/api.ts pattern
```

**Refactor Module:**
```
Refactor auth.tsx to:
- Extract useAuth hook
- Use Zustand store instead of Context
- Add proper error handling
- Include unit tests
```

**Add API Endpoint:**
```
Add /api/users endpoint following:
- Node.js/Express pattern
- Zod schema validation
- Proper error responses
- Documented in src/API.md
```

## Example Components

**Good:**
```tsx
// Feature.tsx
import { FC } from 'react';
import { Feature Props } from './Feature.props';
import { useFeature } from './useFeature';

export const Feature: FC<FeatureProps> = ({ id }) => {
  const { data, isLoading, error } = useFeature(id);
  
  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  
  return <div>{data.name}</div>;
};
```

**Bad:**
```tsx
// ❌ DON'T DO THIS
import React, { Component } from 'react';
import fetch from 'node-fetch'; // Direct fetch!

export class Feature extends Component { // Class component!
  componentDidMount() {
    fetch('/api/data').then(/* ... */); // Direct fetch!
  }
  
  render() {
    return <div>{this.state.data}</div>; // No Zod validation!
  }
}
```

---

## How to Use This File

1. Copy this file to your project root as `.cursorrules`
2. Customize patterns for your team
3. Commit to version control
4. LLM Assistant will automatically inject these rules into code generation
5. Update when team patterns change

---

## Questions?

- **What if I disagree with a pattern?** Update this file and commit (team decision)
- **Can I override rules?** Yes, use comments in code or discuss with team
- **How often should this change?** Only when architecture decisions change (infrequently)
