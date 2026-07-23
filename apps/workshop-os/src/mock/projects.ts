/**
 * Projects and their job cards, as typed data. A small in-memory store
 * (src/store/projects.tsx) wraps this so add/edit/delete work within a session;
 * swapping in a real API means replacing the store's internals, not the shapes.
 *
 * Amounts are plain rupee integers here. This is a presentation prototype with
 * no arithmetic beyond summing, and formatting happens at the edge via the
 * helpers below. A production build would carry minor units.
 */

export type Stage = 'CARPENTRY' | 'PAINTING';

export type JobStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_FOR_INSPECTION'
  | 'APPROVED'
  | 'COMPLETED';

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export interface Assignee {
  name: string;
  initials: string;
  color: string;
}

export interface JobCard {
  id: string;
  ref: string;
  title: string;
  stage: Stage;
  description: string;
  amount: number;
  fileName?: string;
  status: JobStatus;
  assignee?: Assignee;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  deadline: string; // ISO yyyy-mm-dd
  value: number;
  status: ProjectStatus;
  completion: number;
  description: string;
  /** Recorded payments block deletion — such a project is archived instead. */
  hasPayments: boolean;
  jobCards: JobCard[];
}

// ---------------------------------------------------------------- helpers

/** The prototype's fixed "today", so due-date urgency is deterministic. */
export const TODAY = new Date('2026-07-20T00:00:00');

/** Full amount: 96000 -> "LKR 96,000". */
export const lkr = (n: number) => `LKR ${n.toLocaleString('en-US')}`;

/** Compact amount for dense columns: 640000 -> "LKR 640K", 2_860_000 -> "LKR 2.86M". */
export const lkrCompact = (n: number) => {
  if (n >= 1_000_000) return `LKR ${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `LKR ${Math.round(n / 1000)}K`;
  return `LKR ${n}`;
};

/** ISO date -> "22 Aug". */
export const dueDisplay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Brick-red when a deadline is within seven days or already past. */
export const isDueUrgent = (iso: string) => {
  const due = new Date(`${iso}T00:00:00`).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return due - TODAY.getTime() <= sevenDays;
};

/** yyyy-mm-dd for a date input's value. */
export const toDateInput = (iso: string) => iso;

/** The next JC reference for a set of cards: JC-01, JC-02, … */
export const nextJcRef = (cards: JobCard[]) =>
  `JC-${String(cards.length + 1).padStart(2, '0')}`;

// ------------------------------------------------------------- assignees

const ASSIGNEES = {
  nimal: { name: 'Nimal K. Perera', initials: 'NK', color: '#4E7A54' },
  kasun: { name: 'Kasun Bandara', initials: 'KB', color: '#B23A2E' },
  sunil: { name: 'Sunil Silva', initials: 'SS', color: '#8F8A5B' },
  dilani: { name: 'Dilani Fernando', initials: 'DF', color: '#3E6B57' },
  malith: { name: 'Malith Perera', initials: 'MP', color: '#6B7280' },
} satisfies Record<string, Assignee>;

// ------------------------------------------------------------- projects

export const seedProjects: Project[] = [
  {
    id: 'oak-dining-set',
    name: 'Oak Dining Set — 6 Seater',
    client: 'Villa Serein',
    location: 'Villa Serein — Ella',
    deadline: '2026-08-22',
    value: 640_000,
    status: 'ACTIVE',
    completion: 82,
    description:
      'Solid oak dining table with matching six chairs. Hand-finished natural oil, ' +
      'mortise-and-tenon joinery. Client requested a warm satin finish and rounded ' +
      'edges throughout.',
    hasPayments: true,
    jobCards: [
      {
        id: 'oak-jc-01',
        ref: 'JC-01',
        title: 'Tabletop glue-up & sanding',
        stage: 'CARPENTRY',
        description:
          'Edge-joint eight oak boards for the 2.1m top, plane flat, then sand to ' +
          '240 grit ready for oiling.',
        amount: 96_000,
        fileName: 'tabletop-plan.pdf',
        status: 'COMPLETED',
        assignee: ASSIGNEES.nimal,
      },
      {
        id: 'oak-jc-02',
        ref: 'JC-02',
        title: 'Chair frames & joinery (×6)',
        stage: 'CARPENTRY',
        description:
          'Mortise-and-tenon frames for six chairs including curved back rails and ' +
          'seat rebates.',
        amount: 132_000,
        status: 'APPROVED',
        assignee: ASSIGNEES.kasun,
      },
      {
        id: 'oak-jc-03',
        ref: 'JC-03',
        title: 'Oil & satin finish',
        stage: 'PAINTING',
        description: 'Hand-rub natural oil then two coats of satin lacquer on table and chairs.',
        amount: 74_000,
        status: 'IN_PROGRESS',
        assignee: ASSIGNEES.sunil,
      },
      {
        id: 'oak-jc-04',
        ref: 'JC-04',
        title: 'Seat cushions & upholstery',
        stage: 'PAINTING',
        description: 'Cut foam and upholster six drop-in seat pads in the client’s linen.',
        amount: 42_000,
        status: 'READY_FOR_INSPECTION',
        assignee: ASSIGNEES.dilani,
      },
      {
        id: 'oak-jc-05',
        ref: 'JC-05',
        title: 'Extension leaf mechanism',
        stage: 'CARPENTRY',
        description: 'Fit a central draw-leaf runner so the top extends to seat eight.',
        amount: 58_000,
        status: 'ASSIGNED',
        assignee: ASSIGNEES.nimal,
      },
      {
        id: 'oak-jc-06',
        ref: 'JC-06',
        title: 'Edge rounding & detailing',
        stage: 'CARPENTRY',
        description: 'Round over all exposed edges and hand-detail the leg chamfers.',
        amount: 36_000,
        status: 'IN_PROGRESS',
        assignee: ASSIGNEES.kasun,
      },
      {
        id: 'oak-jc-07',
        ref: 'JC-07',
        title: 'Protective base coat',
        stage: 'PAINTING',
        description: 'Seal the underside and feet against moisture before delivery.',
        amount: 24_000,
        status: 'ASSIGNED',
        assignee: ASSIGNEES.sunil,
      },
      {
        id: 'oak-jc-08',
        ref: 'JC-08',
        title: 'Final assembly & QA',
        stage: 'CARPENTRY',
        description: 'Assemble, check every joint, level the chairs, and photograph for the client.',
        amount: 28_000,
        status: 'ASSIGNED',
      },
    ],
  },
  {
    id: 'walnut-wardrobe',
    name: 'Walnut Wardrobe',
    client: 'The Cinnamon Residences',
    location: 'The Cinnamon Residences — Colombo 07',
    deadline: '2026-07-26',
    value: 415_000,
    status: 'ACTIVE',
    completion: 60,
    description:
      'Three-door walnut wardrobe with soft-close hinges, internal drawers, and a ' +
      'hanging rail. Lacquer finish to match the client’s existing dresser.',
    hasPayments: false,
    jobCards: [
      {
        id: 'wal-jc-01',
        ref: 'JC-01',
        title: 'Carcass & doors',
        stage: 'CARPENTRY',
        description: 'Build the carcass, hang three doors on soft-close hinges.',
        amount: 168_000,
        status: 'IN_PROGRESS',
        assignee: ASSIGNEES.kasun,
      },
      {
        id: 'wal-jc-02',
        ref: 'JC-02',
        title: 'Lacquer finish',
        stage: 'PAINTING',
        description: 'Spray three coats of satin lacquer, denib between coats.',
        amount: 92_000,
        status: 'ASSIGNED',
        assignee: ASSIGNEES.dilani,
      },
    ],
  },
  {
    id: 'teak-office-desk',
    name: 'Teak Office Desk',
    client: 'Ceylon Chambers',
    location: 'Ceylon Chambers — Fort',
    deadline: '2026-07-24',
    value: 288_000,
    status: 'ACTIVE',
    completion: 45,
    description:
      'Executive teak desk with three drawers on the right pedestal and a cable ' +
      'management channel. Oiled finish.',
    hasPayments: true,
    jobCards: [
      {
        id: 'teak-jc-01',
        ref: 'JC-01',
        title: 'Desktop & pedestal',
        stage: 'CARPENTRY',
        description: 'Glue up the top, build the three-drawer pedestal.',
        amount: 142_000,
        status: 'APPROVED',
        assignee: ASSIGNEES.nimal,
      },
      {
        id: 'teak-jc-02',
        ref: 'JC-02',
        title: 'Drawer runners',
        stage: 'CARPENTRY',
        description: 'Fit and align three sets of full-extension runners.',
        amount: 48_000,
        status: 'IN_PROGRESS',
        assignee: ASSIGNEES.kasun,
      },
    ],
  },
  {
    id: 'mahogany-bookshelf',
    name: 'Mahogany Bookshelf',
    client: 'Private client',
    location: 'Private client — Kandy',
    deadline: '2026-08-05',
    value: 196_000,
    status: 'ACTIVE',
    completion: 28,
    description:
      'Freestanding mahogany bookshelf, five adjustable shelves, open back. ' +
      'Primer plus stain to a deep red-brown.',
    hasPayments: false,
    jobCards: [
      {
        id: 'mah-jc-01',
        ref: 'JC-01',
        title: 'Frame & shelves',
        stage: 'CARPENTRY',
        description: 'Build the frame and five adjustable shelves.',
        amount: 118_000,
        status: 'IN_PROGRESS',
        assignee: ASSIGNEES.malith,
      },
      {
        id: 'mah-jc-02',
        ref: 'JC-02',
        title: 'Primer + stain',
        stage: 'PAINTING',
        description: 'Prime, then two coats of deep red-brown stain.',
        amount: 46_000,
        status: 'ASSIGNED',
      },
    ],
  },
  {
    id: 'rosewood-console',
    name: 'Rosewood Console',
    client: 'Galle Face Residences',
    location: 'Galle Face Residences — Colombo 03',
    deadline: '2026-07-19',
    value: 320_000,
    status: 'ACTIVE',
    completion: 95,
    description:
      'Slim rosewood hallway console with a single drawer and turned legs. ' +
      'French-polished to a high sheen.',
    hasPayments: true,
    jobCards: [
      {
        id: 'rose-jc-01',
        ref: 'JC-01',
        title: 'Console body & legs',
        stage: 'CARPENTRY',
        description: 'Build the body, turn four legs, fit the drawer.',
        amount: 176_000,
        status: 'COMPLETED',
        assignee: ASSIGNEES.nimal,
      },
      {
        id: 'rose-jc-02',
        ref: 'JC-02',
        title: 'French polish',
        stage: 'PAINTING',
        description: 'Multiple sessions of French polish to a high sheen.',
        amount: 88_000,
        status: 'READY_FOR_INSPECTION',
        assignee: ASSIGNEES.sunil,
      },
    ],
  },
  {
    id: 'cedar-wardrobe-set',
    name: 'Cedar Wardrobe Set',
    client: 'Heritance Villas',
    location: 'Heritance Villas — Bentota',
    deadline: '2026-06-30',
    value: 540_000,
    status: 'ARCHIVED',
    completion: 100,
    description:
      'Pair of matching cedar wardrobes for two guest suites. Delivered and signed off.',
    hasPayments: true,
    jobCards: [
      {
        id: 'ced-jc-01',
        ref: 'JC-01',
        title: 'Wardrobe A build',
        stage: 'CARPENTRY',
        description: 'Full carcass and doors for the first suite.',
        amount: 210_000,
        status: 'COMPLETED',
        assignee: ASSIGNEES.kasun,
      },
      {
        id: 'ced-jc-02',
        ref: 'JC-02',
        title: 'Wardrobe B build',
        stage: 'CARPENTRY',
        description: 'Full carcass and doors for the second suite.',
        amount: 210_000,
        status: 'COMPLETED',
        assignee: ASSIGNEES.nimal,
      },
      {
        id: 'ced-jc-03',
        ref: 'JC-03',
        title: 'Finish both units',
        stage: 'PAINTING',
        description: 'Clear matt lacquer on both wardrobes.',
        amount: 120_000,
        status: 'COMPLETED',
        assignee: ASSIGNEES.dilani,
      },
    ],
  },
];

/** The three-card draft the Create Project view opens prefilled with. */
export const draftJobCards: JobCard[] = [
  {
    id: 'draft-1',
    ref: 'JC-01',
    title: 'Tabletop glue-up & sanding',
    stage: 'CARPENTRY',
    description:
      'Edge-joint eight oak boards for the 2.1m top, plane flat, then sand to 240 ' +
      'grit ready for oiling.',
    amount: 96_000,
    fileName: 'tabletop-plan.pdf',
    status: 'ASSIGNED',
  },
  {
    id: 'draft-2',
    ref: 'JC-02',
    title: 'Chair frames & joinery (×6)',
    stage: 'CARPENTRY',
    description:
      'Mortise-and-tenon frames for six chairs including curved back rails and seat rebates.',
    amount: 132_000,
    status: 'ASSIGNED',
  },
  {
    id: 'draft-3',
    ref: 'JC-03',
    title: 'Oil & satin finish',
    stage: 'PAINTING',
    description: 'Hand-rub natural oil then two coats of satin lacquer on table and chairs.',
    amount: 74_000,
    status: 'ASSIGNED',
  },
];
