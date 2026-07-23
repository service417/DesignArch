import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { seedWorkers } from '../mock/workers';
import type { Worker } from '../mock/workers';

/**
 * Session store for the workshop roster. Create / update / delete mutate local
 * state so the Workers tab is fully interactive without a backend; swapping in a
 * real API means replacing these method bodies, not the signatures.
 */
interface WorkersStore {
  workers: Worker[];
  addWorker: (worker: Omit<Worker, 'id'>) => void;
  updateWorker: (id: string, patch: Partial<Worker>) => void;
  deleteWorker: (id: string) => void;
}

const Ctx = createContext<WorkersStore | null>(null);

let seq = 0;

export function WorkersProvider({ children }: { children: ReactNode }) {
  const [workers, setWorkers] = useState<Worker[]>(seedWorkers);

  const store = useMemo<WorkersStore>(
    () => ({
      workers,
      addWorker: (worker) =>
        setWorkers((prev) => [{ ...worker, id: `w-new-${++seq}` }, ...prev]),
      updateWorker: (id, patch) =>
        setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w))),
      deleteWorker: (id) => setWorkers((prev) => prev.filter((w) => w.id !== id)),
    }),
    [workers],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useWorkers(): WorkersStore {
  const store = useContext(Ctx);
  if (!store) throw new Error('useWorkers must be used inside WorkersProvider');
  return store;
}
