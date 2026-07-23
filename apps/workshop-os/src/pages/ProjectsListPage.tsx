import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderClosed, Plus, Search, Trash2, Archive } from 'lucide-react';
import { useProjects } from '../store/projects';
import {
  dueDisplay,
  isDueUrgent,
  lkrCompact,
} from '../mock/projects';
import type { Project, ProjectStatus } from '../mock/projects';
import { Panel } from '../components/ui';

type StatusFilter = 'ALL' | ProjectStatus;

/** The projects table: search, status and client filters, delete/archive. */
export function ProjectsListPage() {
  const { projects, deleteProject, archiveProject } = useProjects();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [client, setClient] = useState('ALL');
  const [confirm, setConfirm] = useState<Project | null>(null);

  const clients = useMemo(
    () => Array.from(new Set(projects.map((p) => p.client))).sort(),
    [projects],
  );

  const filtered = projects.filter((p) => {
    if (status !== 'ALL' && p.status !== status) return false;
    if (client !== 'ALL' && p.client !== client) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.client.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Projects</h1>
          <p className="mt-0.5 text-sm text-muted">All active and archived builds.</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
        >
          <Plus size={18} strokeWidth={2.4} />
          New Project
        </Link>
      </div>

      {/* filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects or clients…"
            className="w-full rounded-xl border border-black/5 bg-card py-2.5 pl-10 pr-3 text-sm text-ink shadow-soft outline-none placeholder:text-muted focus:border-forest/40"
          />
        </div>
        <Select value={status} onChange={(v) => setStatus(v as StatusFilter)}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select value={client} onChange={setClient}>
          <option value="ALL">All clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-6 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Due</th>
                  <th className="px-4 py-3 font-semibold">Value</th>
                  <th className="px-4 py-3 font-semibold">Job Cards</th>
                  <th className="px-4 py-3 font-semibold">Completion</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="cursor-pointer border-t border-black/5 transition hover:bg-black/[0.02]"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-semibold text-ink">
                        {p.name}
                        {p.status === 'ARCHIVED' && (
                          <span className="rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-semibold text-muted">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted">{p.location}</div>
                    </td>
                    <td className="px-4 py-4 text-ink">{p.client}</td>
                    <td className="px-4 py-4">
                      <span className={isDueUrgent(p.deadline) ? 'font-semibold text-brick' : 'text-ink'}>
                        {dueDisplay(p.deadline)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">{lkrCompact(p.value)}</td>
                    <td className="px-4 py-4">
                      <span className="inline-grid h-6 min-w-6 place-items-center rounded-full bg-pill-neutral px-2 text-xs font-semibold text-ink/70">
                        {p.jobCards.length}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-black/5">
                          <div className="h-full rounded-full bg-forest" style={{ width: `${p.completion}%` }} />
                        </div>
                        <span className="w-9 text-sm text-ink">{p.completion}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                        {p.hasPayments ? (
                          <button
                            onClick={() => archiveProject(p.id)}
                            title="Projects with payments can be archived, not deleted"
                            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04] hover:text-ink"
                            aria-label={`Archive ${p.name}`}
                          >
                            <Archive size={17} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirm(p)}
                            className="grid h-9 w-9 place-items-center rounded-lg text-brick transition hover:bg-pill-red"
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {confirm && (
        <ConfirmDelete
          project={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            deleteProject(confirm.id);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-black/5 bg-card px-3 py-2.5 text-sm text-ink shadow-soft outline-none focus:border-forest/40"
    >
      {children}
    </select>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pill-neutral text-muted">
        <FolderClosed size={26} />
      </span>
      <div>
        <div className="font-semibold text-ink">No projects found</div>
        <div className="text-sm text-muted">Try clearing the filters, or start a new build.</div>
      </div>
      <Link
        to="/projects/new"
        className="mt-1 inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        <Plus size={18} strokeWidth={2.4} />
        New Project
      </Link>
    </div>
  );
}

function ConfirmDelete({
  project,
  onCancel,
  onConfirm,
}: {
  project: Project;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold tracking-tight text-ink">Delete this project?</h3>
        <p className="mt-1 text-sm text-muted">
          <span className="font-medium text-ink">{project.name}</span> and its job cards will be
          removed. This can’t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-brick px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}
