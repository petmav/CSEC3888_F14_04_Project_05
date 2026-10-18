/**
 * Recognises the transaction that registers an account on Redbelly.
 *
 * An unregistered account cannot send transactions, with one exception: the
 * "enable wallet" step at access.redbelly.network, which calls the
 * permission contract to submit the account's KYC credential. The signing
 * screen uses this to explain that call instead of warning that the network
 * will reject it.
 */

import BigNumber from 'bignumber.js';

import {
  REGISTRATION_GAS_LIMIT_RATIO,
  SELECTOR_REGISTER,
} from '@/constant/redbelly';

type Quantity = string | number | null | undefined;

/** A quantity as a BigNumber, or NaN; accepts decimal and 0x-hex. */
const quantity = (value: Quantity) =>
  value === null || value === undefined || value === ''
    ? new BigNumber(NaN)
    : new BigNumber(value);

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

/**
 * The gas limit for a registration call (`REGISTRATION_GAS_LIMIT_RATIO` of
 * the estimate), fitted to the balance.
 *
 * The limit is the larger of 1.1x the estimate and the dApp's own gas, but
 * never above Rabby's limit for the same transaction. If the balance cannot
 * pay for that limit, it is lowered to what the balance can pay for - but
 * never below the estimate. If even the estimate is unaffordable, the limit
 * is left as is and the signing screen's balance check refuses it.
 *
 * Returns null - keep Rabby's limit - when any input is missing: an unknown
 * balance must not be read as zero, nor an unknown price as free.
 *
 * @param params.estimate - The node's gas estimate.
 * @param params.ceiling - Rabby's gas limit for the transaction (1.5x).
 * @param params.dappGasLimit - The gas the dApp asked for, if any.
 * @param params.balance - The signer's native balance, in wei.
 * @param params.value - The value the transaction sends, in wei.
 * @param params.gasPrice - The selected gas price, in wei.
 * @returns The gas limit as hex and whether it was lowered, or null.
 */
export function registrationGasLimit({
  estimate,
  ceiling,
  dappGasLimit,
  balance,
  value,
  gasPrice,
}: {
  estimate: Quantity;
  ceiling: Quantity;
  dappGasLimit?: Quantity;
  balance: Quantity;
  value?: Quantity;
  gasPrice: Quantity;
}): { gasLimit: string; lowered: boolean } | null {
  const est = quantity(estimate);
  const price = quantity(gasPrice);
  const funds = quantity(balance);
  if (
    !est.isFinite() ||
    !est.gt(0) ||
    !price.isFinite() ||
    !price.gt(0) ||
    !funds.isFinite()
  ) {
    return null;
  }

  let target = est
    .times(REGISTRATION_GAS_LIMIT_RATIO)
    .integerValue(BigNumber.ROUND_CEIL);
  const dapp = quantity(dappGasLimit);
  if (dapp.isFinite() && dapp.gt(target)) {
    target = dapp;
  }
  const cap = quantity(ceiling);
  if (cap.isFinite() && cap.gt(0) && cap.lt(target)) {
    target = cap;
  }
  if (target.lt(est)) {
    return null;
  }

  const sent = quantity(value);
  const spendable = funds.minus(sent.isFinite() ? sent : 0);
  const affordable = spendable.div(price).integerValue(BigNumber.ROUND_FLOOR);
  const hex = (gas: BigNumber) => `0x${gas.toString(16)}`;

  if (affordable.gte(target)) {
    return { gasLimit: hex(target), lowered: false };
  }
  if (affordable.gte(est)) {
    return { gasLimit: hex(affordable), lowered: true };
  }
  return { gasLimit: hex(target), lowered: false };
}
