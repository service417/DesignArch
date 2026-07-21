import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { QueuedStage } from './types';

/**
 * A minimal fetch-on-mount hook with an explicit `reload`.
 *
 * Deliberately not a data-fetching library. Every mutation in this console
 * changes server-side state that other people are also changing — a stage's
 * version, an earning's payment status — so the correct response to a write is
 * always to re-read, never to patch a local cache and hope it matches.
 */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (path === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await api.get<T>(path));
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

export function usePricingQueue() {
  return useResource<QueuedStage[]>('/stages/awaiting-pricing');
}
