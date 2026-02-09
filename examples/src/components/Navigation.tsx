import React from 'react';
import { useAuth } from '../stores/authStore';

export function Navigation() {
  const { user, logout } = useAuth();
  
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">MyApp</Link>
        <div className="navbar-links">
          <Link to="/" className="navbar-link">Home</Link>
          <Link to="/about" className="navbar-link">About</Link>
          <Link to="/contact" className="navbar-link">Contact</Link>
          {user ? (
            <>
              <span className="navbar-user">Hello, {user.name}</span>
              <button onClick={logout} className="navbar-logout">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="navbar-link">Login</Link>
              <Link to="/signup" className="navbar-link">Signup</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}