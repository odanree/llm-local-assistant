# Architecture Rules Integration Guide

## For v3.0: Integrating Pre-Flight Checks into Plan Generation

This document explains how to integrate the `.lla-rules` and `ArchitectureValidator` into the Planner to enforce code quality gates before generating execution plans.

## Current State

**v2.5.0:**
- Planner generates plans directly
- No pre-flight validation
- No architecture rule enforcement
- Quality depends entirely on LLM training

**v3.0 Target:**
- Planner performs pre-flight check first
- Validates task against applicable rules
- Outputs pre-flight check to user
- Then generates plan following those rules

## Implementation Steps

### Step 1: Update Planner.generatePlan()

```typescript
import { architectureValidator, PreFlightCheckResult } from '../validators/architectureValidator';

async generatePlan(userRequest: string): Promise<TaskPlan> {
  try {
    // STEP 0: Pre-flight check (NEW)
    const taskType = this.detectTaskType(userRequest);
    const preFlightResult = architectureValidator.preFlightCheck(
      userRequest,
      taskType
    );
    
    console.log('Pre-flight check output:');
    console.log(preFlightResult.output);
    
    if (!preFlightResult.approved) {
      throw new Error(
        `Pre-flight check failed. Rules violated: ${preFlightResult.violations.map(v => v.rule).join(', ')}`
      );
    }
    
    // STEP 1: System prompt includes rules (NEW)
    const systemPrompt = this.buildSystemPromptWithRules(preFlightResult);
    
    // STEP 2: Generate plan (existing)
    const response = await this.llmClient.generatePlan(
      userRequest,
      systemPrompt
    );
    
    // STEP 3: Parse and validate steps (existing)
    const plan = this.parsePlanResponse(response);
    return plan;
  } catch (err) {
    throw new Error(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

### Step 2: Detect Task Type

```typescript
private detectTaskType(request: string): 'component' | 'utility' | 'form' | 'logic' {
  const lower = request.toLowerCase();
  
  if (lower.includes('form') || lower.includes('input') || lower.includes('validation')) {
    return 'form';
  }
  
  if (lower.includes('component') || lower.includes('button') || lower.includes('ui')) {
    return 'component';
  }
  
  if (lower.includes('utility') || lower.includes('function') || lower.includes('helper')) {
    return 'utility';
  }
  
  return 'logic';
}
```

### Step 3: Build System Prompt with Rules

```typescript
private buildSystemPromptWithRules(preFlightResult: PreFlightCheckResult): string {
  let prompt = `
You are a code generation assistant. Before generating code, you MUST follow these architecture rules:

${preFlightResult.output}

## Applicable Architecture Rules

${preFlightResult.applicableRules.map(rule => `- ${rule}`).join('\n')}

## Key Requirements

1. **Logic/UI Separation**: Keep business logic in src/, UI in src/components/
2. **Component Props**: Use TypeScript interface/type, NOT Zod (except forms)
3. **Styling**: Always accept className?: string and use clsx/twMerge
4. **Accessibility**: Interactive elements need type, disabled, aria-label attributes
5. **Testability**: Logic must be testable and pure

Generate code that follows these rules. If you must deviate, explain why.
`;
  
  return prompt;
}
```

### Step 4: Output Pre-Flight to User

When integrating with the webview, output the pre-flight check:

```typescript
async generatePlan(userRequest: string, onPreFlightCheck?: (check: string) => void): Promise<TaskPlan> {
  const preFlightResult = architectureValidator.preFlightCheck(userRequest, taskType);
  
  // Send pre-flight output to UI
  if (onPreFlightCheck) {
    onPreFlightCheck(preFlightResult.output);
  }
  
  // Then generate plan...
}
```

## Example: Adding a Button Component

**User Request:** "Create a reusable Button component"

**Pre-Flight Check Output:**
```
Pre-flight check: component task
- Logic/UI separation? Yes (component in src/components)
- Component prop typing? interface (not Zod)
- Accessibility required? Yes (interactive element)
- Styling extensibility? Yes (className prop required)
- Must include: type, disabled, aria-label attributes
- Must use: clsx for className merging

Deviations: None
Plan: ✅ Approved
```

**System Prompt Includes:**
- Rules for component props (use interface, not Zod)
- Rules for accessibility (type, disabled, aria-label)
- Rules for styling (className?: string, clsx)

**Generated Component:**
```typescript
import clsx from 'clsx';

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  onClick,
  children,
  type = 'button',
  disabled = false,
  className,
  ariaLabel,
}) => (
  <button
    type={type}
    disabled={disabled}
    aria-label={ariaLabel}
    onClick={onClick}
    className={clsx('px-4 py-2 rounded bg-blue-500 text-white', className)}
  >
    {children}
  </button>
);
```

✅ Follows all rules automatically!

## Example: Adding a Form Component

**User Request:** "Create a login form with validation"

**Pre-Flight Check Output:**
```
Pre-flight check: form task
- Logic/UI separation? Yes
- Component prop typing? Zod (exception: form validation)
- Accessibility required? Yes
- Styling extensibility? Yes

Deviations: Using Zod for form data validation (exception to rule #2)
Justification: Form validation is data-critical, Zod provides runtime type safety
Plan: ✅ Approved
```

**System Prompt Includes:**
- Exception note: Zod is allowed for form validation
- Form validation requirements
- Accessibility requirements

**Generated Form:**
```typescript
import { z } from 'zod';
import clsx from 'clsx';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

interface LoginFormProps {
  onSubmit: (data: z.infer<typeof loginSchema>) => void;
  className?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit, className }) => {
  // Form logic with Zod validation...
};
```

✅ Exception justified, follows all other rules!

## Benefits of Pre-Flight Checks

1. **LLM Knows the Rules**: System prompt includes all applicable rules
2. **User Sees the Plan**: Pre-flight output is visible in UI
3. **Clear Expectations**: User knows what rules apply to this task
4. **Automatic Compliance**: LLM generates code following rules
5. **Justified Exceptions**: Deviations are explained (e.g., Zod for forms)

## Testing Architecture Rules

```typescript
// In planner.test.ts
describe('Planner with Architecture Rules', () => {
  it('should output pre-flight check before plan', async () => {
    const preFlightChecks: string[] = [];
    
    await planner.generatePlan('Create a Button component', (check) => {
      preFlightChecks.push(check);
    });
    
    expect(preFlightChecks.length).toBeGreaterThan(0);
    expect(preFlightChecks[0]).toContain('Pre-flight check');
    expect(preFlightChecks[0]).toContain('interface');
    expect(preFlightChecks[0]).toContain('accessibility');
  });
  
  it('should handle form exceptions', async () => {
    const result = architectureValidator.preFlightCheck(
      'Create a login form',
      'form'
    );
    
    expect(result.applicableRules).toContain('Component Props Typing (Zod allowed)');
  });
});
```

## Summary

**v2.5.0:** No pre-flight validation, quality depends on LLM
**v3.0:** Pre-flight checks enforce architecture rules, consistent code quality

This integration moves code generation from ad-hoc to rule-based, improving consistency and quality automatically.
