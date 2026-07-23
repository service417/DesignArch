import type { JobStatus, Stage } from '../mock/projects';

/** Carpentry reads green, painting reads brick — a dot plus label on a tint. */
export function StageBadge({ stage }: { stage: Stage }) {
  const carpentry = stage === 'CARPENTRY';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        carpentry ? 'bg-pill-green text-forest' : 'bg-pill-red text-brick'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${carpentry ? 'bg-forest' : 'bg-brick'}`} />
      {carpentry ? 'Carpentry' : 'Painting'}
    </span>
  );
}

const STATUS: Record<JobStatus, { label: string; className: string }> = {
  ASSIGNED: { label: 'Assigned', className: 'bg-pill-neutral text-ink/70' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-pill-green text-forest' },
  // Amber for a waiting state — the one moment a supervisor's action is owed.
  READY_FOR_INSPECTION: { label: 'Ready for Inspection', className: 'bg-[#FBF0DA] text-[#8A5A00]' },
  APPROVED: { label: 'Approved', className: 'bg-pill-green text-forest' },
  COMPLETED: { label: 'Completed', className: 'bg-forest text-white' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  READY_FOR_INSPECTION: 'Ready for Inspection',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
};
