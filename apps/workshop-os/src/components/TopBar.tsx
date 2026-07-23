import { Bell, ChevronDown, Search } from 'lucide-react';
import { currentUser, pageMeta } from '../mock/dashboard';

/** Page title on the left; search, notifications and the user chip on the right. */
export function TopBar() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{pageMeta.title}</h1>
        <p className="mt-0.5 text-sm text-muted">{pageMeta.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder="Search projects, workers, job cards..."
            className="w-72 rounded-xl border border-black/5 bg-card py-2.5 pl-10 pr-3 text-sm text-ink shadow-soft outline-none placeholder:text-muted focus:border-forest/40"
          />
        </div>

        <button
          onClick={() => console.log('notifications')}
          className="relative grid h-11 w-11 place-items-center rounded-xl border border-black/5 bg-card text-ink shadow-soft transition hover:bg-black/[0.03]"
          aria-label="Notifications"
        >
          <Bell size={19} strokeWidth={1.9} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brick ring-2 ring-card" />
        </button>

        <button
          onClick={() => console.log('user menu')}
          className="flex items-center gap-3 rounded-xl border border-black/5 bg-card py-1.5 pl-1.5 pr-3 shadow-soft transition hover:bg-black/[0.03]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-forest text-sm font-semibold text-white">
            {currentUser.initials}
          </span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-semibold text-ink">{currentUser.name}</span>
            <span className="block text-xs text-muted">{currentUser.role}</span>
          </span>
          <ChevronDown size={16} className="text-muted" />
        </button>
      </div>
    </div>
  );
}
