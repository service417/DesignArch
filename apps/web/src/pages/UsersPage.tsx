import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { useResource } from '../lib/useQueue';
import type { Role, User } from '../lib/types';
import { Badge, Card, Empty, ErrorNote, Spinner } from '../components/ui';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  CARPENTER: 'Carpenter',
  PAINTER: 'Painter',
  SUPERVISOR: 'Supervisor',
};

export function UsersPage() {
  const [showDeactivated, setShowDeactivated] = useState(false);
  const { data, error, loading, reload } = useResource<User[]>(
    `/users?includeDeactivated=${showDeactivated}`,
  );
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(user: User) {
    const deactivating = user.status === 'ACTIVE';
    if (
      deactivating &&
      !window.confirm(
        `Deactivate ${user.name}? They will be signed out immediately and cannot be ` +
          `assigned new work. Their past work and earnings are kept.`,
      )
    ) {
      return;
    }

    setBusyId(user.id);
    setActionError(null);
    try {
      await api.post(`/users/${user.id}/${deactivating ? 'deactivate' : 'activate'}`);
      await reload();
    } catch (caught) {
      // The server refuses to strand in-flight work or remove the last admin.
      // Surfacing its message verbatim is better than paraphrasing the rule.
      setActionError(caught);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p>Carpenters, painters and supervisors sign in to the mobile app with these accounts.</p>
        </div>
        <div className="actions">
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
            <input
              type="checkbox"
              checked={showDeactivated}
              onChange={(e) => setShowDeactivated(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Show deactivated
          </label>
          <button className="primary" onClick={() => setAdding((open) => !open)}>
            {adding ? 'Cancel' : 'Add person'}
          </button>
        </div>
      </div>

      <ErrorNote error={error} />
      <ErrorNote error={actionError} />

      {adding && (
        <NewUserForm
          onCreated={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}

      <Card>
        {loading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <Empty>No accounts yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Contact</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((user) => (
                <tr key={user.id}>
                  <td className="strong">{user.name}</td>
                  <td>{ROLE_LABEL[user.role]}</td>
                  <td className="muted">
                    {user.email}
                    {user.phone ? <br /> : null}
                    {user.phone}
                  </td>
                  <td>
                    <Badge tone={user.status === 'ACTIVE' ? 'ok' : 'neutral'}>
                      {user.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="small"
                      disabled={busyId === user.id}
                      onClick={() => toggleActive(user)}
                    >
                      {user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                    </button>
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

function NewUserForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('CARPENTER');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/users', {
        name,
        email,
        ...(phone ? { phone } : {}),
        role,
        password,
      });
      onCreated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add person">
      <div className="card-body">
        <ErrorNote error={error} />
        <form onSubmit={submit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="u-name">Full name</label>
              <input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="u-role">Role</label>
              <select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="CARPENTER">Carpenter</option>
                <option value="PAINTER">Painter</option>
                <option value="SUPERVISOR">Supervisor</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="u-email">Email</label>
              <input
                id="u-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-phone">Phone (optional)</label>
              <input
                id="u-phone"
                placeholder="0771234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="u-password">Initial password</label>
            <input
              id="u-password"
              type="text"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              At least 12 characters. Give it to them directly — it is not emailed, and this
              is the only time it is shown.
            </p>
          </div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </Card>
  );
}
