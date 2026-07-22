/**
 * Rules added with parallel assignment and supervisor scope confirmation.
 *
 * Two things are being protected here. First, that a worker genuinely opts in
 * before work starts and can hand a job back without disturbing anyone else's.
 * Second — and this is the one that matters — that letting a supervisor vouch
 * for a scope change does not quietly hand them the ability to price work.
 */

import { evaluateTransition } from './stage-state-machine';
import { Actor, StageSnapshot } from './stage.types';

const WORKER_ID = 'worker-1';

const carpenter: Actor = { id: WORKER_ID, role: 'CARPENTER' };
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
    assignmentAccepted: true,
    ...overrides,
  };
}

describe('taking an assignment on', () => {
  it('lets the assigned worker accept a job they have not yet accepted', () => {
    const result = evaluateTransition({
      stage: stage({ assignmentAccepted: false }),
      actor: carpenter,
      action: 'ACCEPT_ASSIGNMENT',
    });
    expect(result.ok).toBe(true);
  });

  it('refuses to start work on a job the worker has not accepted', () => {
    const result = evaluateTransition({
      stage: stage({ assignmentAccepted: false }),
      actor: carpenter,
      action: 'START_WORK',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASSIGNMENT_NOT_ACCEPTED');
  });

  it('does not let the same job be accepted twice', () => {
    const result = evaluateTransition({
      stage: stage({ assignmentAccepted: true }),
      actor: carpenter,
      action: 'ACCEPT_ASSIGNMENT',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASSIGNMENT_ALREADY_SETTLED');
  });

  it('requires a reason for declining, so it can be reassigned sensibly', () => {
    const result = evaluateTransition({
      stage: stage({ assignmentAccepted: false }),
      actor: carpenter,
      action: 'DECLINE_ASSIGNMENT',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('REASON_REQUIRED');
  });

  it('accepts a decline that explains itself', () => {
    const result = evaluateTransition({
      stage: stage({ assignmentAccepted: false }),
      actor: carpenter,
      action: 'DECLINE_ASSIGNMENT',
      payload: { reason: 'Already committed to the Villa Serein set this week' },
    });
    expect(result.ok).toBe(true);
  });

  it('will not let one worker decline another worker’s assignment', () => {
    const result = evaluateTransition({
      stage: stage({ assigneeId: 'somebody-else', assignmentAccepted: false }),
      actor: carpenter,
      action: 'DECLINE_ASSIGNMENT',
      payload: { reason: 'Not my job at all' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_ASSIGNEE');
  });

  it('still lets a supervisor inspect finished work regardless of the accept flag', () => {
    // The work exists and was submitted; refusing inspection over a missing
    // acknowledgement would punish the supervisor for the worker's omission.
    const result = evaluateTransition({
      stage: stage({ status: 'READY_FOR_INSPECTION', photoCount: 1, assignmentAccepted: false }),
      actor: supervisor,
      action: 'APPROVE',
    });
    expect(result.ok).toBe(true);
  });
});

describe('supervisor scope confirmation (must not become pricing power)', () => {
  it('lets a supervisor confirm a scope change after a price is declined', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_DECLINED' }),
      actor: supervisor,
      action: 'CONFIRM_SCOPE_CHANGE',
      payload: { reason: 'Verified on site — curved rails do require steam-bending' },
    });
    expect(result.ok).toBe(true);
    // It does not move the stage on: the Admin must still revise the price.
    if (result.ok) expect(result.nextStatus).toBe('PRICE_DECLINED');
  });

  it('requires the supervisor to say what changed', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_DECLINED' }),
      actor: supervisor,
      action: 'CONFIRM_SCOPE_CHANGE',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('REASON_REQUIRED');
  });

  it('does not let a supervisor propose or revise a price', () => {
    for (const action of ['PROPOSE_PRICE', 'REVISE_PRICE'] as const) {
      const result = evaluateTransition({
        stage: stage({ status: action === 'PROPOSE_PRICE' ? 'APPROVED' : 'PRICE_DECLINED' }),
        actor: supervisor,
        action,
        payload: { amount: 5000000 },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    }
  });

  it('does not let a worker confirm their own scope change', () => {
    // Otherwise a worker could manufacture the justification for their own rise.
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_DECLINED' }),
      actor: carpenter,
      action: 'CONFIRM_SCOPE_CHANGE',
      payload: { reason: 'It definitely took me longer, honestly' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('does not let an admin confirm scope on their own behalf either', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'PRICE_DECLINED' }),
      actor: admin,
      action: 'CONFIRM_SCOPE_CHANGE',
      payload: { reason: 'Client changed the brief' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('cannot be used before a price has been declined', () => {
    const result = evaluateTransition({
      stage: stage({ status: 'APPROVED' }),
      actor: supervisor,
      action: 'CONFIRM_SCOPE_CHANGE',
      payload: { reason: 'Pre-emptively confirming a scope change' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ILLEGAL_TRANSITION');
  });

  it('leaves the revised price with the Admin and the decision with the worker', () => {
    // The full loop after a scope confirmation: Admin revises, worker accepts.
    const revised = evaluateTransition({
      stage: stage({ status: 'PRICE_DECLINED' }),
      actor: admin,
      action: 'REVISE_PRICE',
      payload: { amount: 5650000 },
    });
    expect(revised.ok).toBe(true);

    const accepted = evaluateTransition({
      stage: stage({ status: 'PRICE_PROPOSED' }),
      actor: carpenter,
      action: 'ACCEPT_PRICE',
    });
    expect(accepted.ok).toBe(true);
  });
});
