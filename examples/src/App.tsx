import React, { useState, useCallback } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import Layout from './components/Layout';

/**
 * App Component - Refactored
 * 
 * After decomposition, this component now handles only:
 * - Application state management (user, theme, sidebar)
 * - Authentication logic
 * - Delegating layout and routing to specialized components
 * 
 * Layout, Navigation, and Routes have been extracted to separate concerns.
 */

interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState<string[]>([]);

  const handleLogin = useCallback((username: string, role: 'admin' | 'user' = 'user') => {
    setUser({
      id: Math.random().toString(),
      name: username,
      role,
    });
    setNotifications([`Welcome, ${username}!`]);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setNotifications(['You have been logged out.']);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const dismissNotification = useCallback((index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Router>
      <Layout
        user={user}
        onLogout={handleLogout}
        theme={theme}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderBottom: '1px solid #e0e0e0',
            backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={toggleSidebar}
              style={{
                padding: '0.5rem',
                cursor: 'pointer',
                border: 'none',
                background: 'none',
                fontSize: '1.5rem',
              }}
            >
              ☰
            </button>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>LLM Assistant</h1>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button
                style={{
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  border: 'none',
                  background: theme === 'dark' ? '#3a3a3a' : '#e0e0e0',
                  borderRadius: '4px',
                }}
              >
                🔔 {notifications.length}
              </button>
              {notifications.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.5rem',
                    backgroundColor: theme === 'dark' ? '#2a2a2a' : '#ffffff',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    minWidth: '200px',
                    padding: '0.5rem',
                    zIndex: 10,
                  }}
                >
                  {notifications.map((notification, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '0.5rem',
                        borderBottom: '1px solid #e0e0e0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{notification}</span>
                      <button
                        onClick={() => dismissNotification(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#999',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              style={{
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                border: 'none',
                background: theme === 'dark' ? '#3a3a3a' : '#e0e0e0',
                borderRadius: '4px',
              }}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {/* User menu */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span>{user.name}</span>
                <button
                  onClick={handleLogout}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    border: '1px solid #e0e0e0',
                    background: theme === 'dark' ? '#3a3a3a' : '#ffffff',
                    borderRadius: '4px',
                  }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleLogin('Demo User', 'user')}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    border: 'none',
                    background: '#4CAF50',
                    color: 'white',
                    borderRadius: '4px',
                  }}
                >
                  Login (User)
                </button>
                <button
                  onClick={() => handleLogin('Admin User', 'admin')}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    border: 'none',
                    background: '#2196F3',
                    color: 'white',
                    borderRadius: '4px',
                  }}
                >
                  Login (Admin)
                </button>
              </div>
            )}
          </div>
        </header>
      </Layout>
    </Router>
  );
};

export default App;
