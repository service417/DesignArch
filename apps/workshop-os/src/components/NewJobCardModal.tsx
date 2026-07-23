import { useState } from 'react';
import { X } from 'lucide-react';
import { jcProjects } from '../mock/jobCards';
import type { JobCard, Stage } from '../mock/jobCards';

const STAGE_LABEL: Record<Stage, string> = {
  CARPENTRY: 'Carpentry',
  PAINTING: 'Painting',
};

/**
 * Create a new job card for the Job Cards tab. New cards start unassigned and
 * unpriced — the assignee, status and amount are set later from the card detail.
 * The parent supplies the auto-generated ref and writes the result to the store.
 */
export function NewJobCardModal({
  nextRef,
  defaultProjectId,
  onSave,
  onClose,
}: {
  nextRef: string;
  defaultProjectId: string;
  onSave: (card: Omit<JobCard, 'id'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [stages, setStages] = useState<Stage[]>(['CARPENTRY']);

  const valid = title.trim().length > 0 && stages.length > 0;

  function toggleStage(stage: Stage) {
    setStages((prev) => (prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]));
  }

  function save() {
    if (!valid) return;
    onSave({
      ref: nextRef,
      title: title.trim(),
      projectId,
      starred: false,
      // Carpentry always leads a card when both stages are present.
      stages: (['CARPENTRY', 'PAINTING'] as Stage[])
        .filter((s) => stages.includes(s))
        .map((stage) => ({ stage, status: 'UNASSIGNED', amountKind: 'NONE' })),
      designFiles: [],
      inspection: null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
          <div>
            <h3 className="text-[17px] font-bold tracking-tight text-ink">New job card</h3>
            <p className="mt-0.5 text-xs text-muted">{nextRef}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Frame joinery & oil finish"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field label="Project" required>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputClass}
            >
              {jcProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Stages" required>
            <div className="grid grid-cols-2 gap-2">
              {(['CARPENTRY', 'PAINTING'] as Stage[]).map((s) => {
                const on = stages.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStage(s)}
                    className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                      on
                        ? 'border-forest bg-pill-green text-forest'
                        : 'border-black/10 text-muted hover:bg-black/[0.02]'
                    }`}
                  >
                    {STAGE_LABEL[s]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">Pick at least one stage. Each starts unassigned.</p>
          </Field>
        </div>

        <div className="flex justify-end gap-3 border-t border-black/5 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid}
            className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create job card
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-black/10 bg-cream/60 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-forest/50';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-brick"> *</span>}
      </span>
      {children}
    </label>
  );
}
