import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AdminPage from './pages/AdminPage';
import DriverPage from './pages/DriverPage';

function PrivateRoute({ role, children }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Carregando...</div>;
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (role && profile.role !== role) {
    // entregador tentando ver tela de admin (ou vice-versa) -> manda pra tela certa
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/entregas'} replace />;
  }

  return children;
}

export default function App() {
  const { profile, session } = useAuth();

  function HomeRedirect() {
    if (!session) return <Navigate to="/login" replace />;
    return <Navigate to={profile?.role === 'admin' ? '/admin' : '/entregas'} replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<SignupPage />} />

      <Route
        path="/admin"
        element={
          <PrivateRoute role="admin">
            <AdminPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/entregas"
        element={
          <PrivateRoute role="driver">
            <DriverPage />
          </PrivateRoute>
        }
      />

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
