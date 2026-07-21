import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useResource } from '../lib/useQueue';
import type { Notification } from '../lib/types';
import { Card, Empty, ErrorNote, Spinner, when } from '../components/ui';

/** Plain English for each event. The enum names are for the wire, not for people. */
const EVENT_TEXT: Record<Notification['eventType'], string> = {
  STAGE_ASSIGNED: 'A stage was assigned',
  READY_FOR_INSPECTION: 'Work is ready for inspection',
  INSPECTION_APPROVED: 'An inspection was approved',
  INSPECTION_REJECTED: 'An inspection was rejected',
  PRICE_PROPOSED: 'A price was offered',
  PRICE_REVISED: 'A price was revised',
  PRICE_ACCEPTED: 'A worker accepted a price',
  PRICE_DECLINED: 'A worker declined a price',
  EARNING_PAID: 'An earning was recorded as paid',
};

/** Only stage references have a page to open; earnings live in a list. */
function linkFor(notification: Notification): string {
  return notification.refType === 'stage'
    ? `/stages/${notification.refId}`
    : '/earnings';
}

export function NotificationsPage() {
  const { data, error, loading, reload } = useResource<Notification[]>('/notifications');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function open(notification: Notification) {
    if (!notification.readFlag) {
      // Fire and forget: failing to clear a badge must not stop navigation.
      void api.post(`/notifications/${notification.id}/read`).catch(() => {});
    }
    navigate(linkFor(notification));
  }

  async function readAll() {
    setBusy(true);
    try {
      await api.post('/notifications/read-all');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const unread = data?.filter((n) => !n.readFlag).length ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>Everything that happened on work you are party to.</p>
        </div>
        {unread > 0 && (
          <button className="small" onClick={readAll} disabled={busy}>
            {busy ? 'Clearing…' : `Mark all ${unread} as read`}
          </button>
        )}
      </div>

      <ErrorNote error={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <table>
            <tbody>
              {data.map((notification) => (
                <tr
                  key={notification.id}
                  className="clickable"
                  onClick={() => open(notification)}
                >
                  <td style={{ width: 8 }}>
                    {!notification.readFlag && <span className="unread-dot" />}
                  </td>
                  <td className={notification.readFlag ? 'muted' : 'strong'}>
                    {EVENT_TEXT[notification.eventType]}
                  </td>
                  <td className="muted">{when(notification.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
