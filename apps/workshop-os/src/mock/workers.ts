/**
 * The workshop roster. A session store (src/store/workers.tsx) wraps this so
 * create / update / delete work in-session; swap the store internals for a real
 * API later without touching these shapes.
 */

export type WorkerRole = 'Carpenter' | 'Painter' | 'Supervisor';
export type WorkerStatus = 'ACTIVE' | 'INACTIVE';
/** Where a worker stands right now — mirrors the dashboard's Worker Activity. */
export type Availability = 'FREE' | 'BUSY' | 'OVERDUE';

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  status: WorkerStatus;
  phone: string;
  email: string;
  joined: string; // display, e.g. "Mar 2024"
  activeJobs: number;
  completedJobs: number;
  availability: Availability;
}

export const ROLES: WorkerRole[] = ['Carpenter', 'Painter', 'Supervisor'];

// ---------------------------------------------------------------- helpers

/** Initials from the first two words of a name — the avatar label. */
export const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const AVATAR_COLORS = ['#4E7A54', '#B23A2E', '#8F8A5B', '#3E6B57', '#6B7280', '#8A6D1A'];

/** A stable avatar colour derived from the name, so it never flickers on edit. */
export const colorFor = (seed: string) =>
  AVATAR_COLORS[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

// ----------------------------------------------------------------- roster

export const seedWorkers: Worker[] = [
  {
    id: 'w-nuwan',
    name: 'Nuwan Fernando',
    role: 'Carpenter',
    status: 'ACTIVE',
    phone: '077 214 8890',
    email: 'nuwan.f@designarc.lk',
    joined: 'Mar 2023',
    activeJobs: 3,
    completedJobs: 24,
    availability: 'BUSY',
  },
  {
    id: 'w-sanjay',
    name: 'Sanjay Dias',
    role: 'Painter',
    status: 'ACTIVE',
    phone: '071 668 3204',
    email: 'sanjay.d@designarc.lk',
    joined: 'Jul 2023',
    activeJobs: 0,
    completedJobs: 18,
    availability: 'FREE',
  },
  {
    id: 'w-kasun',
    name: 'Kasun Rajapaksa',
    role: 'Carpenter',
    status: 'ACTIVE',
    phone: '076 903 1147',
    email: 'kasun.r@designarc.lk',
    joined: 'Jan 2022',
    activeJobs: 2,
    completedJobs: 31,
    availability: 'OVERDUE',
  },
  {
    id: 'w-malith',
    name: 'Malith Perera',
    role: 'Painter',
    status: 'ACTIVE',
    phone: '070 552 7781',
    email: 'malith.p@designarc.lk',
    joined: 'Sep 2023',
    activeJobs: 1,
    completedJobs: 12,
    availability: 'BUSY',
  },
  {
    id: 'w-nimal',
    name: 'Nimal K. Perera',
    role: 'Carpenter',
    status: 'ACTIVE',
    phone: '077 340 9915',
    email: 'nimal.p@designarc.lk',
    joined: 'Feb 2021',
    activeJobs: 4,
    completedJobs: 27,
    availability: 'BUSY',
  },
  {
    id: 'w-dilani',
    name: 'Dilani Fernando',
    role: 'Painter',
    status: 'ACTIVE',
    phone: '071 227 6634',
    email: 'dilani.f@designarc.lk',
    joined: 'May 2024',
    activeJobs: 0,
    completedJobs: 9,
    availability: 'FREE',
  },
  {
    id: 'w-rohan',
    name: 'Rohan Jayasuriya',
    role: 'Supervisor',
    status: 'ACTIVE',
    phone: '077 811 0052',
    email: 'rohan.j@designarc.lk',
    joined: 'Aug 2020',
    activeJobs: 6,
    completedJobs: 40,
    availability: 'BUSY',
  },
  {
    id: 'w-sunil',
    name: 'Sunil Silva',
    role: 'Painter',
    status: 'INACTIVE',
    phone: '076 145 2290',
    email: 'sunil.s@designarc.lk',
    joined: 'Nov 2022',
    activeJobs: 0,
    completedJobs: 15,
    availability: 'FREE',
  },
  {
    id: 'w-ayesha',
    name: 'Ayesha Perera',
    role: 'Supervisor',
    status: 'ACTIVE',
    phone: '077 009 4418',
    email: 'ayesha.p@designarc.lk',
    joined: 'Jun 2021',
    activeJobs: 1,
    completedJobs: 22,
    availability: 'FREE',
  },
];
