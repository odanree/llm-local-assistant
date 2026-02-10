import React from 'react';
import HomePage from '../pages/HomePage';
import DashboardPage from '../pages/DashboardPage';
import SettingsPage from '../pages/SettingsPage';
import ProfilePage from '../pages/ProfilePage';
import AnalyticsPage from '../pages/AnalyticsPage';

export interface RouteConfig {
  path: string;
  label: string;
  component: React.ComponentType;
  requiresAuth: boolean;
  roles: string[];
}

/**
 * Centralized route configuration
 * Extracted from App.tsx to separate routing logic from layout concerns
 */
export const ROUTES: RouteConfig[] = [
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

/**
 * Filter routes based on user authentication and role
 */
export function getAccessibleRoutes(user: { role: string } | null): RouteConfig[] {
  return ROUTES.filter((route) => {
    if (route.requiresAuth && !user) return false;
    if (user && !route.roles.includes(user.role)) return false;
    return true;
  });
}
