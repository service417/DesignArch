import { useNavigate } from 'react-router-dom';
import { usePricingQueue } from '../lib/useQueue';
import { formatMinor } from '../lib/money';
import { Card, Empty, ErrorNote, Spinner, StatusBadge, howLong } from '../components/ui';

/**
 * Stages approved and awaiting a price, plus prices that were declined and need
 * revising. The server sorts oldest-first: this is a queue to clear, so the
 * stage that has waited longest is the one that needs attention.
 */
export function PricingQueuePage() {
  const { data, error, loading } = usePricingQueue();
  const navigate = useNavigate();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pricing queue</h1>
          <p>Work that has passed inspection and is waiting on a price from you.</p>
        </div>
      </div>

      <ErrorNote error={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <Empty>Nothing waiting. Every approved stage has been priced.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Job card</th>
                <th>Project</th>
                <th>Worker</th>
                <th>Status</th>
                <th>Last offer</th>
                <th>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {data.map((stage) => (
                <tr
                  key={stage.id}
                  className="clickable"
                  onClick={() => navigate(`/stages/${stage.id}`)}
                >
                  <td>
                    <span className="strong">{stage.jobCard.title}</span>
                    <br />
                    <span className="muted">
                      {stage.type === 'CARPENTRY' ? 'Carpentry' : 'Painting'} ·{' '}
                      {stage._count.photos} photo{stage._count.photos === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td>
                    {stage.jobCard.project.name}
                    <br />
                    <span className="muted">{stage.jobCard.project.client}</span>
                  </td>
                  <td>{stage.assignee?.name ?? <span className="muted">Unassigned</span>}</td>
                  <td>
                    <StatusBadge status={stage.status} />
                  </td>
                  <td>
                    {stage.lastPricingEvent?.value ? (
                      formatMinor(stage.lastPricingEvent.value)
                    ) : stage.lastPricingEvent?.action === 'DECLINED' ? (
                      <span className="muted">
                        Declined{stage.lastPricingEvent.reason ? ' — ' : ''}
                        {stage.lastPricingEvent.reason}
                      </span>
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
    </>
  );
}
