import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PricingQueuePage } from './pages/PricingQueuePage';
import { StageDetailPage } from './pages/StageDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { EarningsPage } from './pages/EarningsPage';
import { UsersPage } from './pages/UsersPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { JobCardPage } from './pages/JobCardPage';
import { Spinner } from './components/ui';

function Routed() {
  const { user, loading } = useAuth();

  // Without this the app would flash the login screen on every refresh while
  // GET /users/me is still in flight.
  if (loading) return <Spinner label="Loading DesignArc…" />;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pricing" element={<PricingQueuePage />} />
        <Route path="/stages/:id" element={<StageDetailPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/job-cards/:id" element={<JobCardPage />} />
        <Route path="/earnings" element={<EarningsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  );
}
