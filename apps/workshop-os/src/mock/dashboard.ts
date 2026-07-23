/**
 * All dashboard data lives here as typed objects, so swapping in a real API is a
 * matter of replacing these exports with fetch calls of the same shape. Nothing
 * in the components hard-codes a number.
 *
 * Money is kept as a formatted display string on purpose: this is a
 * presentation prototype, and there is no arithmetic to do. A real build would
 * carry minor-unit integers and format at the edge.
 */

import type { LucideIcon } from 'lucide-react';
import {
  CreditCard,
  FolderClosed,
  LayoutDashboard,
  FileText,
  CheckCircle2,
  Users,
  BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------- sidebar

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: number;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Projects', icon: FolderClosed, path: '/projects' },
  { label: 'Job Cards', icon: FileText, path: '/job-cards' },
  { label: 'Workers', icon: Users, path: '/workers' },
  { label: 'Approvals', icon: CheckCircle2, path: '/approvals', badge: 4 },
  { label: 'Payments', icon: CreditCard, path: '/payments', badge: 6 },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
];

export const workshopCapacity = {
  label: 'Workshop capacity',
  assigned: 18,
  total: 23,
  get percent() {
    return Math.round((this.assigned / this.total) * 100);
  },
};

// ---------------------------------------------------------------- top bar

export const currentUser = {
  initials: 'RP',
  name: 'Ravindu Perera',
  role: 'Studio Admin',
};

export const pageMeta = {
  title: 'Dashboard',
  subtitle: 'Saturday, 18 July 2026 · Colombo workshop',
};

// ---------------------------------------------------------------- KPI cards

export type PillTone = 'green' | 'red' | 'neutral';

export interface Kpi {
  icon: LucideIcon;
  iconTone: PillTone;
  pillText: string;
  pillTone: PillTone;
  value: string;
  label: string;
}

export const kpis: Kpi[] = [
  {
    icon: FolderClosed,
    iconTone: 'neutral',
    pillText: '+3 this wk',
    pillTone: 'green',
    value: '24',
    label: 'Active Projects',
  },
  {
    icon: FileText,
    iconTone: 'neutral',
    pillText: '12 due today',
    pillTone: 'neutral',
    value: '58',
    label: 'Job Cards In Progress',
  },
  {
    icon: CheckCircle2,
    iconTone: 'red',
    pillText: 'Action needed',
    pillTone: 'red',
    value: '4',
    label: 'Awaiting My Approval',
  },
  {
    icon: CreditCard,
    iconTone: 'neutral',
    pillText: '6 invoices',
    pillTone: 'red',
    value: 'LKR 2.86M',
    label: 'Unpaid Payments',
  },
];

// ------------------------------------------------------ pending approvals

export interface Approval {
  initials: string;
  avatarColor: string;
  name: string;
  role: string;
  jobRef: string;
  oldPrice: string;
  newPrice: string;
  delta: string;
}

export const approvals: Approval[] = [
  {
    initials: 'NF',
    avatarColor: '#4E7A54',
    name: 'Nuwan Fernando',
    role: 'Carpenter',
    jobRef: 'JC-1042 Frame joinery — Oak Dining Set',
    oldPrice: 'LKR 48,000',
    newPrice: 'LKR 56,500',
    delta: '+17.7%',
  },
  {
    initials: 'SD',
    avatarColor: '#8F8A5B',
    name: 'Sanjay Dias',
    role: 'Painter',
    jobRef: 'JC-1038 Lacquer finish — Walnut Wardrobe',
    oldPrice: 'LKR 32,000',
    newPrice: 'LKR 38,400',
    delta: '+20.0%',
  },
  {
    initials: 'KR',
    avatarColor: '#B23A2E',
    name: 'Kasun Rajapaksa',
    role: 'Carpenter',
    jobRef: 'JC-1051 Drawer runners — Teak Office Desk',
    oldPrice: 'LKR 21,500',
    newPrice: 'LKR 24,000',
    delta: '+11.6%',
  },
  {
    initials: 'MP',
    avatarColor: '#3E6B57',
    name: 'Malith Perera',
    role: 'Painter',
    jobRef: 'JC-1029 Primer + stain — Mahogany Bookshelf',
    oldPrice: 'LKR 18,000',
    newPrice: 'LKR 22,750',
    delta: '+26.4%',
  },
];

// ---------------------------------------------------------- work by stage

export interface StageBreakdown {
  stage: string;
  totalCards: number;
  tone: 'green' | 'brick';
  done: number;
  inProgress: number;
  toDo: number;
}

export const workByStage: StageBreakdown[] = [
  { stage: 'Carpentry', totalCards: 34, tone: 'green', done: 18, inProgress: 11, toDo: 5 },
  { stage: 'Painting', totalCards: 24, tone: 'brick', done: 9, inProgress: 9, toDo: 6 },
];

export const throughput = [
  { value: '64%', label: 'Carpentry throughput' },
  { value: '41%', label: 'Painting throughput' },
];

// ------------------------------------------------------- project overview

export interface ProjectRow {
  name: string;
  location: string;
  due: string;
  dueUrgent: boolean;
  value: string;
  completion: number;
}

export const projects: ProjectRow[] = [
  {
    name: 'Oak Dining Set',
    location: 'Villa Serein — Ella',
    due: '22 Jul',
    dueUrgent: true,
    value: 'LKR 640K',
    completion: 82,
  },
  {
    name: 'Walnut Wardrobe',
    location: 'The Cinnamon Residences — Colombo 07',
    due: '29 Jul',
    dueUrgent: false,
    value: 'LKR 415K',
    completion: 60,
  },
  {
    name: 'Teak Office Desk',
    location: 'Ceylon Chambers — Fort',
    due: '24 Jul',
    dueUrgent: true,
    value: 'LKR 288K',
    completion: 45,
  },
  {
    name: 'Mahogany Bookshelf',
    location: 'Private client — Kandy',
    due: '5 Aug',
    dueUrgent: false,
    value: 'LKR 196K',
    completion: 28,
  },
];

// -------------------------------------------------------- worker activity

export interface WorkerStat {
  count: number;
  label: string;
  tone: PillTone;
}

export const workerActivity: WorkerStat[] = [
  { count: 14, label: 'Busy', tone: 'green' },
  { count: 5, label: 'Free', tone: 'neutral' },
  { count: 3, label: 'Overdue', tone: 'red' },
];
