import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useResource } from '../lib/useQueue';
import type { Project } from '../lib/types';
import { Badge, Card, Empty, ErrorNote, Spinner, when } from '../components/ui';

export function ProjectsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, error, loading, reload } = useResource<Project[]>(
    `/projects?includeArchived=${includeArchived}`,
  );
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Each project holds job cards; each job card holds the carpentry and painting work.</p>
        </div>
        <div className="actions">
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Show archived
          </label>
          <button className="primary" onClick={() => setCreating((open) => !open)}>
            {creating ? 'Cancel' : 'New project'}
          </button>
        </div>
      </div>

      <ErrorNote error={error} />

      {creating && (
        <NewProjectForm
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}

      <Card>
        {loading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <Empty>No projects yet. Create one to start booking work.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Deadline</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((project) => (
                <tr
                  key={project.id}
                  className="clickable"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <td className="strong">{project.name}</td>
                  <td>{project.client}</td>
                  <td className="muted">{project.deadline ? when(project.deadline) : '—'}</td>
                  <td>
                    <Badge tone={project.status === 'ACTIVE' ? 'ok' : 'neutral'}>
                      {project.status === 'ACTIVE' ? 'Active' : 'Archived'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/projects', {
        name,
        client,
        ...(description ? { description } : {}),
        // The API wants a full ISO timestamp; a date input gives only a date.
        ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
      });
      onCreated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New project">
      <div className="card-body">
        <ErrorNote error={error} />
        <form onSubmit={submit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Project name</label>
              <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="client">Client</label>
              <input
                id="client"
                required
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="deadline">Deadline (optional)</label>
            <input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
      </div>
    </Card>
  );
}
