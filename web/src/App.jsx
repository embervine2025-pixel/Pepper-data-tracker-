import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import SignIn from './pages/SignIn.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Plants from './pages/Plants.jsx';
import PlantDetail from './pages/PlantDetail.jsx';
import PlantForm from './pages/PlantForm.jsx';
import Lineage from './pages/Lineage.jsx';
import Crosses from './pages/Crosses.jsx';
import CrossForm from './pages/CrossForm.jsx';
import Pods from './pages/Pods.jsx';
import PodForm from './pages/PodForm.jsx';
import Sharing from './pages/Sharing.jsx';
import Settings from './pages/Settings.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session" />;
  // Remember where they were headed so sign-in can send them back.
  if (!user) return <Navigate to="/sign-in" state={{ from: location }} replace />;
  return children;
}

function RedirectIfSignedIn({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session" />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/sign-in"
        element={
          <RedirectIfSignedIn>
            <SignIn />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfSignedIn>
            <Register />
          </RedirectIfSignedIn>
        }
      />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="plants" element={<Plants />} />
        <Route path="plants/new" element={<PlantForm />} />
        <Route path="plants/:id" element={<PlantDetail />} />
        <Route path="plants/:id/edit" element={<PlantForm />} />
        <Route path="plants/:id/lineage" element={<Lineage />} />
        <Route path="crosses" element={<Crosses />} />
        <Route path="crosses/new" element={<CrossForm />} />
        <Route path="pods" element={<Pods />} />
        <Route path="pods/new" element={<PodForm />} />
        <Route path="sharing" element={<Sharing />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
