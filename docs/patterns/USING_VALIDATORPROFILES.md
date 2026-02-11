# Using ValidatorProfiles in Your Code

Quick reference for integrating the new rule-based validation system.

## For LLM Prompt Generation

### Basic Example
```typescript
import { PromptEngine } from './services/PromptEngine';

const context = {
  userRequest: 'Create a Button component that is accessible and extensible',
  workspaceName: 'MyProject',
  customConstraints: [
    'Must support forwardRef for parent usage',
  ],
};

const prompt = PromptEngine.buildGenerationPrompt(context);
// Now pass `prompt` to your LLM API
```

### What Gets Injected Automatically
PromptEngine will:
1. ✅ Detect that "Button component" matches COMPONENT_PROPS + COMPONENT_EXTENSIBILITY
2. ✅ Inject forbidden patterns (e.g., "no Zod for simple props")
3. ✅ Inject required patterns (e.g., "className?: string" prop)
4. ✅ Add accessibility guidance for interactive components
5. ✅ Include reference code examples if provided

### With Reference Code
```typescript
const context = {
  userRequest: 'Create Button like the Link component',
  existingCodeSamples: [
    `
    interface LinkProps {
      href: string;
      className?: string;
    }
    
    export const Link: React.FC<LinkProps> = ({ href, className }) => (
      <a href={href} className={className} />
    );
    `
  ],
};

const prompt = PromptEngine.buildGenerationPrompt(context);
```

### Legacy Compatibility (RefactoringExecutor)
```typescript
const result = PromptEngine.hydratePrompt({
  filePath: 'src/components/Button.tsx',
  fileDescription: 'Create a reusable Button component',
  basePrompt: existingPrompt,
});

console.log(`Applied rules: ${result.appliedRules.join(', ')}`);
// Output: Applied rules: component_props, component_extensibility
```

---

## For Code Validation

### Basic Example
```typescript
import { SemanticValidator } from './semanticValidator';

const validator = new SemanticValidator();
const code = `
  interface ButtonProps {
    className?: string;
  }
  
  import { clsx } from 'clsx';
  
  export const Button: React.FC<ButtonProps> = ({ className }) => (
    <button className={clsx('px-4', className)} />
  );
`;

const errors = validator.validateCode(code);
// errors = [] (no violations)
```

### Understanding Errors
```typescript
const badCode = `
  import React from 'react';
  export const logValue = (val: any) => console.log(val);
`;

const errors = validator.validateCode(badCode);

errors.forEach(error => {
  console.log(`[${error.ruleId}] ${error.message}`);
  console.log(`Line ${error.line}: ${error.fix}`);
});

// Output:
// [logic_no_react] [Logic Layer - No React Imports] ...
// Line 1: Remove code matching: /import\s+.*\bReact\b/
// [strict_typing] [Type Safety - No Any/Unknown] ...
// Line 2: Replace "any" with explicit interface types
```

### See Which Rules Applied
```typescript
const componentCode = `
  interface ButtonProps {
    children: React.ReactNode;
  }
  
  export const Button: React.FC<ButtonProps> = ({ children }) => (
    <button>{children}</button>
  );
`;

const profiles = validator.getApplicableProfiles(componentCode);

profiles.forEach(p => {
  console.log(`✓ ${p.name} (${p.id})`);
  console.log(`  Severity: ${p.severity}`);
  console.log(`  ${p.description}`);
});

// Output:
// ✓ Component Props - TypeScript Interfaces (component_props)
//   Severity: error
//   React components must define props with TypeScript interfaces...
```

---

## For Planner Integration

### Detecting Applicable Profiles
```typescript
import { getApplicableProfiles } from './services/ValidatorProfiles';

// When user says: "Create a Button component"
// Planner can infer which profiles will apply:

const exampleCode = 'React.FC<Props> interface ButtonProps';
const profiles = getApplicableProfiles(exampleCode);

console.log(`Profiles that will be enforced:`);
profiles.forEach(p => {
  console.log(`  - ${p.id}: ${p.message}`);
});
```

### Explicit Profile Selection (Future Enhancement)
```typescript
// The Planner could explicitly list profiles:
const plan = {
  task: 'Create Button component',
  appliedProfiles: [
    'component_props',
    'component_extensibility', 
    'component_accessibility',
  ],
  steps: [
    // ...
  ],
};

// Then PromptEngine would ONLY inject these profiles
const context = {
  userRequest: plan.task,
  appliedProfiles: plan.appliedProfiles, // To be implemented
};
```

---

## Profile Definitions

### How to Read a ValidatorProfile

```typescript
{
  id: 'component_props',  // Unique identifier for this rule
  name: 'Component Props - TypeScript Interfaces',  // Display name
  description: 'React components must define props with TS interfaces (not Zod)',
  
  selector: (content) => {
    // This rule applies if content matches these patterns:
    return content.includes('React.FC') && content.includes('interface');
  },
  
  forbidden: [
    /const\s+\w+Props\s*=\s*z\.object/,  // z.object for simple component props
  ],
  
  required: [
    /interface\s+\w+Props/,  // Must define Props interface
  ],
  
  message: 'Components must define props with TypeScript interfaces...',
  severity: 'error',  // Hard requirement
  suppressLinterIds: ['zod-suggestion'],  // Ignore linters suggesting Zod
}
```

---

## Common Patterns

### Pattern 1: Validate Generated Code
```typescript
// After LLM generates code:
const validator = new SemanticValidator();
const errors = validator.validateCode(generatedCode);

if (errors.length > 0) {
  console.log('Generated code has violations:');
  errors.forEach(e => {
    if (e.severity === 'error') {
      // Hard failure - regenerate
    } else if (e.severity === 'warn') {
      // Soft warning - might still be acceptable
    }
  });
} else {
  console.log('Code passes all rules! ✅');
}
```

### Pattern 2: Guide LLM Before Generation
```typescript
// Identify what rules will apply:
const context = {
  userRequest: userInput,
  existingCodeSamples: [exemplarCode],
};

// Get LLM-friendly prompt:
const prompt = PromptEngine.buildGenerationPrompt(context);

// Send to LLM with this prompt prefix
const fullPrompt = `${systemPrompt}\n\n${prompt}\n\nUser: ${userInput}`;
```

### Pattern 3: Error Recovery
```typescript
let code = await generateCode(prompt);
let errors = validator.validateCode(code);

let attempts = 0;
while (errors.some(e => e.severity === 'error') && attempts < 3) {
  const failureContext = `
    Generated code had violations:
    ${errors.map(e => `- ${e.message}`).join('\n')}
    
    Suggestions:
    ${errors.map(e => `- ${e.fix}`).join('\n')}
  `;
  
  code = await generateCode(prompt + '\n' + failureContext);
  errors = validator.validateCode(code);
  attempts++;
}

if (errors.length === 0) {
  console.log('Success after retries! ✅');
}
```

---

## FAQ

**Q: How do I add a new rule?**  
A: Add a new entry to `VALIDATOR_PROFILES` in `ValidatorProfiles.ts`. Give it a unique ID, selector, forbidden/required patterns, and message.

**Q: Can rules be combined?**  
A: Yes! Multiple rules can apply to the same code. The validator checks all applicable rules and reports all violations.

**Q: What if a rule doesn't apply to my code?**  
A: The selector determines when a rule is applied. If the selector returns false, that rule is skipped (no errors).

**Q: How do I suppress a rule?**  
A: Modify the selector logic or add linter suppression IDs to `suppressLinterIds` array.

**Q: Can I have custom rules?**  
A: Yes! Create your own ValidatorProfile objects and apply them. The system is extensible.

---

## Architecture Benefits

1. **Single Source of Truth** - Rules defined once, used by both LLM and validator
2. **Predictable Output** - LLM sees the same rules it will be validated against
3. **Easy to Debug** - Clear error messages with rule IDs
4. **Maintainable** - Rules are declarative, not algorithmic
5. **Context-Aware** - Different rules for different code types

---

## Next Steps

1. **Now:** Use PromptEngine to guide LLM generation
2. **Soon:** Update Planner to leverage explicit profile selection
3. **Later:** ML-based profile inference from requirements
4. **Future:** Profile composition and rule combinations

Happy coding! 🚀
