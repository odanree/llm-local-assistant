import React, { useState, useCallback, ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './Navigation';
import { ROUTES, getAccessibleRoutes, RouteConfig } from '../config/Routes';
import NotFoundPage from '../pages/NotFoundPage';

interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  theme: 'light' | 'dark';
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  children?: ReactNode;
}

/**
 * Layout Component
 * 
 * Extracted from App.tsx to handle:
 * - Main layout structure (header, sidebar, main content, footer)
 * - Route rendering with auth and role checks
 * - Responsive sidebar management
 * - Theme-aware styling
 */
export const Layout: React.FC<LayoutProps> = ({
  user,
  onLogout,
  theme,
  isSidebarOpen,
  onToggleSidebar,
  children,
}) => {
  const renderRoutes = () => {
    return ROUTES.map((route) => {
      if (route.requiresAuth && !user) {
        return (
          <Route
            key={route.path}
            path={route.path}
            element={<Navigate to="/" replace />}
          />
        );
      }

      if (user && !route.roles.includes(user.role)) {
        return (
          <Route
            key={route.path}
            path={route.path}
            element={<Navigate to="/profile" replace />}
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
    });
  };

  return (
    <div className={`app-container ${theme}`} style={{ backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {children}

        <div style={{ display: 'flex', flex: 1 }}>
          {/* Sidebar Navigation */}
          {isSidebarOpen && (
            <Navigation user={user} theme={theme} />
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
              {renderRoutes()}
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
