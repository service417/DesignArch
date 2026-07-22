import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useResource } from '../lib/useQueue';
import type { JobCard, ProjectDetail, User } from '../lib/types';
import { Badge, Card, Empty, ErrorNote, Spinner, StatusBadge } from '../components/ui';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const project = useResource<ProjectDetail>(`/projects/${id}`);
  const jobCards = useResource<JobCard[]>(`/projects/${id}/job-cards`);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  async function toggleArchive() {
    if (!project.data) return;
    const archiving = project.data.status === 'ACTIVE';
    if (
      archiving &&
      !window.confirm(
        `Archive ${project.data.name}? It stays readable and its earnings are untouched, ` +
          `but no new job cards can be added.`,
      )
    ) {
      return;
    }
    await api.post(`/projects/${project.data.id}/${archiving ? 'archive' : 'unarchive'}`);
    void project.reload();
  }

  return (
    <>
      <Link to="/projects" className="back-link">
        ← Back to projects
      </Link>

      <ErrorNote error={project.error} />
      {project.loading && <Spinner />}

      {project.data && (
        <>
          <div className="page-head">
            <div>
              <h1>{project.data.name}</h1>
              <p>
                {project.data.client}
                {project.data.description ? ` · ${project.data.description}` : ''}
              </p>
            </div>
            <div className="actions">
              <Badge tone={project.data.status === 'ACTIVE' ? 'ok' : 'neutral'}>
                {project.data.status === 'ACTIVE' ? 'Active' : 'Archived'}
              </Badge>
              <button className="small" onClick={toggleArchive}>
                {project.data.status === 'ACTIVE' ? 'Archive' : 'Unarchive'}
              </button>
            </div>
          </div>

          <Card title="Progress">
            <div className="card-body">
              <div className="bar">
                <i style={{ width: `${project.data.completion.percentage}%` }} />
              </div>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {project.data.completion.approvedStages} of{' '}
                {project.data.completion.totalStages} stages inspected and approved (
                {project.data.completion.percentage}%). Pricing and payment follow
                separately.
              </p>
            </div>
          </Card>

          <Card
            title="Job cards"
            action={
              project.data.status === 'ACTIVE' && (
                <button className="small primary" onClick={() => setAdding((open) => !open)}>
                  {adding ? 'Cancel' : 'New job card'}
                </button>
              )
            }
          >
            {jobCards.loading ? (
              <Spinner />
            ) : !jobCards.data || jobCards.data.length === 0 ? (
              <Empty>No job cards yet.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Job card</th>
                    <th>Stage</th>
                    <th>Worker</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobCards.data.flatMap((card) =>
                    card.stages.length === 0
                      ? [
                          <tr key={card.id}>
                            <td className="strong">{card.title}</td>
                            <td colSpan={3} className="muted">
                              No stages
                            </td>
                          </tr>,
                        ]
                      : card.stages.map((stage, index) => (
                          <tr
                            key={stage.id}
                            className="clickable"
                            onClick={() => navigate(`/stages/${stage.id}`)}
                          >
                            <td className="strong">
                              {/* Only the first row of a card is labelled: with
                                  parallel working a card can have several rows,
                                  and repeating the title reads as separate jobs. */}
                              {index === 0 && (
                                <Link
                                  to={`/job-cards/${card.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {card.title}
                                </Link>
                              )}
                            </td>
                            <td>{stage.type === 'CARPENTRY' ? 'Carpentry' : 'Painting'}</td>
                            <td>
                              {stage.assignee?.name ?? (
                                <span className="muted">Unassigned</span>
                              )}
                            </td>
                            <td>
                              <StatusBadge status={stage.status} />
                            </td>
                          </tr>
                        )),
                  )}
                </tbody>
              </table>
            )}
          </Card>

          {adding && id && (
            <NewJobCardForm
              projectId={id}
              onCreated={() => {
                setAdding(false);
                void jobCards.reload();
                void project.reload();
              }}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * Workers are filtered by role for each stage, because the API refuses a
 * mismatch (a painter cannot hold carpentry). Offering only valid choices means
 * the admin never has to discover that rule by hitting an error.
 */
function NewJobCardForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const carpenters = useResource<User[]>('/users/assignable?role=CARPENTER');
  const painters = useResource<User[]>('/users/assignable?role=PAINTER');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Sets rather than single ids: a stage can be worked by several people at
  // once, each becoming an independent assignment.
  const [carpenterIds, setCarpenterIds] = useState<string[]>([]);
  const [painterIds, setPainterIds] = useState<string[]>([]);
  const [withPainting, setWithPainting] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const stages: Array<{ type: 'CARPENTRY' | 'PAINTING'; assigneeIds?: string[] }> = [
      { type: 'CARPENTRY', ...(carpenterIds.length ? { assigneeIds: carpenterIds } : {}) },
    ];
    if (withPainting) {
      stages.push({
        type: 'PAINTING',
        ...(painterIds.length ? { assigneeIds: painterIds } : {}),
      });
    }

    try {
      await api.post(`/projects/${projectId}/job-cards`, {
        title,
        ...(description ? { description } : {}),
        stages,
      });
      onCreated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New job card">
      <div className="card-body">
        <ErrorNote error={error} />
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              required
              placeholder="Walk-in wardrobe"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="jc-description">Description</label>
            <textarea
              id="jc-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <WorkerPicker
            label="Carpenters"
            workers={carpenters.data ?? []}
            selected={carpenterIds}
            onChange={setCarpenterIds}
          />

          <div className="field">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={withPainting}
                onChange={(e) => setWithPainting(e.target.checked)}
                style={{ width: 'auto' }}
              />
              This job also needs painting
            </label>
          </div>

          {withPainting && (
            <>
              <WorkerPicker
                label="Painters"
                workers={painters.data ?? []}
                selected={painterIds}
                onChange={setPainterIds}
              />
              <p className="muted" style={{ margin: '-6px 0 12px', fontSize: 12 }}>
                Painting cannot start until every carpentry assignment has passed
                inspection.
              </p>
            </>
          )}

          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create job card'}
          </button>
        </form>
      </div>
    </Card>
  );
}

/**
 * Pick any number of workers for one stage.
 *
 * Checkboxes rather than a multi-select: a multi-select needs ctrl-click to add a
 * second name, which is exactly the interaction people miss — and the whole point
 * of this control is that picking more than one is normal here.
 */
function WorkerPicker({
  label,
  workers,
  selected,
  onChange,
}: {
  label: string;
  workers: User[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {selected.length > 0 && (
          <span className="muted"> — {selected.length} selected, working in parallel</span>
        )}
      </label>
      {workers.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          No active workers with this role.
        </p>
      ) : (
        <div className="picker">
          {workers.map((worker) => {
            const checked = selected.includes(worker.id);
            return (
              <label key={worker.id} className={`picker-item${checked ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== worker.id)
                        : [...selected, worker.id],
                    )
                  }
                />
                {worker.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
