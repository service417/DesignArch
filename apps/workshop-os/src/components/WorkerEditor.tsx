import { useState } from 'react';
import { X } from 'lucide-react';
import { ROLES } from '../mock/workers';
import type { Worker, WorkerRole } from '../mock/workers';

/**
 * Add/edit dialog for a worker, shared between the Add button and each card's
 * edit action. `initial` null means "add". The parent takes the finished worker
 * and writes it to the store; the editor holds only the open form.
 */
export function WorkerEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Worker | null;
  onSave: (worker: Omit<Worker, 'id'>) => void;
  onClose: () => void;
}) {
  const editing = initial !== null;
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<WorkerRole>(initial?.role ?? 'Carpenter');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [active, setActive] = useState(initial ? initial.status === 'ACTIVE' : true);

  const valid = name.trim().length > 0;

  function save() {
    if (!valid) return;
    onSave({
      name: name.trim(),
      role,
      phone: phone.trim(),
      email: email.trim(),
      status: active ? 'ACTIVE' : 'INACTIVE',
      // Stats are operational, not entered by hand — preserved on edit, zeroed
      // for a new hire who has not been given work yet.
      joined: initial?.joined ?? new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      activeJobs: initial?.activeJobs ?? 0,
      completedJobs: initial?.completedJobs ?? 0,
      availability: initial?.availability ?? 'FREE',
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
          <h3 className="text-[17px] font-bold tracking-tight text-ink">
            {editing ? 'Edit worker' : 'Add worker'}
          </h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Full name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nuwan Fernando"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field label="Role" required>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                    role === r
                      ? 'border-forest bg-pill-green text-forest'
                      : 'border-black/10 text-muted hover:bg-black/[0.02]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07X XXX XXXX"
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@designarc.lk"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Status">
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-cream/60 px-3 py-2.5 text-sm"
            >
              <span className="font-medium text-ink">{active ? 'Active' : 'Inactive'}</span>
              <span
                className={`relative h-6 w-11 rounded-full transition ${active ? 'bg-forest' : 'bg-black/15'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    active ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
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
            {editing ? 'Save changes' : 'Add worker'}
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
