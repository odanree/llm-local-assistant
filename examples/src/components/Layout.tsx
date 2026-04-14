import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './Navigation';
import { ROUTES } from '../config/Routes';
import NotFoundPage from '../pages/NotFoundPage';

interface LayoutProps {
  isLoggedIn: boolean;
  theme: 'light' | 'dark';
  onLogout: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const Layout: React.FC<LayoutProps> = ({
  isLoggedIn,
  theme,
  onLogout,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  return (
    <div
      className={`app-container ${theme}`}
      style={{ backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1.5rem',
            borderBottom: `1px solid ${theme === 'dark' ? '#444' : '#ddd'}`,
            backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
          }}
        >
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}
          >
            ☰
          </button>
          <span style={{ fontWeight: 600, color: theme === 'dark' ? '#fff' : '#000' }}>
            Dashboard
          </span>
        </header>

        <div style={{ display: 'flex', flex: 1 }}>
          {/* Sidebar */}
          {isSidebarOpen && (
            <Navigation isLoggedIn={isLoggedIn} theme={theme} onLogout={onLogout} />
          )}

          {/* Main content */}
          <main
            style={{
              flex: 1,
              padding: '2rem',
              backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
              color: theme === 'dark' ? '#ffffff' : '#000000',
            }}
          >
            <Routes>
              {ROUTES.map((route) => {
                if (route.requiresAuth && !isLoggedIn) {
                  return (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={<Navigate to="/" replace />}
                    />
                  );
                }
                return (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<route.component />}
                  />
                );
              })}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>

        {/* Footer */}
        <footer
          style={{
            padding: '1rem',
            borderTop: '1px solid #e0e0e0',
            backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
            textAlign: 'center',
            fontSize: '0.9rem',
            color: theme === 'dark' ? '#aaa' : '#666',
          }}
        >
          <p>© 2024 LLM Assistant. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
