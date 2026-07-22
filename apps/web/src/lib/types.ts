/**
 * Shapes the API actually returns.
 *
 * Monetary amounts are `string` throughout, matching the server's BigInt
 * serialisation. Typing them as string is what stops a careless arithmetic
 * expression compiling.
 */

export type Role = 'ADMIN' | 'CARPENTER' | 'PAINTER' | 'SUPERVISOR';
export type StageType = 'CARPENTRY' | 'PAINTING';

export type StageStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_FOR_INSPECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PRICE_PROPOSED'
  | 'PRICE_DECLINED'
  | 'PRICE_ACCEPTED'
  | 'COMPLETED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  description: string | null;
  deadline: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
}

export interface ProjectDetail extends Project {
  jobCards: Array<{
    id: string;
    title: string;
    description: string | null;
    stages: Array<{
      id: string;
      type: StageType;
      status: StageStatus;
      assigneeId: string | null;
    }>;
  }>;
  completion: { totalStages: number; approvedStages: number; percentage: number };
}

export interface PersonRef {
  id: string;
  name: string;
  role: Role;
}

export interface JobCard {
  id: string;
  title: string;
  description: string | null;
  /**
   * One entry per *assignment*, not per stage type. Several workers can hold the
   * same stage type on a card at once, each progressing independently.
   */
  stages: Array<{
    id: string;
    type: StageType;
    status: StageStatus;
    assigneeId: string | null;
    version: number;
    assignee: PersonRef | null;
    acceptedPrice?: string | null;
  }>;
}

export interface QueuedStage {
  id: string;
  type: StageType;
  status: StageStatus;
  version: number;
  updatedAt: string;
  approvedAt: string | null;
  assignee: PersonRef | null;
  jobCard: {
    id: string;
    title: string;
    project: { id: string; name: string; client: string };
  };
  _count: { photos: number };
  lastPricingEvent: {
    action: 'PROPOSED' | 'REVISED' | 'DECLINED';
    value: string | null;
    reason: string | null;
    createdAt: string;
  } | null;
}

export interface StageDetail {
  id: string;
  type: StageType;
  status: StageStatus;
  version: number;
  sequenceNo: number;
  acceptedPrice: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  assignee: PersonRef | null;
  jobCard: {
    id: string;
    title: string;
    description: string | null;
    project: { id: string; name: string; client: string };
  };
  earning: { id: string; amount: string; status: 'UNPAID' | 'PAID'; paidAt: string | null } | null;
  photos: Array<{
    id: string;
    url: string;
    createdAt: string;
    supervisor: { id: string; name: string };
  }>;
  pricingHistory: Array<{
    id: string;
    action: PricingAction;
    value: string | null;
    reason: string | null;
    createdAt: string;
    actor: PersonRef | null;
  }>;
}

export type PricingAction =
  | 'PROPOSED'
  | 'REVISED'
  | 'ACCEPTED'
  | 'DECLINED'
  /** A supervisor's on-site confirmation that the work genuinely changed. */
  | 'SCOPE_CONFIRMED';

export interface AdminDashboard {
  kpis: {
    activeProjects: number;
    inProgressJobCards: number;
    awaitingMyApproval: number;
    /** Minor units as a string — never parsed into a number. */
    unpaidTotal: string;
  };
  pendingQueue: Array<{
    id: string;
    type: StageType;
    status: StageStatus;
    updatedAt: string;
    assignee: { id: string; name: string } | null;
    jobCard: { id: string; title: string; project: { id: string; name: string } };
    lastPricingEvent: {
      action: PricingAction;
      value: string | null;
      reason: string | null;
      createdAt: string;
    } | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
    client: string;
    deadline: string | null;
    overdue: boolean;
    totalStages: number;
    completedStages: number;
    percentComplete: number;
  }>;
  workers: Array<{
    id: string;
    name: string;
    role: Role;
    openAssignments: number;
    state: 'BUSY' | 'FREE' | 'OVERDUE';
  }>;
}

export interface Attachment {
  id: string;
  filename: string;
  extension: string;
  isPdf: boolean;
  url: string;
  kind: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

export interface Earning {
  id: string;
  amount: string;
  status: 'UNPAID' | 'PAID';
  paidAt: string | null;
  createdAt: string;
  worker: PersonRef;
  stage: {
    id: string;
    type: StageType;
    jobCard: { id: string; title: string; project: { id: string; name: string; client: string } };
  };
}

export interface EarningsResponse {
  earnings: Earning[];
  summary: { count: number; unpaidTotal: string; paidTotal: string };
}

export type NotificationEvent =
  | 'STAGE_ASSIGNED'
  | 'READY_FOR_INSPECTION'
  | 'INSPECTION_APPROVED'
  | 'INSPECTION_REJECTED'
  | 'PRICE_PROPOSED'
  | 'PRICE_REVISED'
  | 'PRICE_ACCEPTED'
  | 'PRICE_DECLINED'
  | 'EARNING_PAID';

export interface Notification {
  id: string;
  eventType: NotificationEvent;
  refType: string;
  refId: string;
  readFlag: boolean;
  createdAt: string;
}

export interface OutstandingRow {
  worker: PersonRef | null;
  unpaidCount: number;
  unpaidTotal: string;
}
