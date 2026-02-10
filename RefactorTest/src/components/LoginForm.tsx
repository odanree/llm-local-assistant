import React, { FormEventHandler } from 'react';
import { useLoginFormStore } from '../stores/useLoginFormStore';

/**
 * LoginForm Component - Refactored to Use Zustand
 * 
 * This component has been refactored from local useState to use the
 * centralized Zustand store (useLoginFormStore).
 * 
 * What Changed:
 * ❌ Removed: Three separate useState hooks (formData, errors, etc.)
 * ✅ Added: Single useLoginFormStore hook call
 * 
 * All state is now managed through the store:
 * - formData: { email, password }
 * - errors: Field-level validation errors  
 * - handleChange: Processes input changes and clears errors
 * - handleSubmit: Validates and submits the form
 * - reset: Clears form and errors
 */

export const LoginForm: React.FC = () => {
  // Destructure ALL state and actions from the Zustand store
  // This replaces multiple useState hooks
  const { formData, errors, setFormData, setErrors, handleChange, handleSubmit, reset } =
    useLoginFormStore();

  // Reset handler
  const handleReset: FormEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    reset();
  };

  return (
    <form onSubmit={handleSubmit} onChange={handleChange} className="login-form">
      <div className="form-group">
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          type="email"
          name="email"
          value={formData.email}
          placeholder="user@example.com"
          required
          className={`form-input ${errors.email ? 'has-error' : ''}`}
        />
        {errors.email && <span className="error-message">{errors.email}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="password">Password:</label>
        <input
          id="password"
          type="password"
          name="password"
          value={formData.password}
          placeholder="••••••••"
          required
          className={`form-input ${errors.password ? 'has-error' : ''}`}
        />
        {errors.password && <span className="error-message">{errors.password}</span>}
      </div>

      <div className="form-actions">
        <button type="submit" className="submit-button">
          Login
        </button>
        <button type="reset" onClick={handleReset} className="reset-button">
          Clear
        </button>
      </div>
    </form>
  );
};

export default LoginForm;
