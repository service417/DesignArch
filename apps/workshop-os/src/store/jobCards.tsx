import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { defaultProjectId, seedJobCards } from '../mock/jobCards';
import type { JobCard } from '../mock/jobCards';

/**
 * Session store for the Job Cards tab: the star toggle and the selected project
 * live here so they persist while navigating between the list and a detail page.
 * Swapping in a real API means replacing these method bodies, not the shapes.
 */
interface JobCardsStore {
  jobCards: JobCard[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  getCard: (id: string) => JobCard | undefined;
  toggleStar: (id: string) => void;
  addJobCard: (card: Omit<JobCard, 'id'>) => void;
}

const Ctx = createContext<JobCardsStore | null>(null);

let seq = 0;

export function JobCardsProvider({ children }: { children: ReactNode }) {
  const [jobCards, setJobCards] = useState<JobCard[]>(seedJobCards);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);

  const store = useMemo<JobCardsStore>(
    () => ({
      jobCards,
      selectedProjectId,
      setSelectedProjectId,
      getCard: (id) => jobCards.find((c) => c.id === id || c.ref === id),
      toggleStar: (id) =>
        setJobCards((prev) => prev.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c))),
      addJobCard: (card) =>
        setJobCards((prev) => [{ ...card, id: `jc-new-${++seq}` }, ...prev]),
    }),
    [jobCards, selectedProjectId],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useJobCards(): JobCardsStore {
  const store = useContext(Ctx);
  if (!store) throw new Error('useJobCards must be used inside JobCardsProvider');
  return store;
}
