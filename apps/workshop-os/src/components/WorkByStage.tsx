import { throughput, workByStage } from '../mock/dashboard';
import type { StageBreakdown } from '../mock/dashboard';
import { Panel, PanelHead } from './ui';

/**
 * Job-card counts by status, as a stacked bar per stage plus two throughput
 * figures. Plain divs, no chart library — the segments are proportional widths.
 */
export function WorkByStage() {
  return (
    <Panel className="h-full">
      <PanelHead title="Work by Stage" subtitle="Job cards by status this week." />
      <div className="space-y-6 p-6">
        {workByStage.map((stage) => (
          <StageBar key={stage.stage} stage={stage} />
        ))}

        <div className="border-t border-black/5 pt-5">
          <div className="grid grid-cols-2 gap-4">
            {throughput.map((t) => (
              <div key={t.label}>
                <div className="text-2xl font-bold tracking-tight text-ink">{t.value}</div>
                <div className="text-sm text-muted">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StageBar({ stage }: { stage: StageBreakdown }) {
  const seg =
    stage.tone === 'green'
      ? { done: 'bg-bar-green-done', doing: 'bg-bar-green-doing', todo: 'bg-bar-green-todo', dot: 'bg-bar-green-done' }
      : { done: 'bg-bar-brick-done', doing: 'bg-bar-brick-doing', todo: 'bg-bar-brick-todo', dot: 'bg-bar-brick-done' };

  const pct = (n: number) => `${(n / stage.totalCards) * 100}%`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${seg.dot}`} />
          <span className="font-semibold text-ink">{stage.stage}</span>
        </div>
        <span className="text-sm text-muted">{stage.totalCards} cards</span>
      </div>

      <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full">
        <div className={seg.done} style={{ width: pct(stage.done) }} />
        <div className={seg.doing} style={{ width: pct(stage.inProgress) }} />
        <div className={seg.todo} style={{ width: pct(stage.toDo) }} />
      </div>

      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span>
          <b className="font-semibold text-ink">{stage.done}</b> Done
        </span>
        <span>
          <b className="font-semibold text-ink">{stage.inProgress}</b> In progress
        </span>
        <span>
          <b className="font-semibold text-ink">{stage.toDo}</b> To do
        </span>
      </div>
    </div>
  );
}
