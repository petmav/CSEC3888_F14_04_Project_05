/**
 * What a Redbelly Mainnet account is worth in US dollars (FR2).
 *
 * One function for every place that shows a total - the home card, the
 * account switcher, the address list - so they cannot disagree. Pure, so it
 * is tested without a network (NFR5).
 *
 * Counted: RBNT in the account, RBNT staked and its claimable rewards, and
 * wrapped RBNT, all at Redbelly's on-chain price; dollar stablecoins at $1.
 * Not counted: tokens with no trustworthy price. A total that leaves them
 * out is understated; one that guesses them is wrong (US7).
 */

import BigNumber from 'bignumber.js';

export type PortfolioInputs = {
  /** RBNT in the account, in RBNT. */
  rbnt: BigNumber.Value;
  /** RBNT staked plus claimable rewards, in RBNT. */
  staked: BigNumber.Value;
  /** Wrapped RBNT, in tokens. */
  wrappedRbnt: BigNumber.Value;
  /** Dollar stablecoins, in tokens. */
  stablecoins: BigNumber.Value;
  /** US dollars per RBNT. */
  rbntUsd: number;
};

/**
 * @param inputs - Holdings and the RBNT price.
 * @returns The total in US dollars.
 */
export function portfolioUsd(inputs: PortfolioInputs): BigNumber {
  return new BigNumber(inputs.rbnt)
    .plus(inputs.staked)
    .plus(inputs.wrappedRbnt)
    .times(inputs.rbntUsd)
    .plus(inputs.stablecoins);
}
