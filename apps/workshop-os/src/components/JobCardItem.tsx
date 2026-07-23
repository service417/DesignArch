import { FileText, Pencil, Trash2 } from 'lucide-react';
import { lkr } from '../mock/projects';
import type { JobCard } from '../mock/projects';
import { Avatar } from './ui';
import { StageBadge, StatusBadge } from './badges';

/**
 * One job card as a bordered panel. Shared by the create and detail views; the
 * detail view sets `showStatus` to reveal the workflow status and assignee that
 * a not-yet-created card does not have.
 */
export function JobCardItem({
  card,
  showStatus = false,
  onEdit,
  onDelete,
}: {
  card: JobCard;
  showStatus?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-black/5 p-4 transition hover:border-black/10">
      <div className="flex gap-4">
        {/* thumbnail + filename caption */}
        <div className="w-20 shrink-0">
          <div className="grid h-20 w-20 place-items-center rounded-xl bg-pill-neutral text-muted">
            <FileText size={24} strokeWidth={1.7} />
          </div>
          {card.fileName && (
            <div className="mt-1 truncate text-[11px] text-muted" title={card.fileName}>
              {card.fileName}
            </div>
          )}
        </div>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted">{card.ref}</span>
                <StageBadge stage={card.stage} />
                {showStatus && <StatusBadge status={card.status} />}
              </div>
              <div className="mt-1 font-semibold text-ink">{card.title}</div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={onEdit}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04] hover:text-ink"
                aria-label={`Edit ${card.ref}`}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={onDelete}
                className="grid h-8 w-8 place-items-center rounded-lg text-brick transition hover:bg-pill-red"
                aria-label={`Delete ${card.ref}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <p className="mt-1.5 text-sm text-muted">{card.description}</p>

          <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">Proposed amount</span>
              {showStatus && card.assignee && (
                <span className="flex items-center gap-1.5">
                  <Avatar initials={card.assignee.initials} color={card.assignee.color} size={22} />
                  <span className="text-xs text-muted">{card.assignee.name}</span>
                </span>
              )}
            </div>
            <span className="font-bold text-forest">{lkr(card.amount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
