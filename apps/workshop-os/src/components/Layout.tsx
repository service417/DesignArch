import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

/** The app frame: the fixed dark rail beside a scrollable cream canvas. */
export function Layout() {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
