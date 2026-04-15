import React from 'react';
import { Link } from 'react-router-dom';
import { getAccessibleRoutes } from '../routes/Routes';

interface NavigationProps {
  isLoggedIn: boolean;
  theme: 'light' | 'dark';
  onLogout: () => void;
}

export const Navigation = ({ isLoggedIn, theme, onLogout }: NavigationProps) => {
  const accessibleRoutes = getAccessibleRoutes(isLoggedIn);

  return (
    <nav
      style={{
        width: '240px',
        backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f0f0f0',
        padding: '1.5rem 1rem',
        borderRight: `1px solid ${theme === 'dark' ? '#444' : '#ddd'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        minHeight: '100%',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '1.2rem',
          marginBottom: '1rem',
          color: theme === 'dark' ? '#fff' : '#000',
        }}
      >
        LLM Assistant
      </div>

      {accessibleRoutes.map((route) => (
        <Link
          key={route.path}
          to={route.path}
          style={{
            display: 'block',
            padding: '0.5rem 0.75rem',
            borderRadius: '4px',
            textDecoration: 'none',
            color: theme === 'dark' ? '#ccc' : '#333',
            fontSize: '0.95rem',
          }}
        >
          {route.label}
        </Link>
      ))}

      {isLoggedIn && (
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '1rem',
            borderTop: `1px solid ${theme === 'dark' ? '#444' : '#ddd'}`,
          }}
        >
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '0.4rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  );
};