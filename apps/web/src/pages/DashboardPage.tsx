import { Link, useNavigate } from 'react-router-dom';
import { useResource } from '../lib/useQueue';
import { formatMinor } from '../lib/money';
import type { AdminDashboard } from '../lib/types';
import { Card, Empty, ErrorNote, Spinner, StatusBadge, howLong, when } from '../components/ui';

/**
 * The Admin's morning screen (FR-9.1).
 *
 * One request now, where this used to compose four. These figures are read
 * together and are meant to agree with one another: assembling them from
 * separate endpoints let the KPI and the list beneath it disagree by however
 * long the second request took.
 */
export function DashboardPage() {
  const { data, error, loading } = useResource<AdminDashboard>('/dashboard/admin');
  const navigate = useNavigate();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Where things stand this morning.</p>
        </div>
      </div>

      <ErrorNote error={error} />
      {loading && <Spinner />}

      {data && (
        <>
          <div className="grid grid-4">
            <Kpi
              label="Active projects"
              value={String(data.kpis.activeProjects)}
              sub="not archived"
              to="/projects"
            />
            <Kpi
              label="Job cards in progress"
              value={String(data.kpis.inProgressJobCards)}
              sub="at least one assignment under way"
              to="/projects"
            />
            <Kpi
              label="Awaiting my approval"
              value={String(data.kpis.awaitingMyApproval)}
              sub="approved work with no agreed price"
              to="/pricing"
              urgent={data.kpis.awaitingMyApproval > 0}
            />
            <Kpi
              label="Unpaid total"
              value={formatMinor(data.kpis.unpaidTotal)}
              sub="owed to workers"
              to="/earnings"
              money
            />
          </div>

          <Card title="Waiting on you" action={<Link to="/pricing">View all</Link>}>
            {data.pendingQueue.length === 0 ? (
              <Empty>Nothing waiting. Every approved assignment has a price on it.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Job card</th>
                    <th>Worker</th>
                    <th>Status</th>
                    <th>Last offer</th>
                    <th>Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingQueue.map((stage) => (
                    <tr
                      key={stage.id}
                      className="clickable"
                      onClick={() => navigate(`/stages/${stage.id}`)}
                    >
                      <td>
                        <span className="strong">{stage.jobCard.title}</span>
                        <br />
                        <span className="muted">
                          {stage.jobCard.project.name} ·{' '}
                          {stage.type === 'CARPENTRY' ? 'Carpentry' : 'Painting'}
                        </span>
                      </td>
                      <td>{stage.assignee?.name ?? <span className="muted">Unassigned</span>}</td>
                      <td>
                        <StatusBadge status={stage.status} />
                      </td>
                      <td>
                        {stage.lastPricingEvent?.action === 'SCOPE_CONFIRMED' ? (
                          // Surfaced here because it changes what this row means:
                          // a supervisor has already been out and verified the
                          // change, so the revision it is waiting for is evidenced.
                          <span className="scope-confirmed">Scope confirmed on site</span>
                        ) : stage.lastPricingEvent?.value ? (
                          formatMinor(stage.lastPricingEvent.value)
                        ) : stage.lastPricingEvent?.action === 'DECLINED' ? (
                          <span className="muted">Declined</span>
                        ) : (
                          <span className="muted">Not yet priced</span>
                        )}
                      </td>
                      <td className="muted">{howLong(stage.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="grid grid-2">
            <Card title="Project status">
              {data.projects.length === 0 ? (
                <Empty>No active projects.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Deadline</th>
                      <th style={{ width: 170 }}>Complete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.map((project) => (
                      <tr
                        key={project.id}
                        className="clickable"
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        <td>
                          <span className="strong">{project.name}</span>
                          <br />
                          <span className="muted">{project.client}</span>
                        </td>
                        <td className={project.overdue ? 'overdue' : 'muted'}>
                          {project.deadline ? when(project.deadline).split(',')[0] : '—'}
                          {project.overdue && (
                            <>
                              <br />
                              <span className="overdue strong">Overdue</span>
                            </>
                          )}
                        </td>
                        <td>
                          <div className="bar">
                            <i style={{ width: `${project.percentComplete}%` }} />
                          </div>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {project.completedStages} of {project.totalStages} ·{' '}
                            {project.percentComplete}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Worker activity">
              {data.workers.length === 0 ? (
                <Empty>No active workers.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Open jobs</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workers.map((worker) => (
                      <tr key={worker.id}>
                        <td>
                          <span className="strong">{worker.name}</span>
                          <br />
                          <span className="muted">
                            {worker.role === 'CARPENTER' ? 'Carpenter' : 'Painter'}
                          </span>
                        </td>
                        <td>{worker.openAssignments}</td>
                        <td>
                          <span className={`badge badge-${WORKER_TONE[worker.state]}`}>
                            {WORKER_LABEL[worker.state]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

/** Overdue outranks busy: it is the one that needs something done about it. */
const WORKER_TONE: Record<string, string> = {
  OVERDUE: 'danger',
  BUSY: 'info',
  FREE: 'ok',
};

const WORKER_LABEL: Record<string, string> = {
  OVERDUE: 'Overdue',
  BUSY: 'Busy',
  FREE: 'Free',
};

function Kpi({
  label,
  value,
  sub,
  to,
  money = false,
  urgent = false,
}: {
  label: string;
  value: string;
  sub: string;
  to: string;
  money?: boolean;
  urgent?: boolean;
}) {
  return (
    <Card>
      <Link to={to} style={{ textDecoration: 'none' }}>
        <div className="stat">
          <div className="label">{label}</div>
          <div className={`value${money ? ' money' : ''}${urgent ? ' urgent' : ''}`}>{value}</div>
          <div className="sub">{sub}</div>
        </div>
      </Link>
    </Card>
  );
}
