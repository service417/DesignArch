import { PricingEntry, projectLedger, reconcile } from './pricing-ledger';

let clock = 0;
function at(): Date {
  clock += 1000;
  return new Date(clock);
}

beforeEach(() => {
  clock = 0;
});

function entry(
  action: PricingEntry['action'],
  value: bigint | null,
  actorId = 'admin-1',
): PricingEntry {
  return { action, value, actorId, createdAt: at() };
}

describe('pricing ledger projection', () => {
  it('reports nothing for an empty ledger', () => {
    expect(projectLedger([])).toEqual({
      currentProposal: null,
      acceptedPrice: null,
      proposalCount: 0,
      declineCount: 0,
      settled: false,
    });
  });

  it('tracks a single proposal awaiting decision', () => {
    const result = projectLedger([entry('PROPOSED', 750_000n)]);
    expect(result.currentProposal).toBe(750_000n);
    expect(result.acceptedPrice).toBeNull();
    expect(result.settled).toBe(false);
    expect(result.proposalCount).toBe(1);
  });

  it('settles at the accepted amount', () => {
    const result = projectLedger([
      entry('PROPOSED', 750_000n),
      entry('ACCEPTED', 750_000n, 'worker-1'),
    ]);
    expect(result.acceptedPrice).toBe(750_000n);
    expect(result.settled).toBe(true);
    expect(result.currentProposal).toBeNull();
  });

  it('clears the proposal on decline and counts the round', () => {
    const result = projectLedger([
      entry('PROPOSED', 500_000n),
      entry('DECLINED', null, 'worker-1'),
    ]);
    expect(result.currentProposal).toBeNull();
    expect(result.declineCount).toBe(1);
    expect(result.settled).toBe(false);
  });

  it('replays a full negotiation to the final accepted price', () => {
    const result = projectLedger([
      entry('PROPOSED', 500_000n),
      entry('DECLINED', null, 'worker-1'),
      entry('REVISED', 650_000n),
      entry('DECLINED', null, 'worker-1'),
      entry('REVISED', 800_000n),
      entry('ACCEPTED', 800_000n, 'worker-1'),
    ]);
    expect(result.acceptedPrice).toBe(800_000n);
    expect(result.proposalCount).toBe(3);
    expect(result.declineCount).toBe(2);
    expect(result.settled).toBe(true);
  });

  it('replays correctly regardless of the order entries arrive in', () => {
    const ordered: PricingEntry[] = [
      entry('PROPOSED', 500_000n),
      entry('DECLINED', null, 'worker-1'),
      entry('REVISED', 900_000n),
      entry('ACCEPTED', 900_000n, 'worker-1'),
    ];
    const shuffled = [ordered[3], ordered[0], ordered[2], ordered[1]];

    expect(projectLedger(shuffled)).toEqual(projectLedger(ordered));
    expect(projectLedger(shuffled).acceptedPrice).toBe(900_000n);
  });

  it('settles at the ACCEPTED row amount, not the last proposal', () => {
    // Guards against a stale acceptance silently settling at a newer number.
    const result = projectLedger([
      entry('PROPOSED', 500_000n),
      entry('ACCEPTED', 500_000n, 'worker-1'),
    ]);
    expect(result.acceptedPrice).toBe(500_000n);
  });
});

describe('reconciliation against the stored read-model', () => {
  const settled: PricingEntry[] = [
    entry('PROPOSED', 750_000n),
    entry('ACCEPTED', 750_000n, 'worker-1'),
  ];

  it('confirms agreement', () => {
    const result = reconcile(750_000n, settled);
    expect(result.consistent).toBe(true);
    expect(result.ledgerPrice).toBe(750_000n);
  });

  it('flags a stored price that disagrees with the ledger', () => {
    const result = reconcile(999_999n, settled);
    expect(result.consistent).toBe(false);
    expect(result.ledgerPrice).toBe(750_000n);
    expect(result.message).toMatch(/ledger is authoritative/);
  });

  it('flags a stored price on a stage the ledger says is unsettled', () => {
    const result = reconcile(750_000n, [entry('PROPOSED', 750_000n)]);
    expect(result.consistent).toBe(false);
    expect(result.ledgerPrice).toBeNull();
  });

  it('confirms agreement when both are null', () => {
    expect(reconcile(null, [entry('PROPOSED', 500_000n)]).consistent).toBe(true);
  });
});
