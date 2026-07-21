/**
 * The pricing ledger.
 *
 * Every pricing event — proposed, revised, accepted, declined — is appended and
 * never modified (BR-9). The "current price" and the "accepted price" are not
 * stored facts to be trusted; they are *projections* derived by replaying the
 * ledger. That is what makes the trail tamper-evident: if a stored price ever
 * disagrees with the ledger, the ledger is right and something is wrong.
 *
 * `stage.accepted_price` exists purely as a read-model for query performance.
 * `projectAcceptedPrice` is the authority, and reconciliation should be checked
 * against it.
 */

import { PricingAction } from './stage.types';

export interface PricingEntry {
  action: PricingAction;
  /** Minor units. Null/undefined for DECLINED, which carries no amount. */
  value?: bigint | null;
  actorId: string;
  createdAt: Date;
  reason?: string | null;
}

export interface LedgerProjection {
  /** The amount currently on the table awaiting the worker's decision, if any. */
  currentProposal: bigint | null;
  /** The amount the worker accepted. Non-null only once acceptance has occurred. */
  acceptedPrice: bigint | null;
  /** How many times a price has been put to the worker (initial + revisions). */
  proposalCount: number;
  /** How many times the worker has declined. A useful negotiation-friction signal. */
  declineCount: number;
  settled: boolean;
}

/**
 * Replay a stage's pricing history.
 *
 * Entries are sorted defensively rather than trusting caller ordering — a
 * mis-ordered replay would produce a wrong price, and this is the money path.
 */
export function projectLedger(entries: readonly PricingEntry[]): LedgerProjection {
  const ordered = [...entries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  let currentProposal: bigint | null = null;
  let acceptedPrice: bigint | null = null;
  let proposalCount = 0;
  let declineCount = 0;

  for (const entry of ordered) {
    switch (entry.action) {
      case 'PROPOSED':
      case 'REVISED':
        currentProposal = toBigInt(entry.value);
        proposalCount += 1;
        break;

      case 'DECLINED':
        // The proposal leaves the table; the Admin must revise to continue.
        currentProposal = null;
        declineCount += 1;
        break;

      case 'ACCEPTED':
        // Acceptance settles at the accepted entry's own value. We trust the
        // ACCEPTED row's amount rather than the last proposal, so a stale
        // acceptance can never silently settle at a different number.
        acceptedPrice = toBigInt(entry.value) ?? currentProposal;
        currentProposal = null;
        break;
    }
  }

  return {
    currentProposal,
    acceptedPrice,
    proposalCount,
    declineCount,
    settled: acceptedPrice !== null,
  };
}

/**
 * Verify that a stored `stage.accepted_price` agrees with the ledger.
 * Intended for a periodic reconciliation job and for integration tests on the
 * money path — the blueprint's "prove, don't assume" stance.
 */
export function reconcile(
  storedAcceptedPrice: bigint | null,
  entries: readonly PricingEntry[],
): { consistent: boolean; ledgerPrice: bigint | null; message?: string } {
  const { acceptedPrice } = projectLedger(entries);

  if (storedAcceptedPrice === acceptedPrice) {
    return { consistent: true, ledgerPrice: acceptedPrice };
  }

  return {
    consistent: false,
    ledgerPrice: acceptedPrice,
    message:
      `Stored accepted price (${storedAcceptedPrice ?? 'null'}) disagrees with the ` +
      `pricing ledger (${acceptedPrice ?? 'null'}). The ledger is authoritative.`,
  };
}

function toBigInt(value: bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? value : BigInt(value);
}
