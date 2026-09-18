/**
 * RBNT number formatting.
 *
 * Ported from the Snap. Kept separate from Rabby's own `ui/utils/number`
 * helpers because those go through floating point, and Redbelly balances and
 * fees routinely exceed what a double represents exactly.
 */

const WEI_PER_RBNT = 10n ** 18n;

/**
 * Format a wei amount as RBNT.
 *
 * Done with integer arithmetic rather than dividing into a float.
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
 * Redbelly's base fee is US$0.01, so most fees land below a cent and would
 * render as `US$0.00` under normal two-decimal formatting.
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
