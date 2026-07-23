import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProjectsProvider } from './store/projects';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';

export function App() {
  return (
    <ProjectsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/projects/new" element={<CreateProjectPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectsProvider>
  );
}
