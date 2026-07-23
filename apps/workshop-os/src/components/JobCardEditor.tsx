import { useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import type { JobCard, Stage } from '../mock/projects';

/**
 * Add/edit dialog for a job card, shared between the create and detail views.
 *
 * `initial` null means "add" — the JC reference is fixed by the caller as the
 * next in sequence and shown read-only. Otherwise it edits an existing card.
 * On save the parent takes the card and updates its own list; the editor holds
 * no state of its own beyond the open form.
 */
export function JobCardEditor({
  initial,
  nextRef,
  onSave,
  onClose,
}: {
  initial: JobCard | null;
  nextRef: string;
  onSave: (card: JobCard) => void;
  onClose: () => void;
}) {
  const editing = initial !== null;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [stage, setStage] = useState<Stage>(initial?.stage ?? 'CARPENTRY');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [fileName, setFileName] = useState(initial?.fileName);

  const ref = initial?.ref ?? nextRef;
  const amountNumber = Number(amount.replace(/[^\d]/g, ''));
  const valid = title.trim().length > 0 && amountNumber > 0;

  function save() {
    if (!valid) return;
    onSave({
      id: initial?.id ?? `card-${Date.now()}`,
      ref,
      title: title.trim(),
      stage,
      description: description.trim(),
      amount: amountNumber,
      fileName,
      status: initial?.status ?? 'ASSIGNED',
      assignee: initial?.assignee,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
          <div>
            <h3 className="text-[17px] font-bold tracking-tight text-ink">
              {editing ? 'Edit job card' : 'Add job card'}
            </h3>
            <p className="text-sm text-muted">{ref}</p>
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
              placeholder="e.g. Tabletop glue-up & sanding"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field label="Stage type" required>
            <div className="grid grid-cols-2 gap-2">
              {(['CARPENTRY', 'PAINTING'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    stage === s
                      ? s === 'CARPENTRY'
                        ? 'border-forest bg-pill-green text-forest'
                        : 'border-brick bg-pill-red text-brick'
                      : 'border-black/10 text-muted hover:bg-black/[0.02]'
                  }`}
                >
                  {s === 'CARPENTRY' ? 'Carpentry' : 'Painting'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What the assignment involves…"
              className={inputClass}
            />
          </Field>

          <Field label="Design attachment">
            {/* Mock only: a click sets a placeholder filename. */}
            <button
              type="button"
              onClick={() => setFileName('design-attachment.pdf')}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-black/15 bg-black/[0.015] px-4 py-3 text-left text-sm text-muted transition hover:bg-black/[0.03]"
            >
              <UploadCloud size={20} />
              {fileName ? (
                <span className="font-medium text-ink">{fileName}</span>
              ) : (
                <span>Click to attach a drawing or photo (PDF, JPG, PNG)</span>
              )}
            </button>
          </Field>

          <Field label="Proposed amount" required>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                LKR
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                placeholder="96,000"
                className={`${inputClass} pl-12`}
              />
            </div>
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
            {editing ? 'Save changes' : 'Add job card'}
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
