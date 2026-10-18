/**
 * Pure decision logic for the Redbelly recipient check.
 *
 * Ported unchanged in substance from the Snap
 * (`redbelly-address-snap/packages/snap/src/verdict.ts`), plus the one
 * decision a Snap could not make: whether to refuse to sign (US12 / FR7).
 *
 * This module does no I/O, so every outcome is testable without a network, a
 * provider, or a wallet (NFR5).
 */

/**
 * What we concluded about a recipient address.
 *
 * - `REGISTERED` - on the Redbelly permission list; a verified participant.
 * - `NOT_REGISTERED` - a user account that is not on the list.
 * - `CONTRACT` - deployed bytecode, so the permission list does not apply.
 * - `UNKNOWN` - the check did not complete.
 */
export type Verdict = 'REGISTERED' | 'NOT_REGISTERED' | 'CONTRACT' | 'UNKNOWN';

/**
 * Facts read from the chain about a single address.
 *
 * hasCode - Whether the address has deployed bytecode on this chain.
 *
 * isAllowed - Result of `isAllowed(address)` on the permission contract.
 */
export type AddressFacts = {
  hasCode: boolean;
  isAllowed: boolean;
};

/**
 * Decide the verdict for a recipient address.
 *
 * Pass `null` when the facts could not be gathered - an RPC failure, a
 * timeout, or a malformed response. That case is reported explicitly rather
 * than silently: on a confirmation screen, showing nothing reads as "checked,
 * all fine". Redbelly has a single public RPC endpoint with no failover, so
 * this happens in practice (NFR2).
 *
 * The contract check comes first, and the order is load-bearing. Contracts
 * never complete identity verification, so `isAllowed` is false for every
 * legitimately deployed contract - Multicall3 included. Reporting that as a
 * warning would fire a false alarm on every token transfer and teach users to
 * click through the warning that matters (US3).
 *
 * @param facts - Chain facts about the recipient, or `null` if unavailable.
 * @returns The verdict to display.
 */
export function verdictFor(facts: AddressFacts | null): Verdict {
  if (facts === null) {
    return 'UNKNOWN';
  }

  if (facts.hasCode) {
    return 'CONTRACT';
  }

  return facts.isAllowed ? 'REGISTERED' : 'NOT_REGISTERED';
}

/**
 * Whether a verdict is severe enough to warrant a prominent warning rather
 * than a panel the user may never expand.
 *
 * In the Snap this mapped to MetaMask's `critical` severity. In the fork it
 * drives our own alert styling on the signing screen.
 *
 * @param verdict - The verdict being displayed.
 * @returns True if this verdict warrants an escalated warning.
 */
export function isCritical(verdict: Verdict): boolean {
  return verdict === 'NOT_REGISTERED';
}

/**
 * Whether the wallet refuses to sign (US12 / FR7).
 *
 * A confirmed `NOT_REGISTERED` recipient cannot be paid: nobody can spend
 * from an address that is not on the permission list, and the transfer cannot
 * be reversed. The team first chose warn-and-acknowledge (2026-10-02) and
 * then moved to a hard block, so there is no tick box to get past it.
 *
 * Only a *confirmed* `NOT_REGISTERED` blocks. `UNKNOWN` deliberately does
 * not: Redbelly exposes a single public RPC endpoint with no failover, so
 * blocking on a failed check would make an outage indistinguishable from a
 * bricked wallet. An unverifiable recipient is reported loudly instead
 * (NFR2).
 *
 * `CONTRACT` never blocks - see `verdictFor` on why `isAllowed` is false for
 * every legitimately deployed contract.
 *
 * @param verdict - The verdict for the recipient.
 * @returns True if signing must be refused.
 */
export function blocksSigning(verdict: Verdict): boolean {
  return verdict === 'NOT_REGISTERED';
}
