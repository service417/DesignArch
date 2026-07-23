import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Check, ClipboardList, FolderClosed, Plus } from 'lucide-react';
import { useProjects } from '../store/projects';
import { draftJobCards, lkr, nextJcRef } from '../mock/projects';
import type { JobCard } from '../mock/projects';
import { Panel } from '../components/ui';
import { PageBar } from '../components/PageBar';
import { JobCardItem } from '../components/JobCardItem';
import { JobCardEditor } from '../components/JobCardEditor';

/** The new-project form: core details plus a job-card list, prefilled as a draft. */
export function CreateProjectPage() {
  const { addProject } = useProjects();
  const navigate = useNavigate();

  const [name, setName] = useState('Oak Dining Set — 6 Seater');
  const [client, setClient] = useState('Villa Serein · Ella');
  const [deadline, setDeadline] = useState('2026-08-22');
  const [value, setValue] = useState('LKR 640,000');
  const [description, setDescription] = useState(
    'Solid oak dining table with matching six chairs. Hand-finished natural oil, ' +
      'mortise-and-tenon joinery. Client requested a warm satin finish and rounded ' +
      'edges throughout.',
  );

  const [cards, setCards] = useState<JobCard[]>(draftJobCards);
  const [editing, setEditing] = useState<JobCard | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  function openAdd() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(card: JobCard) {
    setEditing(card);
    setEditorOpen(true);
  }
  function saveCard(card: JobCard) {
    setCards((prev) =>
      prev.some((c) => c.id === card.id) ? prev.map((c) => (c.id === card.id ? card : c)) : [...prev, card],
    );
    setEditorOpen(false);
  }

  function create() {
    const id = addProject({
      name: name.trim(),
      client: client.trim(),
      location: client.trim(),
      deadline,
      value: Number(value.replace(/[^\d]/g, '')) || 0,
      status: 'ACTIVE',
      completion: 0,
      description: description.trim(),
      hasPayments: false,
      jobCards: cards,
    });
    navigate(`/projects/${id}`);
  }

  return (
    <div className="space-y-6 p-8">
      <PageBar
        back="/projects"
        breadcrumb={
          <>
            Projects <span className="text-muted/50">/</span> New
          </>
        }
        title="Create Project"
        actions={
          <>
            <button
              onClick={() => console.log('save draft')}
              className="rounded-xl border border-black/10 bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:bg-black/[0.03]"
            >
              Save draft
            </button>
            <button
              onClick={create}
              className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
            >
              <Check size={18} strokeWidth={2.4} />
              Create project
            </button>
          </>
        }
      />

      {/* Card A — project details */}
      <Panel>
        <CardHead
          icon={<FolderClosed size={20} />}
          title="Project Details"
          subtitle="Core information for this build."
        />
        <div className="grid grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2">
          <Field label="Project name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Client" required>
            <input value={client} onChange={(e) => setClient(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Deadline" required>
            <div className="relative">
              <Calendar size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
          <Field label="Estimated value">
            <input value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </Panel>

      {/* Card B — job cards */}
      <Panel>
        <CardHead
          icon={<ClipboardList size={20} />}
          title="Job Cards"
          subtitle="Break the build into assignable tasks."
          right={
            <span className="rounded-full bg-pill-neutral px-3 py-1 text-xs font-semibold text-ink/70">
              {cards.length} added
            </span>
          }
        />
        <div className="space-y-3 px-6 pb-6">
          {cards.map((card) => (
            <JobCardItem
              key={card.id}
              card={card}
              onEdit={() => openEdit(card)}
              onDelete={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
            />
          ))}

          <button
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-black/20 py-3.5 text-sm font-semibold text-muted transition hover:border-forest/40 hover:text-forest"
          >
            <Plus size={18} strokeWidth={2.4} />
            Add job card
          </button>

          <div className="flex items-center justify-between border-t border-black/5 pt-4 text-sm">
            <span className="text-muted">Total proposed</span>
            <span className="font-bold text-forest">
              {lkr(cards.reduce((sum, c) => sum + c.amount, 0))}
            </span>
          </div>
        </div>
      </Panel>

      {editorOpen && (
        <JobCardEditor
          initial={editing}
          nextRef={nextJcRef(cards)}
          onSave={saveCard}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-black/10 bg-cream/60 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-forest/50';

export function CardHead({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-pill-green text-forest">
          {icon}
        </span>
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

export function Field({
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
