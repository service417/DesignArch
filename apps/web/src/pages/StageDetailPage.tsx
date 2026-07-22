import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useResource } from '../lib/useQueue';
import { formatMinor, parseToMinor } from '../lib/money';
import type { StageDetail } from '../lib/types';
import { Card, Empty, ErrorNote, Spinner, StatusBadge, when } from '../components/ui';

const LEDGER_LABEL = {
  PROPOSED: 'Price offered',
  REVISED: 'Price revised',
  ACCEPTED: 'Accepted by worker',
  DECLINED: 'Declined by worker',
  SCOPE_CONFIRMED: 'Scope change confirmed on site',
} as const;

export function StageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: stage, error, loading, reload } = useResource<StageDetail>(`/stages/${id}`);

  return (
    <>
      <Link to="/pricing" className="back-link">
        ← Back to pricing queue
      </Link>

      <ErrorNote error={error} />
      {loading && <Spinner />}

      {stage && (
        <>
          <div className="page-head">
            <div>
              <h1>{stage.jobCard.title}</h1>
              <p>
                {stage.jobCard.project.name} · {stage.jobCard.project.client} ·{' '}
                {stage.type === 'CARPENTRY' ? 'Carpentry' : 'Painting'}
              </p>
            </div>
            <StatusBadge status={stage.status} />
          </div>

          <div className="grid grid-2">
            <div>
              <Card title="Inspection evidence">
                {stage.photos.length === 0 ? (
                  <Empty>
                    No photographs yet. A supervisor must attach at least one before this
                    stage can be approved.
                  </Empty>
                ) : (
                  <div className="photos">
                    {stage.photos.map((photo) => (
                      <figure key={photo.id}>
                        {/* Signed, short-lived URL — see storage/url-signer.ts */}
                        <a href={photo.url} target="_blank" rel="noreferrer">
                          <img src={photo.url} alt={`Inspection photograph`} loading="lazy" />
                        </a>
                        <figcaption>
                          {photo.supervisor.name}
                          <br />
                          {when(photo.createdAt)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Details">
                <dl className="definition">
                  <dt>Worker</dt>
                  <dd>{stage.assignee?.name ?? '—'}</dd>
                  <dt>Approved</dt>
                  <dd>{when(stage.approvedAt)}</dd>
                  <dt>Completed</dt>
                  <dd>{when(stage.completedAt)}</dd>
                  <dt>Agreed price</dt>
                  <dd>{formatMinor(stage.acceptedPrice)}</dd>
                  {stage.rejectionReason && (
                    <>
                      <dt>Rejection</dt>
                      <dd>{stage.rejectionReason}</dd>
                    </>
                  )}
                  {stage.earning && (
                    <>
                      <dt>Earning</dt>
                      <dd>
                        {formatMinor(stage.earning.amount)} ·{' '}
                        {stage.earning.status === 'PAID'
                          ? `paid ${when(stage.earning.paidAt)}`
                          : 'unpaid'}
                      </dd>
                    </>
                  )}
                </dl>
              </Card>
            </div>

            <div>
              <PricingPanel stage={stage} onDone={reload} />

              <Card title="Price history">
                {stage.pricingHistory.length === 0 ? (
                  <Empty>No pricing activity yet.</Empty>
                ) : (
                  <ul className="timeline">
                    {stage.pricingHistory.map((entry) => (
                      <li key={entry.id}>
                        <span
                          className={`dot ${
                            entry.action === 'ACCEPTED'
                              ? 'accepted'
                              : entry.action === 'DECLINED'
                                ? 'declined'
                                : entry.action === 'SCOPE_CONFIRMED'
                                  ? 'confirmed'
                                  : ''
                          }`}
                        />
                        <div className="body">
                          <div>
                            <span className="strong">{LEDGER_LABEL[entry.action]}</span>
                            {entry.value && <> — {formatMinor(entry.value)}</>}
                          </div>
                          {entry.reason && <div className="muted">“{entry.reason}”</div>}
                          <div className="meta">
                            {entry.actor?.name ?? 'Unknown'} · {when(entry.createdAt)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/**
 * The one place an admin puts money on the table.
 *
 * `expectedVersion` is sent with the write. If a worker accepted or declined
 * while this page was open, the server rejects the stale write rather than
 * letting it silently overwrite what happened in between.
 */
function PricingPanel({ stage, onDone }: { stage: StageDetail; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const canPrice = stage.status === 'APPROVED' || stage.status === 'PRICE_DECLINED';
  const isRevision = stage.status === 'PRICE_DECLINED';

  if (!canPrice) {
    return (
      <Card title="Pricing">
        <Empty>
          {stage.status === 'PRICE_PROPOSED'
            ? 'A price is with the worker, waiting for them to accept or decline.'
            : stage.status === 'COMPLETED' || stage.status === 'PRICE_ACCEPTED'
              ? 'The price has been agreed and the earning recorded.'
              : 'This stage cannot be priced until a supervisor has approved it.'}
        </Empty>
      </Card>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const minor = parseToMinor(amount);
    if (minor === null) {
      setError(new Error('Enter an amount in rupees, for example 65000 or 65000.50.'));
      return;
    }

    setBusy(true);
    try {
      await api.post(`/stages/${stage.id}/price`, {
        amount: minor,
        revision: isRevision,
        expectedVersion: stage.version,
      });
      setAmount('');
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={isRevision ? 'Revise the price' : 'Set a price'}>
      <div className="card-body">
        <ErrorNote error={error} />
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="amount">Amount (LKR)</label>
            <input
              id="amount"
              inputMode="decimal"
              placeholder="65000.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {parseToMinor(amount) !== null && (
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Offering {formatMinor(String(parseToMinor(amount)))}
              </p>
            )}
          </div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Sending…' : isRevision ? 'Send revised price' : 'Send price to worker'}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 14 }}>
          The worker accepts or declines. Nothing is owed until they accept.
        </p>
      </div>
    </Card>
  );
}
