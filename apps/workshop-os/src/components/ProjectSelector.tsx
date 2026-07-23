import { useMemo, useState } from 'react';
import { ChevronDown, FolderClosed, Search } from 'lucide-react';
import { jcProjects } from '../mock/jobCards';
import { useJobCards } from '../store/jobCards';

/**
 * The focal control of the Job Cards list: a large green-tinted button showing
 * the project being viewed, opening a searchable menu that re-scopes the whole
 * list. Deliberately bigger and more prominent than the filter inputs beneath
 * it, because switching project is the primary action on this screen.
 */
export function ProjectSelector() {
  const { jobCards, selectedProjectId, setSelectedProjectId } = useJobCards();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const countFor = (projectId: string) =>
    jobCards.filter((c) => c.projectId === projectId).length;

  const selected = jcProjects.find((p) => p.id === selectedProjectId) ?? jcProjects[0];

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return jcProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="relative w-full max-w-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 rounded-2xl border border-forest/25 bg-pill-green/60 px-5 py-4 text-left shadow-soft ring-1 ring-forest/5 transition hover:bg-pill-green"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-forest text-white">
          <FolderClosed size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-lg font-bold tracking-tight text-ink">{selected.name}</span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-forest">
              {countFor(selected.id)} cards
            </span>
          </span>
          <span className="block truncate text-sm text-muted">{selected.location}</span>
        </span>
        <ChevronDown size={20} className={`shrink-0 text-forest transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-black/5 bg-card shadow-xl">
            <div className="border-b border-black/5 p-2">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  autoFocus
                  className="w-full rounded-xl border border-black/5 bg-cream/60 py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-forest/40"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted">No projects found.</div>
              )}
              {filtered.map((p) => {
                const active = p.id === selected.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      active ? 'bg-pill-green' : 'hover:bg-black/[0.03]'
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-pill-neutral text-muted">
                      <FolderClosed size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{p.name}</span>
                      <span className="block truncate text-xs text-muted">{p.client}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-semibold text-ink/70">
                      {countFor(p.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
