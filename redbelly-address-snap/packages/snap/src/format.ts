/**
 * Number formatting shared by the transaction panel and the home page.
 */

const WEI_PER_RBNT = 10n ** 18n;

/**
 * Format a wei amount as RBNT.
 *
 * Done with integer arithmetic rather than dividing into a float, because
 * Redbelly balances and fees routinely exceed what a double represents
 * exactly.
 *
 * @param wei - The amount in wei.
 * @param decimals - Fractional digits to show.
 * @returns The formatted amount, without a unit suffix.
 */
export function formatRbnt(wei: bigint, decimals = 4): string {
  const scale = 10n ** BigInt(decimals);
  const whole = wei / WEI_PER_RBNT;
  const fraction = ((wei % WEI_PER_RBNT) * scale) / WEI_PER_RBNT;
  return `${whole}.${fraction.toString().padStart(decimals, '0')}`;
}

/**
 * Format a US dollar amount, keeping sub-cent values readable.
 *
 * @param usd - The amount in dollars.
 * @returns The formatted amount, prefixed with `US$`.
 */
export function formatUsd(usd: number): string {
  if (usd < 0.01) {
    return `US$${usd.toFixed(4)}`;
  }
  return `US$${usd.toFixed(2)}`;
}

/**
 * Abbreviate an address for display alongside its full form.
 *
 * @param address - A hex address.
 * @returns The shortened address.
 */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
