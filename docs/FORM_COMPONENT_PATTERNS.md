# Form Component Architecture Patterns

This guide helps you add form component rules to your `.lla-rules` file to ensure consistent, type-safe form generation.

## Quick Add to .lla-rules

Copy this section into your project's `.lla-rules` file:

```
## Form Component Patterns
- State Interface: Always create interface for form state (e.g., LoginFormState { email: string, password: string })
- Handler Typing: Type handlers explicitly as FormEventHandler<HTMLFormElement> not generic any
- Consolidator Pattern: Multi-field forms must use handleChange consolidator that updates multiple fields
  Example: const handleChange: FormEventHandler<HTMLFormElement> = (e) => { const { name, value } = e.currentTarget; setFormData(prev => ({ ...prev, [name]: value })); };
- Submit Handler: Always include onSubmit handler, never leave it as callback only
  Example: const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => { e.preventDefault(); // Handle submission };
- Validation: Use Zod schema for all form validation (not inline validators)
- Error States: Track field-level errors in state, display near input
- Form Tag Pattern: Always use <form onSubmit={handleSubmit}> with proper event types
```

## The 7 Rules Explained

### 1️⃣ State Interface
**What**: Every form component needs a typed interface describing its state

**Pattern**:
```tsx
interface LoginFormState {
  email: string;
  password: string;
}
```

**Why**: Enables TypeScript to catch errors when you mistype field names
**Result in Generated Code**: LLM creates explicit interfaces before useState

---

### 2️⃣ Handler Typing
**What**: Form event handlers must be explicitly typed, not use `any`

**Pattern**:
```tsx
const handleChange: FormEventHandler<HTMLFormElement> = (e) => {
  // e.currentTarget is properly typed
};
```

**Why**: Prevents runtime errors from accessing wrong event properties  
**Result in Generated Code**: Handlers look like professional React code

---

### 3️⃣ Consolidator Pattern
**What**: Multi-field forms use a single `handleChange` function that consolidates all field updates

**Pattern**:
```tsx
const handleChange: FormEventHandler<HTMLFormElement> = (e) => {
  const { name, value } = e.currentTarget;
  setFormData(prev => ({ ...prev, [name]: value }));
};

// Then all inputs use: onChange={handleChange}
<input name="email" onChange={handleChange} />
<input name="password" onChange={handleChange} />
```

**Why**: 
- Avoids separate handler for every field (`handleEmailChange`, `handlePasswordChange`, etc.)
- Makes adding new fields trivial
- Reduces code duplication

**Result in Generated Code**: Clean, scalable form components

---

### 4️⃣ Submit Handler
**What**: Forms MUST have an explicit `onSubmit` handler, even if minimal

**Pattern**:
```tsx
// ✅ GOOD: Explicit submit handler
<form onSubmit={handleSubmit}>
  {/* fields */}
</form>

// ❌ BAD: No submit handler  
<form>
  <button type="button" onClick={handleClick}>Submit</button>
</form>
```

**Why**: 
- Allows proper form submission flow (e.preventDefault())
- Follows web standards for accessibility
- Better keyboard support (Enter key in form field submits)

**Result in Generated Code**: Form follows HTML standards

---

### 5️⃣ Zod Validation
**What**: Use Zod schema for validation, not inline validators

**Pattern**:
```tsx
// ✅ GOOD: Zod schema (reusable, portable)
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password too short'),
});

// ❌ BAD: Inline validation (scattered, hard to test)
if (!email.includes('@')) { }
if (password.length < 8) { }
```

**Why**:
- Schema can be shared with backend
- Validation logic in one place
- Easier to test and maintain
- Better error messages

**Result in Generated Code**: Professional validation layer

---

### 6️⃣ Error States
**What**: Track field-level errors and display them near inputs

**Pattern**:
```tsx
const [errors, setErrors] = useState<Record<string, string>>({});

return (
  <>
    <input type="email" name="email" />
    {errors.email && <span className="error">{errors.email}</span>}
  </>
);
```

**Why**: 
- Users see which field failed validation
- Better UX than one generic error message
- Matches modern form patterns

**Result in Generated Code**: User-friendly error handling

---

### 7️⃣ Form Tag Pattern
**What**: Always use `<form>` HTML element with proper typing

**Pattern**:
```tsx
const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
  e.preventDefault();
  // Handle submission
};

return <form onSubmit={handleSubmit}>{/* fields */}</form>;
```

**Why**:
- Semantic HTML (proper accessibility)
- Form submission includes Enter key support
- Browser validation hooks available
- Better dev tools support

**Result in Generated Code**: Accessible, standards-compliant forms

---

## Complete Example

```tsx
import { FormEventHandler, FC, useState } from 'react';
import { z } from 'zod';

// Rule 1: State Interface
interface SignupFormState {
  name: string;
  email: string;
  password: string;
  agreeToTerms: boolean;
}

// Rule 5: Zod Validation Schema
const signupSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
  agreeToTerms: z.boolean().refine(v => v === true, 'Must agree to terms'),
});

export const SignupForm: FC = () => {
  // Rule 1: State Interface
  const [formData, setFormData] = useState<SignupFormState>({
    name: '',
    email: '',
    password: '',
    agreeToTerms: false,
  });

  // Rule 6: Error States
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Rule 2: Handler Typing
  // Rule 3: Consolidator Pattern
  const handleChange: FormEventHandler<HTMLFormElement> = (e) => {
    const { name, value, type, checked } = e.currentTarget as HTMLInputElement;
    const inputValue = type === 'checkbox' ? checked : value;
    setFormData(prev => ({ ...prev, [name]: inputValue }));
    // Clear error when user edits
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Rule 4: Submit Handler
  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    
    try {
      // Rule 5: Zod Validation
      const validated = signupSchema.parse(formData);
      console.log('Form valid, submitting:', validated);
      // API call here
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Rule 6: Track errors
        const newErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          newErrors[err.path[0] as string] = err.message;
        });
        setErrors(newErrors);
      }
    }
  };

  // Rule 7: Form Tag Pattern with proper event handling
  return (
    <form onSubmit={handleSubmit} onChange={handleChange}>
      <input
        type="text"
        name="name"
        value={formData.name}
        placeholder="Name"
      />
      {errors.name && <span className="error">{errors.name}</span>}

      <input
        type="email"
        name="email"
        value={formData.email}
        placeholder="Email"
      />
      {errors.email && <span className="error">{errors.email}</span>}

      <input
        type="password"
        name="password"
        value={formData.password}
        placeholder="Password"
      />
      {errors.password && <span className="error">{errors.password}</span>}

      <label>
        <input
          type="checkbox"
          name="agreeToTerms"
          checked={formData.agreeToTerms}
        />
        I agree to terms
      </label>
      {errors.agreeToTerms && <span className="error">{errors.agreeToTerms}</span>}

      <button type="submit">Sign Up</button>
    </form>
  );
};
```

---

## Using With LLM Local Assistant

### Step 1: Add Rules to .lla-rules
```bash
# In your project root
echo "## Form Component Patterns
- State Interface: Always create interface for form state...
# [paste the rules above]" >> .lla-rules
```

### Step 2: Reload Extension
- Press **F5** in VS Code to reload the LLM Local Assistant extension
- It automatically loads `.lla-rules` from your workspace

### Step 3: Generate Form
```bash
/write src/components/LoginForm.tsx Create a login form with email and password
```

### Step 4: Verify Pattern
The generated form will automatically:
- ✅ Have a `LoginFormState` interface
- ✅ Use `FormEventHandler<HTMLFormElement>` typed handlers
- ✅ Use `handleChange` consolidator
- ✅ Include `onSubmit` handler
- ✅ Use Zod for validation
- ✅ Track field errors separately
- ✅ Use `<form>` with proper structure

---

## Troubleshooting

**Q: LLM generates class component instead of functional?**  
A: Make sure `.lla-rules` is in workspace root and reload (F5)

**Q: Form has separate handler for each field?**  
A: Add to rules: "Multi-field forms must use handleChange consolidator"

**Q: No Zod validation?**  
A: Add to rules: "Use Zod schema for all form validation (not inline validators)"

**Q: Still seeing untyped handlers (`any` type)?**  
A: Add to rules: "Type handlers explicitly as FormEventHandler<HTMLFormElement>"

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) - How .lla-rules injection works
- [CURSORRULES_EXAMPLE.md](./CURSORRULES_EXAMPLE.md) - Complete .lla-rules template
- [LLM Local Assistant Docs](./README.md) - Extension usage guide
