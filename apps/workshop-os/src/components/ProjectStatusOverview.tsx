import { projects } from '../mock/dashboard';
import { Panel, PanelHead } from './ui';

/** Active builds and their completion, as a compact table. */
export function ProjectStatusOverview() {
  return (
    <Panel>
      <PanelHead
        title="Project Status Overview"
        subtitle="Active builds and completion."
        right={
          <button
            onClick={() => console.log('view all projects')}
            className="text-sm font-semibold text-forest hover:underline"
          >
            View all projects →
          </button>
        }
      />
      <div className="px-6 pb-4 pt-4">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="pb-2 font-semibold">Project</th>
              <th className="pb-2 font-semibold">Due</th>
              <th className="pb-2 font-semibold">Value</th>
              <th className="pb-2 font-semibold">Completion</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr
                key={project.name}
                className="border-t border-black/5 transition hover:bg-black/[0.02]"
              >
                <td className="py-3 pr-4">
                  <div className="font-semibold text-ink">{project.name}</div>
                  <div className="text-sm text-muted">{project.location}</div>
                </td>
                <td className="py-3 pr-4 align-middle">
                  <span className={project.dueUrgent ? 'font-semibold text-brick' : 'text-ink'}>
                    {project.due}
                  </span>
                </td>
                <td className="py-3 pr-4 align-middle font-medium text-ink">{project.value}</td>
                <td className="py-3 align-middle">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-black/5">
                      <div
                        className="h-full rounded-full bg-forest"
                        style={{ width: `${project.completion}%` }}
                      />
                    </div>
                    <span className="w-9 text-sm font-medium text-ink">{project.completion}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
