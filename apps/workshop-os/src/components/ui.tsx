import type { ReactNode } from 'react';
import type { PillTone } from '../mock/dashboard';

/** A white panel — the repeated card container across the dashboard. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl bg-card border border-black/5 shadow-soft ${className}`}
    >
      {children}
    </section>
  );
}

/** A card header: title, optional muted subtitle, optional right-aligned slot. */
export function PanelHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const PILL_CLASS: Record<PillTone, string> = {
  green: 'bg-pill-green text-forest',
  red: 'bg-pill-red text-brick',
  neutral: 'bg-pill-neutral text-muted',
};

/** A rounded-full status pill in one of the three brand tones. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${PILL_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** A circular initials avatar on an arbitrary background colour. */
export function Avatar({
  initials,
  color,
  size = 40,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}
