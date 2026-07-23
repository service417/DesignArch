import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProjectsProvider } from './store/projects';
import { JobCardsProvider } from './store/jobCards';
import { WorkersProvider } from './store/workers';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { JobCardsListPage } from './pages/JobCardsListPage';
import { JobCardDetailPage } from './pages/JobCardDetailPage';
import { WorkersPage } from './pages/WorkersPage';

export function App() {
  return (
    <ProjectsProvider>
      <JobCardsProvider>
        <WorkersProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsListPage />} />
              <Route path="/projects/new" element={<CreateProjectPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/job-cards" element={<JobCardsListPage />} />
              <Route path="/job-cards/:id" element={<JobCardDetailPage />} />
              <Route path="/workers" element={<WorkersPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </WorkersProvider>
      </JobCardsProvider>
    </ProjectsProvider>
  );
}
