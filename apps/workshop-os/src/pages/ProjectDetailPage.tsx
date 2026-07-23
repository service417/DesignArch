import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useProjects } from '../store/projects';
import {
  dueDisplay,
  lkr,
  lkrCompact,
  nextJcRef,
} from '../mock/projects';
import type { JobCard, JobStatus, Stage } from '../mock/projects';
import { Panel } from '../components/ui';
import { PageBar } from '../components/PageBar';
import { CardHead } from './CreateProjectPage';
import { JobCardItem } from '../components/JobCardItem';
import { JobCardEditor } from '../components/JobCardEditor';
import { STATUS_LABEL } from '../components/badges';

type StageFilter = 'ALL' | Stage;
type StatusFilter = 'ALL' | JobStatus;
type SortKey = 'ref' | 'amount';

/** One project: its details, its KPIs, and a filterable list of its job cards. */
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { getProject, addJobCard, updateJobCard, deleteJobCard, archiveProject, deleteProject } =
    useProjects();
  const navigate = useNavigate();
  const project = getProject(id);

  const [editing, setEditing] = useState<JobCard | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('ref');

  const filtered = useMemo(() => {
    if (!project) return [];
    const rows = project.jobCards.filter((c) => {
      if (stage !== 'ALL' && c.stage !== stage) return false;
      if (status !== 'ALL' && c.status !== status) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!c.title.toLowerCase().includes(q) && !c.ref.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return [...rows].sort((a, b) =>
      sort === 'amount' ? b.amount - a.amount : a.ref.localeCompare(b.ref),
    );
  }, [project, query, stage, status, sort]);

  if (!project) {
    return (
      <div className="p-8">
        <PageBar back="/projects" breadcrumb="Projects" title="Project not found" />
        <p className="mt-6 text-muted">This project may have been deleted.</p>
      </div>
    );
  }

  const totalProposed = project.jobCards.reduce((sum, c) => sum + c.amount, 0);

  function saveCard(card: JobCard) {
    if (project!.jobCards.some((c) => c.id === card.id)) {
      updateJobCard(project!.id, card);
    } else {
      addJobCard(project!.id, card);
    }
    setEditorOpen(false);
  }

  return (
    <div className="space-y-6 p-8">
      <PageBar
        back="/projects"
        breadcrumb={
          <>
            Projects <span className="text-muted/50">/</span> {project.name}
          </>
        }
        title={project.name}
        actions={
          <>
            <button
              onClick={() => console.log('edit project')}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:bg-black/[0.03]"
            >
              <Pencil size={16} />
              Edit
            </button>
            {project.hasPayments ? (
              <button
                onClick={() => archiveProject(project.id)}
                title="Projects with payments can be archived, not deleted"
                className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:bg-black/[0.03]"
              >
                <Archive size={16} />
                Archive
              </button>
            ) : (
              <button
                onClick={() => {
                  deleteProject(project.id);
                  navigate('/projects');
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brick px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </>
        }
      />

      {/* details summary */}
      <Panel>
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Detail label="Client" value={project.client} />
              <Detail label="Deadline" value={dueDisplay(project.deadline)} />
              <Detail label="Estimated value" value={lkr(project.value)} />
              <Detail
                label="Status"
                value={project.status === 'ACTIVE' ? 'Active' : 'Archived'}
              />
            </dl>
            <div className="mt-5">
              <div className="text-sm font-medium text-muted">Description</div>
              <p className="mt-1 text-sm text-ink">{project.description}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-cream/70 p-5">
            <div className="text-sm font-medium text-muted">Completion</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-ink">{project.completion}%</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/5">
              <div className="h-full rounded-full bg-forest" style={{ width: `${project.completion}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Mini label="Job cards" value={String(project.jobCards.length)} />
              <Mini label="Value" value={lkrCompact(project.value)} />
            </div>
          </div>
        </div>
      </Panel>

      {/* add job card */}
      <Panel>
        <CardHead
          icon={<Plus size={20} />}
          title="Job Cards"
          subtitle="Add another assignable task to this build."
          right={
            <span className="rounded-full bg-pill-neutral px-3 py-1 text-xs font-semibold text-ink/70">
              {lkr(totalProposed)} proposed
            </span>
          }
        />
        <div className="px-6 pb-6">
          <button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-black/20 py-3.5 text-sm font-semibold text-muted transition hover:border-forest/40 hover:text-forest"
          >
            <Plus size={18} strokeWidth={2.4} />
            Add job card
          </button>
        </div>
      </Panel>

      {/* filterable list */}
      <Panel>
        <div className="flex flex-wrap items-center gap-3 px-6 pt-5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search job cards…"
              className="w-full rounded-xl border border-black/10 bg-cream/60 py-2.5 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-forest/40"
            />
          </div>
          <Select value={stage} onChange={(v) => setStage(v as StageFilter)}>
            <option value="ALL">All stages</option>
            <option value="CARPENTRY">Carpentry</option>
            <option value="PAINTING">Painting</option>
          </Select>
          <Select value={status} onChange={(v) => setStatus(v as StatusFilter)}>
            <option value="ALL">All statuses</option>
            {(Object.keys(STATUS_LABEL) as JobStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(v) => setSort(v as SortKey)}>
            <option value="ref">Sort: JC ref</option>
            <option value="amount">Sort: amount</option>
          </Select>
        </div>

        <div className="px-6 pb-3 pt-4 text-sm text-muted">
          Showing {filtered.length} of {project.jobCards.length} job cards
        </div>

        <div className="space-y-3 px-6 pb-6">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted">No job cards match these filters.</div>
          ) : (
            filtered.map((card) => (
              <JobCardItem
                key={card.id}
                card={card}
                showStatus
                onEdit={() => {
                  setEditing(card);
                  setEditorOpen(true);
                }}
                onDelete={() => deleteJobCard(project.id, card.id)}
              />
            ))
          )}
        </div>
      </Panel>

      {editorOpen && (
        <JobCardEditor
          initial={editing}
          nextRef={nextJcRef(project.jobCards)}
          onSave={saveCard}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold tracking-tight text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
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
      className="rounded-xl border border-black/10 bg-cream/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-forest/40"
    >
      {children}
    </select>
  );
}
