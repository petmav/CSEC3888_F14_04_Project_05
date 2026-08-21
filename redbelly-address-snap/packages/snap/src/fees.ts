/**
 * Explains Redbelly's transaction fee, which is the second issue the client
 * reported (Tony Tao, week-2 kickoff: "the challenging will be around the gas
 * and how you estimate the gas").
 *
 * A Snap cannot change MetaMask's gas estimation or its fee UI - see
 * `FINDINGS.md` section 2.4. What it can do is explain the number MetaMask
 * already shows. Redbelly prices gas in US dollars and converts to RBNT at an
 * oracle rate, so a routine transfer costs thousands of times more RBNT than
 * an Ethereum user expects gwei. The figure is correct; it just looks broken.
 *
 * Everything here is computed from fields already on the transaction, so this
 * costs no RPC calls and needs no extra permissions.
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
 * feeUsd - The same fee in US dollars, or `null` if the on-chain USD
 * peg could not be read. Null rather than a stale constant: quoting a dollar
 * figure we cannot substantiate is worse than quoting none.
 */
export type FeeEstimate = {
  gasLimit: bigint;
  gasPriceWei: bigint;
  feeWei: bigint;
  feeUsd: number | null;
};

/**
 * The transaction fields this module reads. Both EIP-1559 and legacy
 * transactions are handled; MetaMask supplies one shape or the other.
 */
export type FeeFields = {
  gas?: unknown;
  gasPrice?: unknown;
  maxFeePerGas?: unknown;
};

/**
 * Parse a quantity that MetaMask supplies as a hex string.
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
  usdPerGas: number | null,
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
