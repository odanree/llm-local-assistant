import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Navigation } from './Navigation';
import { ROUTES } from '../routes/Routes';

interface LayoutProps {
  isLoggedIn: boolean;
  theme: 'light' | 'dark';
  onLogout: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const Layout = ({ isLoggedIn, theme, onLogout, isSidebarOpen, onToggleSidebar }: LayoutProps) => {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#f4f4f4',
        color: theme === 'dark' ? '#fff' : '#333',
      }}
    >
      {isSidebarOpen && (
        <aside
          style={{
            width: '240px',
            flexShrink: 0,
            transition: 'width 0.2s ease-in-out',
            background: theme === 'dark' ? '#2a2a2a' : '#ffffff',
            borderRight: '1px solid #ddd',
            padding: '1rem 0',
          }}
        >
          <Navigation
            isLoggedIn={isLoggedIn}
            theme={theme}
            onLogout={onLogout}
          />
        </aside>
      )}

      <div
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.2s ease-in-out',
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: '1rem 2rem',
            background: theme === 'dark' ? '#222' : '#fafafa',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onToggleSidebar}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme === 'dark' ? '#fff' : '#333',
              fontSize: '1.5rem',
              padding: '0.5rem',
              display: 'block',
            }}
          >
            0
          </button>
          <h1
            style={{
              fontSize: '1.5rem',
              margin: 0,
              fontWeight: 600,
            }}
          >
            Application Dashboard
          </h1>
          <div
            style={{
              width: '150px',
              display: 'flex',
              gap: '1rem',
            }}
          >
            <button
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #ccc',
                backgroundColor: theme === 'dark' ? '#3c3c3c' : '#eee',
                color: theme === 'dark' ? '#fff' : '#333',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
            >
              Profile
            </button>
            <button
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #ccc',
                backgroundColor: theme === 'dark' ? '#3c3c3c' : '#eee',
                color: theme === 'dark' ? '#fff' : '#333',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main
          style={{
            flexGrow: 1,
            padding: '2rem',
            overflowY: 'auto',
          }}
        >
          <Routes>
            {ROUTES.map((route) => {
              if (route.requiresAuth && !isLoggedIn) {
                return <Navigate to="/" replace key={route.path} />;
              }

              return (
                <Route
                  path={route.path}
                  element={React.createElement(route.component)}
                  key={route.path}
                />
              );
            })}
          </Routes>
        </main>

        {/* Footer */}
        <footer
          style={{
            padding: '1rem 2rem',
            background: theme === 'dark' ? '#222' : '#fafafa',
            borderTop: '1px solid #ddd',
            flexShrink: 0,
          }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: theme === 'dark' ? '#999' : '#666' }}>
            © {new Date().getFullYear()} LLM Assistant. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
};