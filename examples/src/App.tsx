import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import useAuthStore from './stores/authStore';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import AnalyticsPage from './pages/AnalyticsPage';
import NotFoundPage from './pages/NotFoundPage';

// ─── Route Configuration ──────────────────────────────────────────────────────
// TODO: Extract to src/config/Routes.ts

interface RouteConfig {
  path: string;
  label: string;
  component: React.ComponentType;
  requiresAuth: boolean;
  roles: string[];
}

const ROUTES: RouteConfig[] = [
  {
    path: '/',
    label: 'Home',
    component: HomePage,
    requiresAuth: false,
    roles: ['user', 'admin'],
  },
  {
    path: '/dashboard',
    label: 'Dashboard',
    component: DashboardPage,
    requiresAuth: true,
    roles: ['user', 'admin'],
  },
  {
    path: '/settings',
    label: 'Settings',
    component: SettingsPage,
    requiresAuth: true,
    roles: ['admin'],
  },
  {
    path: '/profile',
    label: 'Profile',
    component: ProfilePage,
    requiresAuth: true,
    roles: ['user', 'admin'],
  },
  {
    path: '/analytics',
    label: 'Analytics',
    component: AnalyticsPage,
    requiresAuth: true,
    roles: ['admin'],
  },
];

function getAccessibleRoutes(isLoggedIn: boolean): RouteConfig[] {
  return ROUTES.filter((route) => {
    if (route.requiresAuth && !isLoggedIn) return false;
    return true;
  });
}

// ─── Navigation Component ─────────────────────────────────────────────────────
// TODO: Extract to src/components/Navigation.tsx

interface AppNavigationProps {
  isLoggedIn: boolean;
  theme: 'light' | 'dark';
  onLogout: () => void;
}

const AppNavigation: React.FC<AppNavigationProps> = ({ isLoggedIn, theme, onLogout }) => {
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

// ─── Layout Component ─────────────────────────────────────────────────────────
// TODO: Extract to src/components/Layout.tsx

interface AppLayoutProps {
  isLoggedIn: boolean;
  theme: 'light' | 'dark';
  onLogout: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  isLoggedIn,
  theme,
  onLogout,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const renderRoutes = () => {
    return ROUTES.map((route) => {
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
    });
  };

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
            <AppNavigation isLoggedIn={isLoggedIn} theme={theme} onLogout={onLogout} />
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

// ─── App Root ─────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const { isLoggedIn, logout } = useAuthStore();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <BrowserRouter>
      <div style={{ position: 'fixed', top: '0.5rem', right: '0.75rem', zIndex: 100 }}>
        <button
          onClick={handleToggleTheme}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            cursor: 'pointer',
            backgroundColor: theme === 'dark' ? '#444' : '#fff',
            color: theme === 'dark' ? '#fff' : '#000',
            fontSize: '0.85rem',
          }}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </div>
      <AppLayout
        isLoggedIn={isLoggedIn}
        theme={theme}
        onLogout={handleLogout}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
      />
    </BrowserRouter>
  );
};

export default App;