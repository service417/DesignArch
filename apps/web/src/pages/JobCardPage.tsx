import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, tokens } from '../lib/api';
import { useResource } from '../lib/useQueue';
import { formatMinor } from '../lib/money';
import type { Attachment, JobCard, StageType, User } from '../lib/types';
import { FileCarousel } from '../components/FileCarousel';
import { Card, Empty, ErrorNote, Spinner, StatusBadge } from '../components/ui';

interface JobCardDetail extends JobCard {
  project: { id: string; name: string; client: string; status: string };
}

/**
 * One job card: its brief, its design files, and every assignment on it.
 *
 * Assignments are listed individually rather than rolled up per stage type,
 * because with parallel working three carpenters on one card are three separate
 * pieces of work — each with its own status, evidence, price and earning.
 */
export function JobCardPage() {
  const { id } = useParams<{ id: string }>();
  const card = useResource<JobCardDetail>(`/job-cards/${id}`);
  const files = useResource<Attachment[]>(`/job-cards/${id}/attachments`);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const carpentry = card.data?.stages.filter((s) => s.type === 'CARPENTRY') ?? [];
  const painting = card.data?.stages.filter((s) => s.type === 'PAINTING') ?? [];

  return (
    <>
      <Link to="/projects" className="back-link">
        ← Back to projects
      </Link>

      <ErrorNote error={card.error} />
      {card.loading && <Spinner />}

      {card.data && (
        <>
          <div className="page-head">
            <div>
              <h1>{card.data.title}</h1>
              <p>
                {card.data.project.name} · {card.data.project.client}
              </p>
            </div>
          </div>

          {card.data.description && (
            <Card title="Specification">
              <div className="card-body">{card.data.description}</div>
            </Card>
          )}

          <Card
            title={`Design files (${files.data?.length ?? 0})`}
            action={
              <UploadButton
                jobCardId={id!}
                onUploaded={() => void files.reload()}
              />
            }
          >
            {files.loading ? (
              <Spinner />
            ) : (
              <FileCarousel
                attachments={files.data ?? []}
                onRemove={async (attachmentId) => {
                  if (!window.confirm('Remove this design file?')) return;
                  await api.delete(`/job-cards/attachments/${attachmentId}`);
                  void files.reload();
                }}
              />
            )}
          </Card>

          <AssignmentGroup
            title="Carpentry"
            stages={carpentry}
            onOpen={(stageId) => navigate(`/stages/${stageId}`)}
          />
          <AssignmentGroup
            title="Painting"
            stages={painting}
            onOpen={(stageId) => navigate(`/stages/${stageId}`)}
            note={
              carpentry.length > 0
                ? 'Painting cannot start until every carpentry assignment has passed inspection.'
                : undefined
            }
          />

          <Card
            title="Add another worker"
            action={
              <button className="small primary" onClick={() => setAdding((open) => !open)}>
                {adding ? 'Cancel' : 'Assign someone'}
              </button>
            }
          >
            {adding ? (
              <AddAssignment
                jobCardId={id!}
                onAdded={() => {
                  setAdding(false);
                  void card.reload();
                }}
              />
            ) : (
              <Empty>
                Several workers can hold the same stage on this card at once. Each is
                inspected, priced and paid separately.
              </Empty>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function AssignmentGroup({
  title,
  stages,
  onOpen,
  note,
}: {
  title: string;
  stages: JobCard['stages'];
  onOpen: (stageId: string) => void;
  note?: string;
}) {
  if (stages.length === 0) return null;

  return (
    <Card title={`${title} — ${stages.length} assignment${stages.length === 1 ? '' : 's'}`}>
      {note && (
        <p className="muted" style={{ margin: 0, padding: '10px 16px 0', fontSize: 13 }}>
          {note}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Worker</th>
            <th>Status</th>
            <th className="money">Agreed</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <tr key={stage.id} className="clickable" onClick={() => onOpen(stage.id)}>
              <td className="strong">
                {stage.assignee?.name ?? <span className="muted">Unassigned — awaiting reassignment</span>}
              </td>
              <td>
                <StatusBadge status={stage.status} />
              </td>
              <td className="money">
                {stage.acceptedPrice ? formatMinor(stage.acceptedPrice) : <span className="muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * Uploads go through fetch directly rather than the JSON api helper: a multipart
 * body must not carry a Content-Type header we set ourselves, or the browser
 * cannot append its own boundary.
 */
function UploadButton({ jobCardId, onUploaded }: { jobCardId: string; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/v1/job-cards/${jobCardId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? 'Upload failed.');
      }
      onUploaded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="actions">
      {error && <span className="muted" style={{ color: 'var(--danger)' }}>{error}</span>}
      <input
        ref={input}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button className="small primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : 'Add file'}
      </button>
    </div>
  );
}

function AddAssignment({ jobCardId, onAdded }: { jobCardId: string; onAdded: () => void }) {
  const [type, setType] = useState<StageType>('CARPENTRY');
  const workers = useResource<User[]>(
    `/users/assignable?role=${type === 'CARPENTRY' ? 'CARPENTER' : 'PAINTER'}`,
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/job-cards/${jobCardId}/stages`, {
        type,
        ...(assigneeId ? { assigneeId } : {}),
      });
      onAdded();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-body">
      <ErrorNote error={error} />
      <div className="field-row">
        <div className="field">
          <label htmlFor="stage-type">Stage</label>
          <select
            id="stage-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as StageType);
              // The previously chosen worker holds the wrong role now.
              setAssigneeId('');
            }}
          >
            <option value="CARPENTRY">Carpentry</option>
            <option value="PAINTING">Painting</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="assignee">Worker</label>
          <select
            id="assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Leave unassigned for now</option>
            {workers.data?.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="primary" disabled={busy} onClick={submit}>
        {busy ? 'Adding…' : 'Add assignment'}
      </button>
    </div>
  );
}
