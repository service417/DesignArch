import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useResource, usePricingQueue } from '../lib/useQueue';

export function Shell() {
  const { user, signOut } = useAuth();
  // Surfaced in the nav because clearing this queue is the job: an admin who
  // never opens the app still needs to know work is waiting on them.
  const { data: queue } = usePricingQueue();
  const waiting = queue?.length ?? 0;

  // The dedicated count endpoint, not the feed: this renders on every screen and
  // should not pull fifty rows to learn the badge is zero.
  const { data: unread } = useResource<{ unread: number }>('/notifications/unread-count');
  const unreadCount = unread?.unread ?? 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>DesignArc</strong>
          <span>Administrator</span>
        </div>

        <NavLink to="/" end className="nav-link">
          Dashboard
        </NavLink>
        <NavLink to="/pricing" className="nav-link">
          Pricing queue
          {waiting > 0 && <span className="nav-count">{waiting}</span>}
        </NavLink>
        <NavLink to="/projects" className="nav-link">
          Projects
        </NavLink>
        <NavLink to="/earnings" className="nav-link">
          Payments
        </NavLink>
        <NavLink to="/users" className="nav-link">
          People
        </NavLink>
        <NavLink to="/notifications" className="nav-link">
          Notifications
          {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
        </NavLink>

        <div className="sidebar-foot">
          <div className="who">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button className="small" onClick={signOut} style={{ width: '100%' }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
