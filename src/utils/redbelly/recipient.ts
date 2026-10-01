/**
 * Work out who a transaction actually pays (US11).
 *
 * For a plain RBNT send the recipient is `to`. For an ERC-20 transfer `to` is
 * the token contract, and the person being paid is an argument inside the
 * calldata. Checking `to` there would always come back "Contract address",
 * which is true and useless: the address the user typed is never looked at.
 *
 * Shared with the Snap (`packages/snap/src/recipient.ts`) - keep the two in
 * step. Pure and synchronous, so every case is testable without a network
 * (NFR5).
 */

/** `transfer(address,uint256)` */
export const SELECTOR_TRANSFER = '0xa9059cbb';

/** `transferFrom(address,address,uint256)` */
export const SELECTOR_TRANSFER_FROM = '0x23b872dd';

/**
 * What a transaction pays and to whom.
 *
 * - `native` - RBNT to `recipient`, with or without calldata.
 * - `token` - an ERC-20 `transfer`/`transferFrom` of `token` to `recipient`.
 * - `none` - contract creation; there is nobody to check.
 */
export type PaymentTarget =
  | { kind: 'native'; recipient: string }
  | { kind: 'token'; recipient: string; token: string }
  | { kind: 'none' };

const WORD = 64;

/**
 * Read the address held in the `index`th 32-byte argument of `calldata`.
 *
 * @param calldata - Hex calldata without the `0x` prefix and selector.
 * @param index - Zero-based argument index.
 * @returns The address, or `null` if the word is missing or not a clean
 * address (non-zero upper 12 bytes). Solidity's ABI decoder rejects a dirty
 * address word, so such a call would revert rather than pay anyone.
 */
function addressArgument(calldata: string, index: number): string | null {
  const word = calldata.slice(index * WORD, (index + 1) * WORD);
  if (word.length !== WORD || !/^[0-9a-f]+$/iu.test(word)) {
    return null;
  }
  if (!/^0{24}$/u.test(word.slice(0, 24))) {
    return null;
  }
  return `0x${word.slice(24).toLowerCase()}`;
}

/**
 * Decide who a transaction pays.
 *
 * A call with data that is not a recognised token transfer falls back to
 * `native` with `to` as the recipient. That is deliberately the same check a
 * plain send gets: if `to` is a contract the verdict says so, and if it is an
 * unregistered account the warning still fires - calldata does not make a
 * payment to an unregistered account any safer.
 *
 * @param transaction - The unsigned transaction.
 * @param transaction.to - The `to` field.
 * @param transaction.data - The calldata, if any.
 * @returns What the transaction pays and to whom.
 */
export function paymentTarget(transaction: {
  to?: unknown;
  data?: unknown;
}): PaymentTarget {
  const { to, data } = transaction;
  if (typeof to !== 'string' || to === '' || to === '0x') {
    return { kind: 'none' };
  }

  const calldata = typeof data === 'string' ? data.toLowerCase() : '';
  const selector = calldata.slice(0, 10);
  const args = calldata.slice(10);

  if (selector === SELECTOR_TRANSFER) {
    const recipient = addressArgument(args, 0);
    if (recipient) {
      return { kind: 'token', recipient, token: to };
    }
  }

  if (selector === SELECTOR_TRANSFER_FROM) {
    const recipient = addressArgument(args, 1);
    if (recipient) {
      return { kind: 'token', recipient, token: to };
    }
  }

  return { kind: 'native', recipient: to };
}
