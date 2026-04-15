import React, { useState, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import useAuthStore from './stores/authStore';
import { Layout } from './components/Layout';

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
      <Layout
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