import { kpis } from '../mock/dashboard';
import type { PillTone } from '../mock/dashboard';
import { Pill } from './ui';

const ICON_TONE: Record<PillTone, string> = {
  green: 'bg-pill-green text-forest',
  red: 'bg-pill-red text-brick',
  neutral: 'bg-pill-neutral text-ink/70',
};

/** The four KPI cards. Wraps to a 2×2 grid on tablet, one row on desktop. */
export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.label}
            className="rounded-2xl border border-black/5 bg-card p-5 shadow-soft"
          >
            <div className="flex items-start justify-between">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${ICON_TONE[kpi.iconTone]}`}>
                <Icon size={20} strokeWidth={2} />
              </span>
              <Pill tone={kpi.pillTone}>{kpi.pillText}</Pill>
            </div>
            <div className="mt-5 text-4xl font-bold tracking-tight text-ink">{kpi.value}</div>
            <div className="mt-1 text-sm text-muted">{kpi.label}</div>
          </div>
        );
      })}
    </div>
  );
}
