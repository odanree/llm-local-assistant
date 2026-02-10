import { useAuth } from '../stores/authStore';
import Home from '../pages/Home';
import About from '../pages/About';
import Contact from '../pages/Contact';
import Dashboard from '../pages/Dashboard';
import Login from '../pages/Login';
import Signup from '../pages/Signup';

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { user } = useAuth();
  if (!user) {
    return <Login />;
  }
  return children;
};

const PublicRoute = ({ children }: { children: JSX.Element }) => {
  const { user } = useAuth();
  if (user) {
    return <Dashboard />;
  }
  return children;
};

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <PublicRoute>
        <Home />
      </PublicRoute>
    ),
  },
  {
    path: '/about',
    element: (
      <PublicRoute>
        <About />
      </PublicRoute>
    ),
  },
  {
    path: '/contact',
    element: (
      <PublicRoute>
        <Contact />
      </PublicRoute>
    ),
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <Login />
      </PublicRoute>
    ),
  },
  {
    path: '/signup',
    element: (
      <PublicRoute>
        <Signup />
      </PublicRoute>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}