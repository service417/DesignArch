import type { ReactNode } from 'react';
import type { StageStatus } from '../lib/types';

export function Card({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Status colours carry meaning, so they are grouped by what the status *means*
 * to an admin rather than given nine arbitrary hues: amber = waiting on you,
 * blue = in motion elsewhere, green = settled, red = needs attention.
 */
const STATUS_TONE: Record<StageStatus, string> = {
  ASSIGNED: 'neutral',
  IN_PROGRESS: 'info',
  READY_FOR_INSPECTION: 'info',
  APPROVED: 'warn',
  REJECTED: 'danger',
  PRICE_PROPOSED: 'info',
  PRICE_DECLINED: 'warn',
  PRICE_ACCEPTED: 'ok',
  COMPLETED: 'ok',
};

const STATUS_LABEL: Record<StageStatus, string> = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  READY_FOR_INSPECTION: 'Awaiting inspection',
  APPROVED: 'Awaiting price',
  REJECTED: 'Rejected',
  PRICE_PROPOSED: 'Price offered',
  PRICE_DECLINED: 'Price declined',
  PRICE_ACCEPTED: 'Price accepted',
  COMPLETED: 'Completed',
};

export function StatusBadge({ status }: { status: StageStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <p className="empty">{label}</p>;
}

/** Dates are stored UTC and shown in Asia/Colombo, per the architecture decision. */
export function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function howLong(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
