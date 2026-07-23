import type { JobStatus, Stage } from '../mock/jobCards';

/**
 * The one status→colour mapping used everywhere in the Job Cards tab, so a
 * "Price Pending" reads brick-red on a list row, a detail header, and a stage
 * card alike.
 */
const STATUS: Record<JobStatus, { label: string; className: string }> = {
  UNASSIGNED: { label: 'Unassigned', className: 'bg-pill-neutral text-muted' },
  ASSIGNED: { label: 'Assigned', className: 'bg-pill-neutral text-ink/70' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-pill-green text-forest' },
  READY_FOR_INSPECTION: { label: 'Ready for Inspection', className: 'bg-[#FBF0DA] text-[#8A6D1A]' },
  PRICE_PENDING: { label: 'Price Pending', className: 'bg-pill-red text-brick' },
  APPROVED: { label: 'Approved', className: 'bg-pill-green text-forest' },
  COMPLETED: { label: 'Completed', className: 'bg-forest text-white' },
  REJECTED: { label: 'Rejected', className: 'bg-pill-red text-brick' },
};

export const statusLabel = (s: JobStatus) => STATUS[s].label;

export function StatusPill({ status, size = 'sm' }: { status: JobStatus; size?: 'sm' | 'md' }) {
  const s = STATUS[status];
  const pad = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${pad} ${s.className}`}>
      {s.label}
    </span>
  );
}

/** Carpentry green, painting brick — a coloured dot plus label. */
export function StageChip({ stage }: { stage: Stage }) {
  const carpentry = stage === 'CARPENTRY';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        carpentry ? 'bg-pill-green text-forest' : 'bg-pill-red text-brick'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${carpentry ? 'bg-forest' : 'bg-brick'}`} />
      {carpentry ? 'Carpentry' : 'Painting'}
    </span>
  );
}

/** All selectable statuses, for filter dropdowns. */
export const ALL_STATUSES: JobStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'READY_FOR_INSPECTION',
  'PRICE_PENDING',
  'APPROVED',
  'COMPLETED',
];
