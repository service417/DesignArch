import { Link, useLocation } from 'react-router-dom';
import { navItems, workshopCapacity } from '../mock/dashboard';

/** The fixed dark rail: brand, navigation, and a pinned capacity gauge. */
export function Sidebar() {
  const { pathname } = useLocation();

  // A nav item is active when the path matches it. Dashboard is exact ('/');
  // the rest also light up on their sub-routes, so Projects stays highlighted
  // on /projects/new and /projects/:id.
  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-forest-deep px-4 py-6 text-white">
      {/* brand */}
      <Link to="/" className="flex items-center gap-3 px-2">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest text-lg font-extrabold">
          DA
        </span>
        <div className="leading-tight">
          <div className="font-bold">DesignArc</div>
          <div className="text-xs text-white/50">Workshop OS</div>
        </div>
      </Link>

      {/* nav */}
      <nav className="mt-8 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-forest text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1.5 text-[11px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* capacity gauge, pinned to the bottom */}
      <div className="mt-auto rounded-2xl bg-white/5 p-4">
        <div className="text-xs font-medium text-white/70">{workshopCapacity.label}</div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-forest"
            style={{ width: `${workshopCapacity.percent}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-white/50">
          {workshopCapacity.assigned} of {workshopCapacity.total} workers assigned
        </div>
      </div>
    </aside>
  );
}
