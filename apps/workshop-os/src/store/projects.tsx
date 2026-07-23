import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { seedProjects } from '../mock/projects';
import type { JobCard, Project } from '../mock/projects';

/**
 * A session-scoped store over the mock projects. It exists so the prototype's
 * add / edit / delete / archive actually mutate something visible, without a
 * backend. Everything is plain useState — swapping in a real API is a matter of
 * replacing these method bodies with fetch calls of the same signatures.
 */
interface ProjectsStore {
  projects: Project[];
  getProject: (id: string) => Project | undefined;
  addProject: (project: Omit<Project, 'id'>) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  archiveProject: (id: string) => void;
  addJobCard: (projectId: string, card: JobCard) => void;
  updateJobCard: (projectId: string, card: JobCard) => void;
  deleteJobCard: (projectId: string, cardId: string) => void;
}

const Ctx = createContext<ProjectsStore | null>(null);

let seq = 1000;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(seedProjects);

  const store = useMemo<ProjectsStore>(
    () => ({
      projects,
      getProject: (id) => projects.find((p) => p.id === id),

      addProject: (project) => {
        const id = nextId('project');
        setProjects((prev) => [{ ...project, id }, ...prev]);
        return id;
      },

      updateProject: (id, patch) =>
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))),

      deleteProject: (id) => setProjects((prev) => prev.filter((p) => p.id !== id)),

      archiveProject: (id) =>
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'ARCHIVED' } : p)),
        ),

      addJobCard: (projectId, card) =>
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, jobCards: [...p.jobCards, card] } : p,
          ),
        ),

      updateJobCard: (projectId, card) =>
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, jobCards: p.jobCards.map((c) => (c.id === card.id ? card : c)) }
              : p,
          ),
        ),

      deleteJobCard: (projectId, cardId) =>
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, jobCards: p.jobCards.filter((c) => c.id !== cardId) }
              : p,
          ),
        ),
    }),
    [projects],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useProjects(): ProjectsStore {
  const store = useContext(Ctx);
  if (!store) throw new Error('useProjects must be used inside ProjectsProvider');
  return store;
}
