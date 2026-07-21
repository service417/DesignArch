import { Link, useNavigate } from 'react-router-dom';
import { useResource, usePricingQueue } from '../lib/useQueue';
import { formatMinor } from '../lib/money';
import type { EarningsResponse, OutstandingRow, Project } from '../lib/types';
import { Card, Empty, ErrorNote, Spinner, StatusBadge, howLong } from '../components/ui';

/**
 * Composed from existing endpoints rather than a bespoke `/dashboard` route.
 *
 * Four small reads cost less than the coupling a dedicated summary endpoint
 * would create, and every number here stays traceable to the page that owns it —
 * so a figure on this screen can never drift from the list behind it.
 */
export function DashboardPage() {
  const queue = usePricingQueue();
  const outstanding = useResource<OutstandingRow[]>('/earnings/outstanding');
  const unpaid = useResource<EarningsResponse>('/earnings?status=UNPAID');
  const projects = useResource<Project[]>('/projects');
  const navigate = useNavigate();

  const owedTotal = unpaid.data?.summary.unpaidTotal ?? '0';
  const workersOwed = outstanding.data?.length ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Where things stand this morning.</p>
        </div>
      </div>

      <ErrorNote error={queue.error ?? outstanding.error ?? projects.error} />

      <div className="grid grid-3">
        <Card>
          <Link to="/pricing" style={{ textDecoration: 'none' }}>
            <div className="stat">
              <div className="label">Awaiting your price</div>
              <div className="value">{queue.data?.length ?? '—'}</div>
              <div className="sub">approved stages with no agreed price</div>
            </div>
          </Link>
        </Card>
        <Card>
          <Link to="/earnings" style={{ textDecoration: 'none' }}>
            <div className="stat">
              <div className="label">Owed to workers</div>
              <div className="value money">{formatMinor(owedTotal)}</div>
              <div className="sub">
                across {workersOwed} worker{workersOwed === 1 ? '' : 's'}
              </div>
            </div>
          </Link>
        </Card>
        <Card>
          <Link to="/projects" style={{ textDecoration: 'none' }}>
            <div className="stat">
              <div className="label">Active projects</div>
              <div className="value">{projects.data?.length ?? '—'}</div>
              <div className="sub">not archived</div>
            </div>
          </Link>
        </Card>
      </div>

      <Card
        title="Oldest in the pricing queue"
        action={<Link to="/pricing">View all</Link>}
      >
        {queue.loading ? (
          <Spinner />
        ) : !queue.data || queue.data.length === 0 ? (
          <Empty>Nothing waiting on you.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Job card</th>
                <th>Worker</th>
                <th>Status</th>
                <th>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {queue.data.slice(0, 5).map((stage) => (
                <tr
                  key={stage.id}
                  className="clickable"
                  onClick={() => navigate(`/stages/${stage.id}`)}
                >
                  <td>
                    <span className="strong">{stage.jobCard.title}</span>
                    <br />
                    <span className="muted">{stage.jobCard.project.name}</span>
                  </td>
                  <td>{stage.assignee?.name ?? <span className="muted">Unassigned</span>}</td>
                  <td>
                    <StatusBadge status={stage.status} />
                  </td>
                  <td className="muted">{howLong(stage.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
