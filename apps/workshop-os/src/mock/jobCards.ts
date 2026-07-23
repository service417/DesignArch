/**
 * Job cards, their stages, and the projects they belong to — typed data for the
 * Job Cards tab. A session store (src/store/jobCards.tsx) wraps this so the star
 * toggle, filters and the project switch all work without a backend.
 *
 * A job card can carry a carpentry stage, a painting stage, or both. Each stage
 * has its own status, assignee and amount, which is why the list and the detail
 * both render per-stage rather than per-card.
 */

export type Stage = 'CARPENTRY' | 'PAINTING';

export type JobStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_FOR_INSPECTION'
  | 'PRICE_PENDING'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REJECTED';

/** How an amount should read: agreed is settled (green), pending is amended and
 *  awaiting sign-off (brick), none is not yet priced. */
export type AmountKind = 'AGREED' | 'PENDING' | 'NONE';

export interface Assignee {
  name: string;
  initials: string;
  color: string;
  role: 'Carpenter' | 'Painter';
  assignedDate: string; // display, e.g. "10 Jul"
}

export interface StageInfo {
  stage: Stage;
  status: JobStatus;
  assignee?: Assignee;
  amount?: number;
  amountKind: AmountKind;
}

export interface DesignFile {
  name: string;
  kind: 'pdf' | 'image';
}

export interface Inspection {
  stage: Stage;
  note: string;
  photos: number;
}

export interface JobCard {
  id: string;
  ref: string;
  title: string;
  projectId: string;
  starred: boolean;
  stages: StageInfo[];
  designFiles: DesignFile[];
  inspection: Inspection | null;
}

export interface JcProject {
  id: string;
  name: string;
  client: string;
  location: string;
}

// ---------------------------------------------------------------- projects

export const jcProjects: JcProject[] = [
  { id: 'oak', name: 'Oak Dining Set', client: 'Villa Serein', location: 'Villa Serein · Ella' },
  {
    id: 'walnut',
    name: 'Walnut Wardrobe',
    client: 'The Cinnamon Residences',
    location: 'The Cinnamon Residences · Colombo 07',
  },
  { id: 'teak', name: 'Teak Office Desk', client: 'Ceylon Chambers', location: 'Ceylon Chambers · Fort' },
  { id: 'mahogany', name: 'Mahogany Bookshelf', client: 'Private client', location: 'Private client · Kandy' },
];

export const defaultProjectId = 'oak';

// --------------------------------------------------------------- assignees

const P = {
  nuwan: { name: 'Nuwan Fernando', initials: 'NF', color: '#4E7A54', role: 'Carpenter', assignedDate: '10 Jul' },
  sanjay: { name: 'Sanjay Dias', initials: 'SD', color: '#8F8A5B', role: 'Painter', assignedDate: '12 Jul' },
  kasun: { name: 'Kasun Rajapaksa', initials: 'KR', color: '#B23A2E', role: 'Carpenter', assignedDate: '9 Jul' },
  malith: { name: 'Malith Perera', initials: 'MP', color: '#3E6B57', role: 'Painter', assignedDate: '11 Jul' },
  nimal: { name: 'Nimal K. Perera', initials: 'NK', color: '#4E7A54', role: 'Carpenter', assignedDate: '8 Jul' },
  dilani: { name: 'Dilani Fernando', initials: 'DF', color: '#6B7280', role: 'Painter', assignedDate: '13 Jul' },
} satisfies Record<string, Assignee>;

const files = (primary: string, more: number): DesignFile[] => [
  { name: primary, kind: 'pdf' },
  { name: 'detail-render.png', kind: 'image' },
  { name: 'joint-detail.png', kind: 'image' },
  ...Array.from({ length: more }, (_, i) => ({ name: `sheet-${i + 1}.pdf`, kind: 'pdf' as const })),
];

// -------------------------------------------------------------- job cards

export const seedJobCards: JobCard[] = [
  {
    id: 'jc-1042',
    ref: 'JC-1042',
    title: 'Frame joinery & oil finish',
    projectId: 'oak',
    starred: true,
    stages: [
      { stage: 'CARPENTRY', status: 'READY_FOR_INSPECTION', assignee: P.nuwan, amount: 56_500, amountKind: 'PENDING' },
      { stage: 'PAINTING', status: 'ASSIGNED', assignee: P.sanjay, amount: 32_000, amountKind: 'AGREED' },
    ],
    designFiles: files('frame-elevation.pdf', 4),
    inspection: { stage: 'CARPENTRY', note: 'Carpentry — dry-fit review', photos: 3 },
  },
  {
    id: 'jc-1043',
    ref: 'JC-1043',
    title: 'Tabletop glue-up & sanding',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'IN_PROGRESS', assignee: P.kasun, amount: 96_000, amountKind: 'AGREED' }],
    designFiles: files('tabletop-plan.pdf', 2),
    inspection: null,
  },
  {
    id: 'jc-1044',
    ref: 'JC-1044',
    title: 'Chair set joinery (×6)',
    projectId: 'oak',
    starred: true,
    stages: [{ stage: 'CARPENTRY', status: 'PRICE_PENDING', assignee: P.nimal, amount: 132_000, amountKind: 'PENDING' }],
    designFiles: files('chair-frames.pdf', 3),
    inspection: { stage: 'CARPENTRY', note: 'Carpentry — first article', photos: 2 },
  },
  {
    id: 'jc-1045',
    ref: 'JC-1045',
    title: 'Sideboard carcass',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'UNASSIGNED', amountKind: 'NONE' }],
    designFiles: files('sideboard.pdf', 1),
    inspection: null,
  },
  {
    id: 'jc-1046',
    ref: 'JC-1046',
    title: 'Satin lacquer — table & chairs',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'PAINTING', status: 'APPROVED', assignee: P.malith, amount: 74_000, amountKind: 'AGREED' }],
    designFiles: files('finish-spec.pdf', 0),
    inspection: { stage: 'PAINTING', note: 'Painting — colour match', photos: 4 },
  },
  {
    id: 'jc-1047',
    ref: 'JC-1047',
    title: 'Seat cushions & upholstery',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'PAINTING', status: 'READY_FOR_INSPECTION', assignee: P.dilani, amount: 42_000, amountKind: 'AGREED' }],
    designFiles: files('upholstery.pdf', 1),
    inspection: null,
  },
  {
    id: 'jc-1048',
    ref: 'JC-1048',
    title: 'Extension leaf mechanism',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'ASSIGNED', assignee: P.kasun, amount: 58_000, amountKind: 'AGREED' }],
    designFiles: files('leaf-mechanism.pdf', 2),
    inspection: null,
  },
  {
    id: 'jc-1049',
    ref: 'JC-1049',
    title: 'Edge rounding & detailing',
    projectId: 'oak',
    starred: true,
    stages: [{ stage: 'CARPENTRY', status: 'COMPLETED', assignee: P.nuwan, amount: 36_000, amountKind: 'AGREED' }],
    designFiles: files('edge-detail.pdf', 0),
    inspection: { stage: 'CARPENTRY', note: 'Carpentry — final review', photos: 5 },
  },
  {
    id: 'jc-1050',
    ref: 'JC-1050',
    title: 'Protective base sealing',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'PAINTING', status: 'UNASSIGNED', amountKind: 'NONE' }],
    designFiles: files('base-seal.pdf', 0),
    inspection: null,
  },
  {
    id: 'jc-1051',
    ref: 'JC-1051',
    title: 'Drawer runners & fitting',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'IN_PROGRESS', assignee: P.nimal, amount: 24_000, amountKind: 'AGREED' }],
    designFiles: files('drawer-runners.pdf', 1),
    inspection: null,
  },
  {
    id: 'jc-1052',
    ref: 'JC-1052',
    title: 'Final assembly & QA',
    projectId: 'oak',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'UNASSIGNED', amountKind: 'NONE' }],
    designFiles: files('assembly-guide.pdf', 2),
    inspection: null,
  },
  {
    id: 'jc-1053',
    ref: 'JC-1053',
    title: 'Delivery finish touch-up',
    projectId: 'oak',
    starred: true,
    stages: [{ stage: 'PAINTING', status: 'PRICE_PENDING', assignee: P.sanjay, amount: 18_000, amountKind: 'PENDING' }],
    designFiles: files('touch-up.pdf', 0),
    inspection: null,
  },

  // A few cards on other projects, so switching the selector re-scopes the list.
  {
    id: 'jc-2001',
    ref: 'JC-2001',
    title: 'Wardrobe carcass & doors',
    projectId: 'walnut',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'IN_PROGRESS', assignee: P.kasun, amount: 168_000, amountKind: 'AGREED' }],
    designFiles: files('wardrobe.pdf', 1),
    inspection: null,
  },
  {
    id: 'jc-2002',
    ref: 'JC-2002',
    title: 'Lacquer finish',
    projectId: 'walnut',
    starred: false,
    stages: [{ stage: 'PAINTING', status: 'ASSIGNED', assignee: P.dilani, amount: 92_000, amountKind: 'AGREED' }],
    designFiles: files('lacquer.pdf', 0),
    inspection: null,
  },
  {
    id: 'jc-3001',
    ref: 'JC-3001',
    title: 'Desktop & pedestal',
    projectId: 'teak',
    starred: true,
    stages: [{ stage: 'CARPENTRY', status: 'PRICE_PENDING', assignee: P.nimal, amount: 142_000, amountKind: 'PENDING' }],
    designFiles: files('desk-plan.pdf', 2),
    inspection: { stage: 'CARPENTRY', note: 'Carpentry — pedestal fit', photos: 2 },
  },
  {
    id: 'jc-4001',
    ref: 'JC-4001',
    title: 'Frame & shelves',
    projectId: 'mahogany',
    starred: false,
    stages: [{ stage: 'CARPENTRY', status: 'UNASSIGNED', amountKind: 'NONE' }],
    designFiles: files('bookshelf.pdf', 0),
    inspection: null,
  },
];
