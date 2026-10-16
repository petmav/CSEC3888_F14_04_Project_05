/**
 * Recognises the transaction that registers an account on Redbelly.
 *
 * An unregistered account cannot send transactions, with one exception: the
 * "enable wallet" step at access.redbelly.network, which calls the
 * permission contract to submit the account's KYC credential. The signing
 * screen uses this to explain that call instead of warning that the network
 * will reject it.
 */

import { SELECTOR_REGISTER } from '@/constant/redbelly';

/**
 * Whether a transaction is the permission contract's registration call.
 *
 * Both the destination and the selector must match. The contract address is
 * the one resolved from the registry for the transaction's chain; if it is
 * not known, the answer is no, and the screen keeps its usual warning.
 *
 * @param tx.to - The transaction's `to`.
 * @param tx.data - The transaction's calldata.
 * @param permissionContract - The chain's permission contract, or null.
 * @returns True if the transaction registers the signer.
 */
export function isRegistrationCall(
  { to, data }: { to?: string | null; data?: string | null },
  permissionContract: string | null
): boolean {
  if (!to || !data || !permissionContract) {
    return false;
  }
  return (
    to.toLowerCase() === permissionContract.toLowerCase() &&
    data.toLowerCase().startsWith(SELECTOR_REGISTER)
  );
}
