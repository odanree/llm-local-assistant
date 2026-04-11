import { loginSchema } from './schemas/loginSchema';
import { useLoginForm } from './hooks/useLoginForm';
import React from 'react';

const App: React.FC = () => {
  const { formData, errors, handleChange, handleSubmit, loginMutation } = useLoginForm();

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        {/* Email Field */}
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '5px' }}>Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: errors.email ? '1px solid red' : '1px solid #ccc', borderRadius: '4px' }}
          />
          {errors.email && <p style={{ color: 'red', fontSize: '0.85em', marginTop: '5px' }}>{errors.email}</p>}
        </div>

        {/* Password Field */}
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: errors.password ? '1px solid red' : '1px solid #ccc', borderRadius: '4px' }}
          />
          {errors.password && <p style={{ color: 'red', fontSize: '0.85em', marginTop: '5px' }}>{errors.password}</p>}
        </div>

        {/* General Error Display */}
        {errors.general && (
            <p style={{ color: 'red', fontSize: '0.9em', marginBottom: '15px' }}>{errors.general}</p>
        )}

        <button 
            type="submit" 
            disabled={loginMutation.isLoading}
            style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', disabled: true }}
        >
          {loginMutation.isLoading ? 'Logging In...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default App;