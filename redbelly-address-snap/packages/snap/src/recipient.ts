/**
 * Work out who a transaction actually pays (US11).
 *
 * For a plain RBNT send the recipient is `to`. For an ERC-20 transfer `to` is
 * the token contract, and the person being paid is an argument inside the
 * calldata. Checking `to` there would always come back "Contract address",
 * which is true and useless: the address the user typed is never looked at.
 *
 * Shared with the Redbelly Wallet fork (`src/utils/redbelly/recipient.ts`) -
 * keep the two in step. Pure and synchronous, so every case is testable
 * without a network (NFR5).
 */

/** `transfer(address,uint256)` */
export const SELECTOR_TRANSFER = '0xa9059cbb';

/** `transferFrom(address,address,uint256)` - ERC-20 and ERC-721. */
export const SELECTOR_TRANSFER_FROM = '0x23b872dd';

/** `approve(address,uint256)` - ERC-20 and ERC-721. */
export const SELECTOR_APPROVE = '0x095ea7b3';

/**
 * Calls that move a token, by selector, with the index of the argument that
 * holds the payee.
 */
const TRANSFERS = new Map<string, number>([
  [SELECTOR_TRANSFER, 0],
  [SELECTOR_TRANSFER_FROM, 1],
  // ERC-721 safeTransferFrom(address,address,uint256)
  ['0x42842e0e', 1],
  // ERC-721 safeTransferFrom(address,address,uint256,bytes)
  ['0xb88d4fde', 1],
  // ERC-1155 safeTransferFrom(address,address,uint256,uint256,bytes)
  ['0xf242432a', 1],
  // ERC-1155 safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
  ['0x2eb2c2d6', 1],
  // ERC-677 transferAndCall(address,uint256,bytes)
  ['0x4000aea0', 0],
  // ERC-777 send(address,uint256,bytes)
  ['0x9bd9bbc6', 0],
]);

/**
 * Calls that let another address spend the user's tokens, by selector, with
 * the indices of the arguments that hold the spender and the amount (or, for
 * `setApprovalForAll`, the bool). A zero amount or `false` is a revoke.
 */
const APPROVALS = new Map<string, { spender: number; amount: number }>([
  [SELECTOR_APPROVE, { spender: 0, amount: 1 }],
  // setApprovalForAll(address,bool) - ERC-721 and ERC-1155
  ['0xa22cb465', { spender: 0, amount: 1 }],
  // increaseAllowance(address,uint256) - OpenZeppelin ERC-20
  ['0x39509351', { spender: 0, amount: 1 }],
  // EIP-2612 permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
  ['0xd505accf', { spender: 1, amount: 2 }],
]);

/**
 * What a transaction pays and to whom.
 *
 * - `native` - RBNT to `recipient`, with no calldata.
 * - `token` - a token transfer (ERC-20, ERC-721, ERC-1155, ERC-677 or
 * ERC-777) of `token` to `recipient`.
 * - `approval` - lets `recipient` spend the user's `token`. Revoking an
 * approval is a `call`: it takes a permission away, so the spender is not
 * the risk.
 * - `call` - any other call to `recipient`. Only `recipient` itself can
 * be checked: if the contract forwards funds on, the address it forwards to
 * is not visible in the calldata, so it is not checked.
 * - `none` - contract creation; there is nobody to check.
 */
export type PaymentTarget =
  | { kind: 'native'; recipient: string }
  | { kind: 'token'; recipient: string; token: string }
  | { kind: 'approval'; recipient: string; token: string }
  | { kind: 'call'; recipient: string }
  | { kind: 'none' };

const WORD = 64;

/**
 * Whether the `index`th 32-byte argument of `calldata` is present and zero.
 *
 * @param calldata - Hex calldata without the `0x` prefix and selector.
 * @param index - Zero-based argument index.
 * @returns True for an all-zero word; false if it is non-zero or missing.
 */
function isZeroArgument(calldata: string, index: number): boolean {
  return /^0{64}$/u.test(calldata.slice(index * WORD, (index + 1) * WORD));
}

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
 * A call that is not a recognised transfer or approval - or one whose
 * arguments do not decode - is a `call` to `to`. That is deliberately the
 * same check a plain send gets: if `to` is a contract the verdict says so,
 * and if it is an unregistered account the warning still fires - calldata
 * does not make a payment to an unregistered account any safer. The `call`
 * kind exists so the screen can say what was *not* checked.
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
  if (calldata === '' || calldata === '0x') {
    return { kind: 'native', recipient: to };
  }

  const selector = calldata.slice(0, 10);
  const args = calldata.slice(10);

  const payeeIndex = TRANSFERS.get(selector);
  if (payeeIndex !== undefined) {
    const recipient = addressArgument(args, payeeIndex);
    if (recipient) {
      return { kind: 'token', recipient, token: to };
    }
  }

  const approval = APPROVALS.get(selector);
  if (approval !== undefined && !isZeroArgument(args, approval.amount)) {
    const recipient = addressArgument(args, approval.spender);
    if (recipient) {
      return { kind: 'approval', recipient, token: to };
    }
  }

  return { kind: 'call', recipient: to };
}
