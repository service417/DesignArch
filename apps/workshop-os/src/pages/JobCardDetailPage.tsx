import { ChevronLeft, FileText, Hammer, Image as ImageIcon, Paintbrush, Pencil, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useJobCards } from '../store/jobCards';
import { jcProjects } from '../mock/jobCards';
import { lkr as lkrFmt } from '../mock/projects';
import type { JobCard, JobStatus, StageInfo } from '../mock/jobCards';
import { Panel, Avatar } from '../components/ui';
import { StatusPill } from '../components/jobStatus';

/** The card-level headline: a pending amount is the thing that needs attention,
 *  otherwise the least-advanced stage speaks for the card. */
const ORDER: Record<JobStatus, number> = {
  UNASSIGNED: 0,
  ASSIGNED: 1,
  REJECTED: 2,
  IN_PROGRESS: 2,
  READY_FOR_INSPECTION: 3,
  PRICE_PENDING: 3,
  APPROVED: 4,
  COMPLETED: 5,
};

function headlineStatus(card: JobCard): JobStatus {
  if (card.stages.some((s) => s.amountKind === 'PENDING')) return 'PRICE_PENDING';
  return card.stages.reduce<JobStatus>(
    (min, s) => (ORDER[s.status] < ORDER[min] ? s.status : min),
    card.stages[0].status,
  );
}

export function JobCardDetailPage() {
  const { id = '' } = useParams();
  const { getCard } = useJobCards();
  const navigate = useNavigate();
  const card = getCard(id);

  if (!card) {
    return (
      <div className="p-8">
        <button onClick={() => navigate('/job-cards')} className="text-sm font-semibold text-forest">
          ← Back to job cards
        </button>
        <p className="mt-6 text-muted">This job card could not be found.</p>
      </div>
    );
  }

  const project = jcProjects.find((p) => p.id === card.projectId);
  const carpentry = card.stages.find((s) => s.stage === 'CARPENTRY');
  const painting = card.stages.find((s) => s.stage === 'PAINTING');

  return (
    <div className="space-y-6 p-8">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/job-cards')}
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-card text-ink shadow-soft transition hover:bg-black/[0.03]"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <div className="text-sm text-muted">
              Job Cards <span className="text-muted/50">/</span> {card.ref}
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{card.title}</h1>
              <StatusPill status={headlineStatus(card)} size="md" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => console.log('edit')}
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:bg-black/[0.03]"
          >
            <Pencil size={16} /> Edit
          </button>
          <button
            onClick={() => console.log('reassign')}
            className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
          >
            <RefreshCw size={16} /> Reassign
          </button>
        </div>
      </div>

      {/* stage progress */}
      <Panel>
        <div className="px-6 pt-5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Stage Progress
        </div>
        <div className="flex items-center gap-4 px-6 py-6">
          <StageNode
            icon={<Hammer size={22} />}
            tint="bg-pill-green text-forest"
            label="Carpentry"
            info={carpentry}
          />
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/5">
            {/* green fill reflects how far carpentry has advanced */}
            <div className="h-full rounded-full bg-forest" style={{ width: carpentry ? '70%' : '0%' }} />
          </div>
          <StageNode
            icon={<Paintbrush size={22} />}
            tint="bg-pill-red text-brick"
            label="Painting"
            info={painting}
          />
        </div>
      </Panel>

      {/* main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* design & spec */}
        <div className="lg:col-span-2">
          <Panel>
            <div className="flex items-center justify-between px-6 pt-5">
              <h2 className="text-[17px] font-bold tracking-tight text-ink">Design &amp; Specification</h2>
              <span className="text-sm text-muted">
                {project?.name} · {project?.client}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-6">
              <MediaTile primary file={card.designFiles[0]} className="h-52" />
              <MediaTile file={card.designFiles[1]} className="h-52" />
              <MediaTile file={card.designFiles[2]} className="h-28" />
              <MoreTile count={Math.max(card.designFiles.length - 3, 0)} className="h-28" />
            </div>
          </Panel>
        </div>

        {/* stage cards */}
        <div className="space-y-6">
          {carpentry && <StageCard title="Carpentry" dot="bg-forest" info={carpentry} />}
          {painting && <StageCard title="Painting" dot="bg-brick" info={painting} />}

          <Panel>
            <div className="px-6 pt-5">
              <h3 className="font-bold text-ink">Supervisor Inspection</h3>
              <p className="text-sm text-muted">
                {card.inspection ? card.inspection.note : 'No inspection yet'}
              </p>
            </div>
            <div className="p-6 pt-4">
              {card.inspection ? (
                <div className="flex gap-2">
                  {Array.from({ length: Math.min(card.inspection.photos, 4) }).map((_, i) => (
                    <div key={i} className="grid h-16 w-16 place-items-center rounded-lg bg-pill-neutral text-muted">
                      <ImageIcon size={18} />
                    </div>
                  ))}
                  {card.inspection.photos > 4 && (
                    <div className="grid h-16 w-16 place-items-center rounded-lg bg-pill-neutral text-xs font-semibold text-muted">
                      +{card.inspection.photos - 4}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-cream/70 px-4 py-6 text-center text-sm text-muted">
                  Awaiting inspection
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StageNode({
  icon,
  tint,
  label,
  info,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  info?: StageInfo;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className={`grid h-14 w-14 place-items-center rounded-2xl ${tint}`}>{icon}</span>
      <span className="font-semibold text-ink">{label}</span>
      {info ? <StatusPill status={info.status} /> : <span className="text-xs text-muted">—</span>}
    </div>
  );
}

function StageCard({ title, dot, info }: { title: string; dot: string; info: StageInfo }) {
  const amountLabel =
    info.amountKind === 'PENDING'
      ? 'Amended amount (pending)'
      : info.amountKind === 'AGREED'
        ? 'Agreed amount'
        : 'Not priced yet';
  const amountColor = info.amountKind === 'PENDING' ? 'text-brick' : 'text-forest';

  return (
    <Panel>
      <div className="flex items-center justify-between px-6 pt-5">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <h3 className="font-bold text-ink">{title}</h3>
        </div>
        <StatusPill status={info.status} />
      </div>

      <div className="px-6 py-4">
        {info.assignee ? (
          <div className="flex items-center gap-3">
            <Avatar initials={info.assignee.initials} color={info.assignee.color} />
            <div>
              <div className="font-semibold text-ink">{info.assignee.name}</div>
              <div className="text-xs text-muted">
                {info.assignee.role} · assigned {info.assignee.assignedDate}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-cream/70 px-4 py-3 text-sm text-muted">Unassigned</div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4">
          <span className="text-sm text-muted">{amountLabel}</span>
          <span className={`font-bold ${amountColor}`}>
            {info.amountKind === 'NONE' ? '—' : lkrFmt(info.amount ?? 0)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function MediaTile({
  file,
  primary = false,
  className = '',
}: {
  file?: { name: string; kind: 'pdf' | 'image' };
  primary?: boolean;
  className?: string;
}) {
  if (!file) return <div className={`rounded-xl bg-pill-neutral/60 ${className}`} />;
  const Icon = file.kind === 'pdf' ? FileText : ImageIcon;
  return (
    <div className={`relative grid place-items-center rounded-xl bg-pill-neutral text-muted ${className}`}>
      <Icon size={primary ? 32 : 24} strokeWidth={1.6} />
      {primary && (
        <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-ink shadow-soft">
          {file.name}
        </span>
      )}
    </div>
  );
}

function MoreTile({ count, className = '' }: { count: number; className?: string }) {
  return (
    <button
      onClick={() => console.log('open gallery')}
      className={`grid place-items-center rounded-xl bg-pill-neutral/60 text-sm font-semibold text-muted transition hover:bg-pill-neutral ${className}`}
    >
      +{count} more files
    </button>
  );
}
