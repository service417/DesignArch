import { useNavigate, useParams } from 'react-router-dom';
import { Archive, Pencil, Trash2 } from 'lucide-react';
import { useProjects } from '../store/projects';
import { dueDisplay, lkr, lkrCompact } from '../mock/projects';
import { Panel } from '../components/ui';
import { PageBar } from '../components/PageBar';

/** One project: its details and KPIs. */
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { getProject, archiveProject, deleteProject } = useProjects();
  const navigate = useNavigate();
  const project = getProject(id);

  if (!project) {
    return (
      <div className="p-8">
        <PageBar back="/projects" breadcrumb="Projects" title="Project not found" />
        <p className="mt-6 text-muted">This project may have been deleted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <PageBar
        back="/projects"
        breadcrumb={
          <>
            Projects <span className="text-muted/50">/</span> {project.name}
          </>
        }
        title={project.name}
        actions={
          <>
            <button
              onClick={() => console.log('edit project')}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:bg-black/[0.03]"
            >
              <Pencil size={16} />
              Edit
            </button>
            {project.hasPayments ? (
              <button
                onClick={() => archiveProject(project.id)}
                title="Projects with payments can be archived, not deleted"
                className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:bg-black/[0.03]"
              >
                <Archive size={16} />
                Archive
              </button>
            ) : (
              <button
                onClick={() => {
                  deleteProject(project.id);
                  navigate('/projects');
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brick px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </>
        }
      />

      {/* details summary */}
      <Panel>
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Detail label="Client" value={project.client} />
              <Detail label="Deadline" value={dueDisplay(project.deadline)} />
              <Detail label="Estimated value" value={lkr(project.value)} />
              <Detail
                label="Status"
                value={project.status === 'ACTIVE' ? 'Active' : 'Archived'}
              />
            </dl>
            <div className="mt-5">
              <div className="text-sm font-medium text-muted">Description</div>
              <p className="mt-1 text-sm text-ink">{project.description}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-cream/70 p-5">
            <div className="text-sm font-medium text-muted">Completion</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-ink">{project.completion}%</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/5">
              <div className="h-full rounded-full bg-forest" style={{ width: `${project.completion}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Mini label="Job cards" value={String(project.jobCards.length)} />
              <Mini label="Value" value={lkrCompact(project.value)} />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold tracking-tight text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
