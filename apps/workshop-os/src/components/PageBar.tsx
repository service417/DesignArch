import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

/** Back button, muted breadcrumb, bold title, and a right-aligned action slot. */
export function PageBar({
  breadcrumb,
  title,
  back = -1,
  actions,
}: {
  breadcrumb: ReactNode;
  title: string;
  back?: string | number;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => (typeof back === 'number' ? navigate(back) : navigate(back))}
          className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-card text-ink shadow-soft transition hover:bg-black/[0.03]"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <div className="text-sm text-muted">{breadcrumb}</div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
