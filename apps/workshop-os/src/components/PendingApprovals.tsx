import { Check, X } from 'lucide-react';
import { approvals } from '../mock/dashboard';
import type { Approval } from '../mock/dashboard';
import { Avatar, Panel, PanelHead, Pill } from './ui';

/** The amended-price review queue — one row per worker's proposal. */
export function PendingApprovals() {
  return (
    <Panel>
      <PanelHead
        title="Pending Amount Approvals"
        subtitle="Workers proposed amended prices — review each."
        right={<Pill tone="red">4 waiting</Pill>}
      />
      <div className="flex flex-col gap-3 p-6">
        {approvals.map((row) => (
          <ApprovalRow key={row.jobRef} row={row} />
        ))}
      </div>
    </Panel>
  );
}

function ApprovalRow({ row }: { row: Approval }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-black/5 p-4 transition hover:bg-black/[0.02]">
      <Avatar initials={row.initials} color={row.avatarColor} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">
          {row.name}
          <span className="font-normal text-muted"> · {row.role}</span>
        </div>
        <div className="truncate text-sm text-muted">{row.jobRef}</div>
      </div>

      <div className="text-right">
        <div className="text-xs text-muted line-through">{row.oldPrice}</div>
        <div className="text-[15px] font-bold text-brick">{row.newPrice}</div>
        <div className="text-xs font-medium text-brick">{row.delta}</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => console.log(`approve: ${row.jobRef}`)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white transition hover:brightness-110"
          aria-label={`Approve ${row.name}`}
        >
          <Check size={18} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => console.log(`decline: ${row.jobRef}`)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-brick/30 text-brick transition hover:bg-pill-red"
          aria-label={`Decline ${row.name}`}
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
