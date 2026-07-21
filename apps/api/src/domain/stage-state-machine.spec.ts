/**
 * Money-path test suite.
 *
 * The blueprint requires a tagged suite covering the state machine and pricing
 * rules that must pass before any release ships. These tests assert the
 * business rules by ID so a failure points straight at the rule it broke.
 */

import {
  availableActions,
  awaitsAdminAction,
  evaluateSequenceGate,
  evaluateTransition,
} from './stage-state-machine';
import { Actor, StageSnapshot, StageStatus } from './stage.types';

const WORKER_ID = 'worker-1';
const OTHER_WORKER_ID = 'worker-2';

const carpenter: Actor = { id: WORKER_ID, role: 'CARPENTER' };
const otherCarpenter: Actor = { id: OTHER_WORKER_ID, role: 'CARPENTER' };
const painter: Actor = { id: WORKER_ID, role: 'PAINTER' };
const supervisor: Actor = { id: 'sup-1', role: 'SUPERVISOR' };
const admin: Actor = { id: 'admin-1', role: 'ADMIN' };

function stage(overrides: Partial<StageSnapshot> = {}): StageSnapshot {
  return {
    id: 'stage-1',
    type: 'CARPENTRY',
    status: 'ASSIGNED',
    assigneeId: WORKER_ID,
    version: 0,
    photoCount: 0,
    ...overrides,
  };
}

describe('stage state machine — happy path', () => {
  it('walks a carpentry stage from assignment to completion', () => {
    // ASSIGNED -> IN_PROGRESS
    let current: StageStatus = 'ASSIGNED';
    let result = evaluateTransition({
      stage: stage({ status: current }),
      actor: carpenter,
      action: 'START_WORK',
    });
    expect(result).toEqual({ ok: true, nextStatus: 'IN_PROGRESS' });

    // IN_PROGRESS -> READY_FOR_INSPECTION
    current = 'IN_PROGRESS';
    result = evaluateTransition({
      stage: stage({ status: current }),
      actor: carpenter,
      action: 'MARK_READY',
    });
    expect(result).toEqual({ ok: true, nextStatus: 'READY_FOR_INSPECTION' });

    // READY_FOR_INSPECTION -> APPROVED (supervisor, with evidence)
    current = 'READY_FOR_INSPECTION';
    result = evaluateTransition({
      stage: stage({ status: current, photoCount: 1 }),
      actor: supervisor,
      action: 'APPROVE',
    });
    expect(result).toEqual({ ok: true, nextStatus: 'APPROVED' });

    // APPROVED -> PRICE_PROPOSED (admin)
    current = 'APPROVED';
    result = evaluateTransition({
      stage: stage({ status: current }),
      actor: admin,
      action: 'PROPOSE_PRICE',
      payload: { amount: 750_000n },
    });
    expect(result).toEqual({ ok: true, nextStatus: 'PRICE_PROPOSED' });

    // PRICE_PROPOSED -> PRICE_ACCEPTED (assigned worker only)
    current = 'PRICE_PROPOSED';
    result = evaluateTransition({
      stage: stage({ status: current }),
      actor: carpenter,
      action: 'ACCEPT_PRICE',
    });
    expect(result).toEqual({ ok: true, nextStatus: 'PRICE_ACCEPTED' });

    // PRICE_ACCEPTED -> COMPLETED
    current = 'PRICE_ACCEPTED';
    result = evaluateTransition({
      stage: stage({ status: current }),
      actor: admin,
      action: 'COMPLETE',
    });
    expect(result).toEqual({ ok: true, nextStatus: 'COMPLETED' });
  });

  it('supports the decline -> revise -> accept negotiation loop', () => {
    const declined = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED' }),
      actor: carpenter,
      action: 'DECLINE_PRICE',
      payload: { reason: 'Too low for the detail involved' },
    });
    expect(declined).toEqual({ ok: true, nextStatus: 'PRICE_DECLINED' });

    const revised = evaluateTransition({
      stage: stage({ status: 'PRICE_DECLINED' }),
      actor: admin,
      action: 'REVISE_PRICE',
      payload: { amount: 900_000n },
    });
    expect(revised).toEqual({ ok: true, nextStatus: 'PRICE_PROPOSED' });
  });

  it('returns a rejected stage to the same worker for rework (BR-5.2)', () => {
    const rejected = evaluateTransition({
      stage: stage({ status: 'READY_FOR_INSPECTION' }),
      actor: supervisor,
      action: 'REJECT',
      payload: { reason: 'Joint alignment is off by 3mm' },
    });
    expect(rejected).toEqual({ ok: true, nextStatus: 'REJECTED' });

    const resumed = evaluateTransition({
      stage: stage({ status: 'REJECTED' }),
      actor: carpenter,
      action: 'RESUME_REWORK',
    });
    expect(resumed).toEqual({ ok: true, nextStatus: 'IN_PROGRESS' });
  });
});

describe('BR-3 — no price before supervisor approval', () => {
  const unapproved: StageStatus[] = [
    'ASSIGNED',
    'IN_PROGRESS',
    'READY_FOR_INSPECTION',
    'REJECTED',
  ];

  it.each(unapproved)('refuses to price a stage in %s', (status) => {
    const result = evaluateTransition({
      stage: stage({ status }),
      actor: admin,
      action: 'PROPOSE_PRICE',
      payload: { amount: 500_000n },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('STAGE_NOT_APPROVED');
  });
});

describe('BR-5 — only the supervisor inspects', () => {
  it('refuses approval by the worker who did the work', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'READY_FOR_INSPECTION', photoCount: 1 }),
      actor: carpenter,
      action: 'APPROVE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses approval by the admin (separation of duties)', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'READY_FOR_INSPECTION', photoCount: 1 }),
      actor: admin,
      action: 'APPROVE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('requires at least one photograph to approve (FR-5.6)', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'READY_FOR_INSPECTION', photoCount: 0 }),
      actor: supervisor,
      action: 'APPROVE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PHOTO_REQUIRED');
  });

  it('requires a reason to reject (FR-5.5)', () => {
    for (const reason of [undefined, '', '   ']) {
      const result = evaluateTransition({
        stage: stage({ status: 'READY_FOR_INSPECTION' }),
        actor: supervisor,
        action: 'REJECT',
        payload: { reason },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('REASON_REQUIRED');
    }
  });
});

describe('BR-6 — only the assigned worker accepts or declines', () => {
  it('refuses acceptance by a different worker', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED' }),
      actor: otherCarpenter,
      action: 'ACCEPT_PRICE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_ASSIGNEE');
  });

  it('refuses acceptance by the admin who set the price', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED' }),
      actor: admin,
      action: 'ACCEPT_PRICE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses pricing by anyone other than the admin', () => {
    for (const actor of [carpenter, supervisor]) {
      const result = evaluateTransition({
        stage: stage({ status: 'APPROVED' }),
        actor,
        action: 'PROPOSE_PRICE',
        payload: { amount: 500_000n },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    }
  });

  it('refuses action on an unassigned stage', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED', assigneeId: null }),
      actor: carpenter,
      action: 'ACCEPT_PRICE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_ASSIGNEE');
  });
});

describe('BR-3.2 — the painting sequence gate', () => {
  const paintingStage = stage({ type: 'PAINTING', status: 'ASSIGNED' });

  it.each<StageStatus>([
    'ASSIGNED',
    'IN_PROGRESS',
    'READY_FOR_INSPECTION',
    'REJECTED',
  ])('blocks painting while carpentry is %s', (carpentryStatus) => {
    const result = evaluateTransition({
      stage: paintingStage,
      actor: painter,
      action: 'START_WORK',
      siblingCarpentryStatus: carpentryStatus,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SEQUENCE_GATE_LOCKED');
  });

  it.each<StageStatus>([
    'APPROVED',
    'PRICE_PROPOSED',
    'PRICE_DECLINED',
    'PRICE_ACCEPTED',
    'COMPLETED',
  ])('allows painting once carpentry is %s', (carpentryStatus) => {
    const result = evaluateTransition({
      stage: paintingStage,
      actor: painter,
      action: 'START_WORK',
      siblingCarpentryStatus: carpentryStatus,
    });
    expect(result).toEqual({ ok: true, nextStatus: 'IN_PROGRESS' });
  });

  it('blocks painting when the carpentry stage is missing', () => {
    const result = evaluateSequenceGate(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SEQUENCE_GATE_LOCKED');
  });
});

describe('optimistic locking', () => {
  it('rejects a write based on a stale version', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED', version: 5 }),
      actor: carpenter,
      action: 'ACCEPT_PRICE',
      payload: { expectedVersion: 4 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VERSION_CONFLICT');
  });

  it('accepts a write with a current version', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED', version: 5 }),
      actor: carpenter,
      action: 'ACCEPT_PRICE',
      payload: { expectedVersion: 5 },
    });
    expect(result.ok).toBe(true);
  });

  it('skips the check when no version is supplied', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED', version: 5 }),
      actor: carpenter,
      action: 'ACCEPT_PRICE',
    });
    expect(result.ok).toBe(true);
  });
});

describe('amount validation on pricing actions', () => {
  it.each([
    [0n, 'NOT_POSITIVE'],
    [-1n, 'NOT_POSITIVE'],
  ])('rejects a non-positive amount %s', (amount) => {
    const result = evaluateTransition({
      stage: stage({ status: 'APPROVED' }),
      actor: admin,
      action: 'PROPOSE_PRICE',
      payload: { amount },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT');
  });

  it('rejects a fractional amount rather than rounding it', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'APPROVED' }),
      actor: admin,
      action: 'PROPOSE_PRICE',
      payload: { amount: 1234.56 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT');
  });

  it('rejects an amount above the sanity ceiling', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'APPROVED' }),
      actor: admin,
      action: 'PROPOSE_PRICE',
      payload: { amount: 100_000_001n },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT');
  });

  it('requires an amount to be supplied at all', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'APPROVED' }),
      actor: admin,
      action: 'PROPOSE_PRICE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT');
  });
});

describe('terminal state', () => {
  it('permits no transition out of COMPLETED', () => {
    const actions = availableActions(stage({ status: 'COMPLETED' }), carpenter);
    expect(actions).toEqual([]);
  });

  it.each(['START_WORK', 'MARK_READY', 'ACCEPT_PRICE'] as const)(
    'rejects %s on a completed stage',
    (action) => {
      const result = evaluateTransition({
        stage: stage({ status: 'COMPLETED' }),
        actor: carpenter,
        action,
      });
      expect(result.ok).toBe(false);
    },
  );
});

describe('availableActions', () => {
  it('offers the worker only their own moves', () => {
    expect(availableActions(stage({ status: 'PRICE_PROPOSED' }), carpenter).sort()).toEqual(
      ['ACCEPT_PRICE', 'DECLINE_PRICE'].sort(),
    );
  });

  it('offers the supervisor inspection moves on a ready stage', () => {
    const actions = availableActions(
      stage({ status: 'READY_FOR_INSPECTION', photoCount: 2 }),
      supervisor,
    );
    expect(actions.sort()).toEqual(['APPROVE', 'REJECT'].sort());
  });

  it('withholds APPROVE from the supervisor until a photo exists', () => {
    const actions = availableActions(
      stage({ status: 'READY_FOR_INSPECTION', photoCount: 0 }),
      supervisor,
    );
    expect(actions).toEqual(['REJECT']);
  });

  it('offers the admin pricing on an approved stage', () => {
    expect(availableActions(stage({ status: 'APPROVED' }), admin)).toContain(
      'PROPOSE_PRICE',
    );
  });
});

describe('awaitsAdminAction', () => {
  it('flags the two states that sit in the admin action queue', () => {
    expect(awaitsAdminAction('APPROVED')).toBe(true);
    expect(awaitsAdminAction('PRICE_DECLINED')).toBe(true);
    expect(awaitsAdminAction('IN_PROGRESS')).toBe(false);
    expect(awaitsAdminAction('COMPLETED')).toBe(false);
  });
});
