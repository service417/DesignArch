import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search, Star, UserPlus } from 'lucide-react';
import { useJobCards } from '../store/jobCards';
import { lkr } from '../mock/projects';
import { nextJcRef } from '../mock/jobCards';
import type { JobCard, JobStatus, Stage, StageInfo } from '../mock/jobCards';
import { Panel, Avatar } from '../components/ui';
import { ProjectSelector } from '../components/ProjectSelector';
import { NewJobCardModal } from '../components/NewJobCardModal';
import { StatusPill, StageChip, statusLabel, ALL_STATUSES } from '../components/jobStatus';

type Segment = 'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'STARRED';
type StageFilter = 'ALL' | Stage;
type StatusFilter = 'ALL' | JobStatus;
type SortKey = 'ref' | 'status' | 'amount';

const isAssigned = (card: JobCard) => card.stages.every((s) => s.assignee);
const isUnassigned = (card: JobCard) => card.stages.some((s) => !s.assignee);
const cardTotal = (card: JobCard) => card.stages.reduce((sum, s) => sum + (s.amount ?? 0), 0);
const cardAmountKind = (card: JobCard) =>
  card.stages.some((s) => s.amountKind === 'PENDING')
    ? 'PENDING'
    : card.stages.some((s) => s.amountKind === 'AGREED')
      ? 'AGREED'
      : 'NONE';

/** Job cards for one project, with the project selector as the focal control. */
export function JobCardsListPage() {
  const { jobCards, selectedProjectId, setSelectedProjectId, toggleStar, addJobCard } = useJobCards();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<Segment>('ALL');
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('ref');
  const [creating, setCreating] = useState(false);

  const scoped = useMemo(
    () => jobCards.filter((c) => c.projectId === selectedProjectId),
    [jobCards, selectedProjectId],
  );

  const summary = useMemo(
    () => ({
      total: scoped.length,
      assigned: scoped.filter(isAssigned).length,
      unassigned: scoped.filter(isUnassigned).length,
      inProgress: scoped.filter((c) => c.stages.some((s) => s.status === 'IN_PROGRESS')).length,
      awaitingPrice: scoped.filter((c) => c.stages.some((s) => s.status === 'PRICE_PENDING')).length,
    }),
    [scoped],
  );

  const filtered = useMemo(() => {
    const rows = scoped.filter((c) => {
      if (segment === 'ASSIGNED' && !isAssigned(c)) return false;
      if (segment === 'UNASSIGNED' && !isUnassigned(c)) return false;
      if (segment === 'STARRED' && !c.starred) return false;
      if (stage !== 'ALL' && !c.stages.some((s) => s.stage === stage)) return false;
      if (status !== 'ALL' && !c.stages.some((s) => s.status === status)) return false;
      if (query) {
        const q = query.toLowerCase();
        const inRef = c.ref.toLowerCase().includes(q);
        const inName = c.stages.some((s) => s.assignee?.name.toLowerCase().includes(q));
        if (!inRef && !inName) return false;
      }
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === 'amount') return cardTotal(b) - cardTotal(a);
      if (sort === 'status') {
        return (a.stages[0]?.status ?? '').localeCompare(b.stages[0]?.status ?? '');
      }
      return a.ref.localeCompare(b.ref);
    });
  }, [scoped, segment, stage, status, query, sort]);

  const clearFilters = () => {
    setQuery('');
    setSegment('ALL');
    setStage('ALL');
    setStatus('ALL');
  };

  function createCard(card: Omit<JobCard, 'id'>) {
    addJobCard(card);
    // Show the project the new card belongs to, so it's visible immediately.
    setSelectedProjectId(card.projectId);
    setCreating(false);
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Job Cards</h1>
          <p className="mt-0.5 text-sm text-muted">Track every stage across a project.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
        >
          <Plus size={18} strokeWidth={2.4} />
          Add job card
        </button>
      </div>

      <ProjectSelector />

      {/* summary strip */}
      <div className="flex flex-wrap gap-3">
        <Stat label="Total" value={summary.total} />
        <Stat label="Assigned" value={summary.assigned} />
        <Stat label="Unassigned" value={summary.unassigned} tone={summary.unassigned ? 'muted' : undefined} />
        <Stat label="In Progress" value={summary.inProgress} />
        <Stat label="Awaiting Price" value={summary.awaitingPrice} tone={summary.awaitingPrice ? 'brick' : undefined} />
      </div>

      {/* filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by worker name or job card ID…"
              className="w-full rounded-xl border border-black/5 bg-card py-2.5 pl-10 pr-3 text-sm text-ink shadow-soft outline-none placeholder:text-muted focus:border-forest/40"
            />
          </div>
          <Select value={stage} onChange={(v) => setStage(v as StageFilter)}>
            <option value="ALL">All stages</option>
            <option value="CARPENTRY">Carpentry</option>
            <option value="PAINTING">Painting</option>
          </Select>
          <Select value={status} onChange={(v) => setStatus(v as StatusFilter)}>
            <option value="ALL">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(v) => setSort(v as SortKey)}>
            <option value="ref">Sort: JC id</option>
            <option value="status">Sort: status</option>
            <option value="amount">Sort: amount</option>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['ALL', 'All'],
              ['ASSIGNED', 'Assigned'],
              ['UNASSIGNED', 'Unassigned'],
              ['STARRED', '★ Starred'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSegment(key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                segment === key
                  ? 'bg-forest text-white'
                  : 'bg-card text-muted shadow-soft ring-1 ring-black/5 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm text-muted">
        Showing {filtered.length} of {scoped.length} job cards
      </div>

      {filtered.length === 0 ? (
        <EmptyState onClear={clearFilters} />
      ) : (
        <div className="space-y-3">
          {filtered.map((card) => (
            <Row
              key={card.id}
              card={card}
              onOpen={() => navigate(`/job-cards/${card.ref}`)}
              onStar={() => toggleStar(card.id)}
            />
          ))}
        </div>
      )}

      {creating && (
        <NewJobCardModal
          nextRef={nextJcRef(jobCards)}
          defaultProjectId={selectedProjectId}
          onSave={createCard}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function Row({ card, onOpen, onStar }: { card: JobCard; onOpen: () => void; onStar: () => void }) {
  const kind = cardAmountKind(card);
  const amountColor =
    kind === 'PENDING' ? 'text-brick' : kind === 'AGREED' ? 'text-forest' : 'text-muted';

  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-4 rounded-2xl border border-black/5 bg-card p-4 shadow-soft transition hover:border-black/10"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04]"
        aria-label={card.starred ? 'Unstar' : 'Star'}
      >
        <Star size={18} className={card.starred ? 'fill-[#E4A700] text-[#E4A700]' : ''} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">{card.ref}</span>
          {card.starred && <span className="text-[10px] text-[#E4A700]">★</span>}
        </div>
        <div className="truncate font-semibold text-ink">{card.title}</div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {card.stages.map((s) => (
            <StageLine key={s.stage} info={s} />
          ))}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className={`font-bold ${amountColor}`}>
          {kind === 'NONE' ? '—' : lkr(cardTotal(card))}
        </div>
        <div className="text-[11px] text-muted">
          {kind === 'PENDING' ? 'amended' : kind === 'AGREED' ? 'agreed' : 'not priced'}
        </div>
      </div>
    </div>
  );
}

function StageLine({ info }: { info: StageInfo }) {
  return (
    <div className="flex items-center gap-2">
      <StageChip stage={info.stage} />
      <StatusPill status={info.status} />
      {info.assignee ? (
        <span className="flex items-center gap-1.5">
          <Avatar initials={info.assignee.initials} color={info.assignee.color} size={20} />
          <span className="text-xs text-muted">{info.assignee.name}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-medium text-muted">
            Unassigned
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log('assign', info.stage);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-forest/30 px-2 py-0.5 text-[11px] font-semibold text-forest transition hover:bg-pill-green"
          >
            <UserPlus size={12} /> Assign
          </button>
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brick' | 'muted' }) {
  const color = tone === 'brick' ? 'text-brick' : 'text-ink';
  return (
    <div className="rounded-xl border border-black/5 bg-card px-4 py-2.5 shadow-soft">
      <span className={`text-lg font-bold tracking-tight ${color}`}>{value}</span>
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

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <Panel>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pill-neutral text-muted">
          <ClipboardList size={26} />
        </span>
        <div className="font-semibold text-ink">No job cards match these filters</div>
        <button
          onClick={onClear}
          className="mt-1 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Clear filters
        </button>
      </div>
    </Panel>
  );
}
