import { workerActivity } from '../mock/dashboard';
import type { PillTone } from '../mock/dashboard';
import { Panel, PanelHead } from './ui';

const TILE_TONE: Record<PillTone, string> = {
  green: 'bg-pill-green text-forest',
  red: 'bg-pill-red text-brick',
  neutral: 'bg-pill-neutral text-ink/70',
};

/** Three tiles: how many workers are busy, free, or running overdue. */
export function WorkerActivity() {
  return (
    <Panel className="h-full">
      <PanelHead
        title="Worker Activity"
        right={
          <button
            onClick={() => console.log('all workers')}
            className="text-sm font-semibold text-forest hover:underline"
          >
            All workers →
          </button>
        }
      />
      <div className="grid grid-cols-3 gap-3 p-6">
        {workerActivity.map((stat) => (
          <div key={stat.label} className={`rounded-2xl p-4 ${TILE_TONE[stat.tone]}`}>
            <div className="text-3xl font-bold tracking-tight">{stat.count}</div>
            <div className="mt-1 text-sm font-medium">{stat.label}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
