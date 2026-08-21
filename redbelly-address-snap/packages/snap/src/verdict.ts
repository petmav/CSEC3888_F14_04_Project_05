/**
 * Pure decision logic for the Redbelly recipient check.
 *
 * This module does no I/O, so every outcome is testable without a network, a
 * provider, or a wallet. `redbelly.ts` gathers the facts; this module decides
 * what they mean.
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
 * isAllowed - Result of `isAllowed(address)` on the permission
 * contract.
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
 * this happens in practice.
 *
 * The contract check comes first, and the order is load-bearing. Contracts
 * never complete identity verification, so `isAllowed` is false for every
 * legitimately deployed contract - Multicall3 included. Reporting that as a
 * warning would fire a false alarm on every token transfer and teach users to
 * click through the warning that matters.
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
 * Whether a verdict should be escalated to MetaMask's `critical` severity,
 * which raises a modal warning instead of a panel the user may never open.
 *
 * Only an unregistered recipient qualifies. Escalating `CONTRACT` would fire a
 * modal on every token transfer, and escalating `UNKNOWN` would fire one every
 * time the node is briefly unreachable. Either would teach users to dismiss
 * the modal on reflex, which costs us the one case that matters.
 *
 * @param verdict - The verdict being displayed.
 * @returns True if this verdict warrants a modal.
 */
export function isCritical(verdict: Verdict): boolean {
  return verdict === 'NOT_REGISTERED';
}
