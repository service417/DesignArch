import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useResource } from '../lib/useQueue';
import { formatMinor } from '../lib/money';
import type { EarningsResponse, OutstandingRow } from '../lib/types';
import { Badge, Card, Empty, ErrorNote, Spinner, when } from '../components/ui';

export function EarningsPage() {
  const outstanding = useResource<OutstandingRow[]>('/earnings/outstanding');
  const [filter, setFilter] = useState<'UNPAID' | 'PAID' | ''>('UNPAID');
  const earnings = useResource<EarningsResponse>(`/earnings${filter ? `?status=${filter}` : ''}`);

  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function markPaid(id: string, worker: string, amount: string) {
    // A payment record cannot be reversed — the database refuses to return a
    // paid earning to unpaid — so this is confirmed before it is written.
    const reference = window.prompt(
      `Record ${formatMinor(amount)} as paid to ${worker}?\n\n` +
        `This cannot be undone. Add a reference if you have one (cheque or transfer number).`,
      '',
    );
    if (reference === null) return;

    setPaying(id);
    setError(null);
    try {
      await api.post(`/earnings/${id}/pay`, reference.trim() ? { reference: reference.trim() } : {});
      await Promise.all([earnings.reload(), outstanding.reload()]);
    } catch (caught) {
      setError(caught);
    } finally {
      setPaying(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            Recording a payment notes that money changed hands outside the system. It does
            not transfer funds.
          </p>
        </div>
      </div>

      <ErrorNote error={error} />
      <ErrorNote error={outstanding.error} />

      <Card title="Owed by worker">
        {outstanding.loading ? (
          <Spinner />
        ) : !outstanding.data || outstanding.data.length === 0 ? (
          <Empty>Nothing outstanding. Every accepted earning has been paid.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Unpaid stages</th>
                <th className="money">Owed</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.data.map((row) => (
                <tr key={row.worker?.id ?? 'unknown'}>
                  <td className="strong">{row.worker?.name ?? 'Unknown worker'}</td>
                  <td>{row.unpaidCount}</td>
                  <td className="money strong">{formatMinor(row.unpaidTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Earnings"
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'UNPAID' | 'PAID' | '')}
            style={{ width: 'auto' }}
          >
            <option value="UNPAID">Unpaid</option>
            <option value="PAID">Paid</option>
            <option value="">All</option>
          </select>
        }
      >
        {earnings.loading ? (
          <Spinner />
        ) : !earnings.data || earnings.data.earnings.length === 0 ? (
          <Empty>No earnings match this filter.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Work</th>
                <th className="money">Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {earnings.data.earnings.map((earning) => (
                <tr key={earning.id}>
                  <td className="strong">{earning.worker.name}</td>
                  <td>
                    <Link to={`/stages/${earning.stage.id}`}>
                      {earning.stage.jobCard.title}
                    </Link>
                    <br />
                    <span className="muted">{earning.stage.jobCard.project.name}</span>
                  </td>
                  <td className="money strong">{formatMinor(earning.amount)}</td>
                  <td>
                    {earning.status === 'PAID' ? (
                      <Badge tone="ok">Paid {when(earning.paidAt)}</Badge>
                    ) : (
                      <Badge tone="warn">Unpaid</Badge>
                    )}
                  </td>
                  <td>
                    {earning.status === 'UNPAID' && (
                      <button
                        className="small primary"
                        disabled={paying === earning.id}
                        onClick={() =>
                          markPaid(earning.id, earning.worker.name, earning.amount)
                        }
                      >
                        {paying === earning.id ? 'Recording…' : 'Record payment'}
                      </button>
                    )}
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
