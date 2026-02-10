import { create } from 'zustand';
import { z } from 'zod';

/**
 * Login Form State Interface
 * Defines the structure of form data
 */
interface LoginFormState {
  email: string;
  password: string;
}

/**
 * Login Form Store - Complete Zustand store for login form state management
 * 
 * This store is the refactored version replacing local useState hooks.
 * It demonstrates proper centralized state management with:
 * - Form state (formData)
 * - Validation errors (errors) 
 * - State setters (setFormData, setErrors)
 * - Event handlers (handleChange, handleSubmit)
 * - Reset functionality (reset)
 */

// Zod validation schema for form validation
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

interface LoginFormStore {
  // State properties
  formData: LoginFormState;
  errors: Record<string, string>;

  // State setters
  setFormData: (updates: Partial<LoginFormState>) => void;
  setErrors: (errors: Record<string, string>) => void;

  // Event handlers
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;

  // Reset function
  reset: () => void;
}

/**
 * useLoginFormStore
 * 
 * Zustand store for login form state management
 * All form state is centralized here instead of scattered in component local state
 */
export const useLoginFormStore = create<LoginFormStore>((set) => ({
  // Initial state
  formData: {
    email: '',
    password: '',
  },
  errors: {},

  // Setter: Update form data
  setFormData: (updates) =>
    set((state) => ({
      formData: { ...state.formData, ...updates },
    })),

  // Setter: Update validation errors
  setErrors: (errors) =>
    set({
      errors,
    }),

  // Handler: Process form input changes
  // Automatically clears errors when user starts typing
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    set((state) => {
      const newFormData = { ...state.formData, [name]: value };
      // Clear error for this field when user starts typing
      const newErrors = { ...state.errors };
      if (newErrors[name]) {
        delete newErrors[name];
      }
      return {
        formData: newFormData,
        errors: newErrors,
      };
    });
  },

  // Handler: Process form submission with validation
  // Validates form data using Zod schema
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    set((state) => {
      try {
        // Validate form data using Zod
        const validated = loginSchema.parse(state.formData);
        console.log('Form valid, submitting:', validated);
        // Clear errors on successful validation
        return { errors: {} };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const newErrors: Record<string, string> = {};
          error.errors.forEach((err) => {
            const field = err.path[0] as string;
            newErrors[field] = err.message;
          });
          return { errors: newErrors };
        }
        return state;
      }
    });
  },

  // Reset form to initial state
  reset: () =>
    set({
      formData: { email: '', password: '' },
      errors: {},
    }),
}));
