/**
 * Redbelly transaction fee arithmetic (FR3 / US6 / US7).
 *
 * Redbelly prices gas in US dollars and converts to RBNT at an oracle rate, so
 * a routine transfer costs several RBNT rather than a fraction of one. The
 * figure is correct; it just looks broken to anyone used to Ethereum. Stating
 * the dollar equivalent turns a shocking number into an ordinary one.
 *
 * The dollar value is NOT `rbntAmount * rbntPrice` - there is no RBNT price
 * feed in this wallet, and Redbelly does not work that way round. The chain
 * quotes a USD price per unit of gas, so the fee in dollars is
 * `gasUnits * usdPerGas`. That is the whole reason this module exists rather
 * than reusing Rabby's `nativeTokenPrice` path.
 *
 * Pure arithmetic: no I/O, no provider, no network (NFR5).
 */

/**
 * A fee broken down into the units a user needs to judge it.
 *
 * gasLimit - Gas units the transaction may consume.
 *
 * gasPriceWei - Price per gas unit, in wei.
 *
 * feeWei - Maximum fee in wei.
 *
 * feeUsd - The same fee in US dollars, or `null` if the on-chain USD peg could
 * not be read. Null rather than a stale constant: quoting a dollar figure we
 * cannot substantiate is worse than quoting none (US7).
 */
export type FeeEstimate = {
  gasLimit: bigint;
  gasPriceWei: bigint;
  feeWei: bigint;
  feeUsd: number | null;
};

/**
 * The transaction fields this module reads. Both EIP-1559 and legacy
 * transactions are handled; the wallet supplies one shape or the other.
 */
export type FeeFields = {
  gas?: unknown;
  gasPrice?: unknown;
  maxFeePerGas?: unknown;
};

/**
 * Parse a quantity supplied as a hex string.
 *
 * @param value - The raw field value.
 * @returns The parsed value, or `null` if it is absent or malformed.
 */
function toBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/iu.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Work out what a transaction will cost.
 *
 * Returns `null` rather than a partial answer when the fields needed are
 * missing or malformed, so the caller renders no fee section at all instead of
 * a misleading one.
 *
 * @param transaction - The unsigned transaction.
 * @param usdPerGas - Dollars per unit of gas, read from the on-chain `gasfees`
 * contract, or `null` if that read failed.
 * @returns The fee breakdown, or `null` if it cannot be determined.
 */
export function estimateFee(
  transaction: FeeFields,
  usdPerGas: number | null
): FeeEstimate | null {
  const gasLimit = toBigInt(transaction.gas);
  // EIP-1559 transactions carry maxFeePerGas; legacy ones carry gasPrice.
  const gasPriceWei =
    toBigInt(transaction.maxFeePerGas) ?? toBigInt(transaction.gasPrice);

  if (gasLimit === null || gasPriceWei === null) {
    return null;
  }

  return {
    gasLimit,
    gasPriceWei,
    feeWei: gasLimit * gasPriceWei,
    feeUsd: usdPerGas === null ? null : Number(gasLimit) * usdPerGas,
  };
}

/**
 * The US dollar cost of a number of gas units on Redbelly.
 *
 * This is the hook Rabby's own gas display needs: it computes
 * `gasCostUsd` as `tokenAmount * nativeTokenPrice`, which is wrong for
 * Redbelly. See the module comment.
 *
 * @param gasUnits - Gas units (limit or used).
 * @param usdPerGas - Dollars per unit of gas, or `null` if unavailable.
 * @returns The dollar cost, or `null` if it cannot be determined (US7).
 */
export function gasUnitsToUsd(
  gasUnits: number | string | bigint | null | undefined,
  usdPerGas: number | null
): number | null {
  if (usdPerGas === null || gasUnits === null || gasUnits === undefined) {
    return null;
  }
  const units = Number(gasUnits);
  if (!Number.isFinite(units)) {
    return null;
  }
  return units * usdPerGas;
}
