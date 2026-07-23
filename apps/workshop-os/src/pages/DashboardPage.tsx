import { TopBar } from '../components/TopBar';
import { KpiCards } from '../components/KpiCards';
import { PendingApprovals } from '../components/PendingApprovals';
import { WorkByStage } from '../components/WorkByStage';
import { ProjectStatusOverview } from '../components/ProjectStatusOverview';
import { WorkerActivity } from '../components/WorkerActivity';

/** The dashboard landing view — KPIs, the approval queue, and the overviews. */
export function DashboardPage() {
  return (
    <div className="space-y-6 p-8">
      <TopBar />
      <KpiCards />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PendingApprovals />
        </div>
        <div>
          <WorkByStage />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProjectStatusOverview />
        </div>
        <div>
          <WorkerActivity />
        </div>
      </div>
    </div>
  );
}
