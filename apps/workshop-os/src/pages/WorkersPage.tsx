import { useMemo, useState } from 'react';
import { Briefcase, CheckCircle2, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { useWorkers } from '../store/workers';
import { colorFor, initialsOf, ROLES } from '../mock/workers';
import type { Availability, Worker, WorkerRole } from '../mock/workers';
import { Avatar, Panel } from '../components/ui';
import { WorkerEditor } from '../components/WorkerEditor';

type RoleFilter = 'ALL' | WorkerRole;
type AvailFilter = 'ALL' | Availability;
type SortKey = 'name' | 'active' | 'completed';

/** The roster: search, role/availability filters, and full create/update/delete. */
export function WorkersPage() {
  const { workers, addWorker, updateWorker, deleteWorker } = useWorkers();

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('ALL');
  const [avail, setAvail] = useState<AvailFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('name');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [confirm, setConfirm] = useState<Worker | null>(null);

  const summary = useMemo(
    () => ({
      total: workers.length,
      carpenters: workers.filter((w) => w.role === 'Carpenter').length,
      painters: workers.filter((w) => w.role === 'Painter').length,
      supervisors: workers.filter((w) => w.role === 'Supervisor').length,
      overdue: workers.filter((w) => w.availability === 'OVERDUE').length,
    }),
    [workers],
  );

  const filtered = useMemo(() => {
    const rows = workers.filter((w) => {
      if (role !== 'ALL' && w.role !== role) return false;
      if (avail !== 'ALL' && w.availability !== avail) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !w.name.toLowerCase().includes(q) &&
          !w.role.toLowerCase().includes(q) &&
          !w.phone.includes(q) &&
          !w.email.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === 'active') return b.activeJobs - a.activeJobs;
      if (sort === 'completed') return b.completedJobs - a.completedJobs;
      return a.name.localeCompare(b.name);
    });
  }, [workers, role, avail, query, sort]);

  function openAdd() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(worker: Worker) {
    setEditing(worker);
    setEditorOpen(true);
  }
  function save(data: Omit<Worker, 'id'>) {
    if (editing) updateWorker(editing.id, data);
    else addWorker(data);
    setEditorOpen(false);
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Workers</h1>
          <p className="mt-0.5 text-sm text-muted">The workshop roster — carpenters, painters and supervisors.</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
        >
          <Plus size={18} strokeWidth={2.4} />
          Add worker
        </button>
      </div>

      {/* summary chips */}
      <div className="flex flex-wrap gap-3">
        <Stat label="Total" value={summary.total} />
        <Stat label="Carpenters" value={summary.carpenters} />
        <Stat label="Painters" value={summary.painters} />
        <Stat label="Supervisors" value={summary.supervisors} />
        <Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'brick' : undefined} />
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, role, phone or email…"
            className="w-full rounded-xl border border-black/5 bg-card py-2.5 pl-10 pr-3 text-sm text-ink shadow-soft outline-none placeholder:text-muted focus:border-forest/40"
          />
        </div>
        <Select value={role} onChange={(v) => setRole(v as RoleFilter)}>
          <option value="ALL">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select value={avail} onChange={(v) => setAvail(v as AvailFilter)}>
          <option value="ALL">All availability</option>
          <option value="FREE">Free</option>
          <option value="BUSY">Busy</option>
          <option value="OVERDUE">Overdue</option>
        </Select>
        <Select value={sort} onChange={(v) => setSort(v as SortKey)}>
          <option value="name">Sort: name</option>
          <option value="active">Sort: active jobs</option>
          <option value="completed">Sort: completed</option>
        </Select>
      </div>

      <div className="text-sm text-muted">
        Showing {filtered.length} of {workers.length} workers
      </div>

      {filtered.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((w) => (
            <WorkerCard key={w.id} worker={w} onEdit={() => openEdit(w)} onDelete={() => setConfirm(w)} />
          ))}
        </div>
      )}

      {editorOpen && (
        <WorkerEditor initial={editing} onSave={save} onClose={() => setEditorOpen(false)} />
      )}

      {confirm && (
        <ConfirmDelete
          worker={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            deleteWorker(confirm.id);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

const ROLE_TINT: Record<WorkerRole, string> = {
  Carpenter: 'bg-pill-green text-forest',
  Painter: 'bg-pill-red text-brick',
  Supervisor: 'bg-[#FBF0DA] text-[#8A6D1A]',
};

const AVAIL: Record<Availability, { label: string; className: string; dot: string }> = {
  FREE: { label: 'Free', className: 'bg-pill-neutral text-ink/70', dot: 'bg-muted' },
  BUSY: { label: 'Busy', className: 'bg-pill-green text-forest', dot: 'bg-forest' },
  OVERDUE: { label: 'Overdue', className: 'bg-pill-red text-brick', dot: 'bg-brick' },
};

function WorkerCard({
  worker,
  onEdit,
  onDelete,
}: {
  worker: Worker;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const a = AVAIL[worker.availability];
  const inactive = worker.status === 'INACTIVE';

  return (
    <div
      className={`group rounded-2xl border border-black/5 bg-card p-5 shadow-soft transition hover:border-black/10 ${
        inactive ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar initials={initialsOf(worker.name)} color={colorFor(worker.name)} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-ink">{worker.name}</span>
            {inactive && (
              <span className="rounded-full bg-pill-neutral px-2 py-0.5 text-[10px] font-semibold text-muted">
                Inactive
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_TINT[worker.role]}`}>
              {worker.role}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.className}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
              {a.label}
            </span>
          </div>
        </div>

        {/* actions — always present, emphasised on hover */}
        <div className="flex shrink-0 items-center gap-1 opacity-60 transition group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04] hover:text-ink"
            aria-label={`Edit ${worker.name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-lg text-brick transition hover:bg-pill-red"
            aria-label={`Delete ${worker.name}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-black/5 pt-4">
        <Metric icon={<Briefcase size={15} />} value={String(worker.activeJobs)} label="Active jobs" />
        <Metric icon={<CheckCircle2 size={15} />} value={String(worker.completedJobs)} label="Completed" />
      </div>

      <div className="mt-4 space-y-1.5 text-sm text-muted">
        <div className="flex items-center gap-2">
          <Phone size={14} /> {worker.phone || '—'}
        </div>
        <div className="flex items-center gap-2">
          <Mail size={14} /> <span className="truncate">{worker.email || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-pill-neutral text-muted">{icon}</span>
      <div>
        <div className="font-bold leading-none text-ink">{value}</div>
        <div className="text-[11px] text-muted">{label}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brick' }) {
  return (
    <div className="rounded-xl border border-black/5 bg-card px-4 py-2.5 shadow-soft">
      <span className={`text-lg font-bold tracking-tight ${tone === 'brick' ? 'text-brick' : 'text-ink'}`}>
        {value}
      </span>
      <span className="ml-2 text-sm text-muted">{label}</span>
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Panel>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pill-neutral text-muted">
          <Users size={26} />
        </span>
        <div className="font-semibold text-ink">No workers match these filters</div>
        <button
          onClick={onAdd}
          className="mt-1 inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <Plus size={18} strokeWidth={2.4} />
          Add worker
        </button>
      </div>
    </Panel>
  );
}

function ConfirmDelete({
  worker,
  onCancel,
  onConfirm,
}: {
  worker: Worker;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold tracking-tight text-ink">Remove this worker?</h3>
        <p className="mt-1 text-sm text-muted">
          <span className="font-medium text-ink">{worker.name}</span> will be removed from the roster.
          This can’t be undone.
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
            Remove worker
          </button>
        </div>
      </div>
    </div>
  );
}
