import { useRequest } from 'ahooks';
import BigNumber from 'bignumber.js';
import { useMemo } from 'react';

import type { CustomTestnetToken } from '@/background/service/customTestnet';
import type {
  RedbellyAccountSummary,
  RedbellyStakingSummary,
} from '@/background/service/redbelly';
import { REDBELLY_MAINNET_CHAIN_ID } from '@/constant/redbelly';
import {
  RBNT_PEGGED_TOKENS,
  USD_PEGGED_TOKENS,
} from '@/constant/redbelly-assets';
import { useWallet } from '@/ui/utils';

export type RedbellyPortfolio = {
  loading: boolean;
  /** Per-network RBNT balance and KYC status, Mainnet first. */
  summaries: RedbellyAccountSummary[];
  /** Mainnet ERC-20 holdings, RBNT excluded. */
  tokens: CustomTestnetToken[];
  staking: RedbellyStakingSummary[];
  stakingUnavailable: boolean;
  /** US dollars per RBNT, or null if the feed could not be read. */
  rbntUsd: number | null;
  /** Mainnet RBNT in the account, in RBNT; null if the node did not answer. */
  mainnetRbnt: BigNumber | null;
  /** RBNT staked plus claimable rewards, in RBNT. */
  stakedRbnt: BigNumber;
  /**
   * Mainnet holdings in US dollars: RBNT, staked RBNT and rewards, wrapped
   * RBNT and dollar stablecoins. Null when it cannot be stated honestly -
   * no price, or the balance itself is unavailable. Tokens without a known
   * price are left out rather than guessed at (US7).
   */
  totalUsd: BigNumber | null;
  refresh: () => void;
};

const fromWei = (wei: string | null | undefined, decimals = 18) =>
  new BigNumber(wei ?? '0').div(new BigNumber(10).pow(decimals));

/**
 * Everything the home page and asset list show about an account on Redbelly
 * (FR2, FR5, US8, US9, US13), read from the node and Redbelly's own
 * contracts.
 *
 * @param address - The account, or undefined while none is selected.
 * @returns The portfolio.
 */
export function useRedbellyPortfolio(
  address: string | undefined
): RedbellyPortfolio {
  const wallet = useWallet();

  const { data, loading, refresh } = useRequest(
    async () => {
      if (!address) {
        return null;
      }
      const [summaries, rbntUsd, staking, tokens] = await Promise.all([
        wallet.getRedbellyAccountSummaries(address),
        wallet.getRedbellyRbntUsdPrice(),
        wallet.getRedbellyStakingPositions(address),
        wallet
          .getCustomTestnetTokenList({
            address,
            chainId: REDBELLY_MAINNET_CHAIN_ID,
          })
          .catch(() => [] as CustomTestnetToken[]),
      ]);
      return { summaries, rbntUsd, staking, tokens };
    },
    { refreshDeps: [address], ready: !!address }
  );

  return useMemo(() => {
    const summaries = data?.summaries ?? [];
    const rbntUsd = data?.rbntUsd ?? null;
    const staking = data?.staking.positions ?? [];
    const tokens = (data?.tokens ?? []).filter((token) => !!token.id);

    const mainnet = summaries.find(
      (item) => item.chainId === REDBELLY_MAINNET_CHAIN_ID
    );
    const mainnetRbnt =
      mainnet && !mainnet.unavailable ? fromWei(mainnet.balanceWei) : null;

    const stakedRbnt = staking.reduce(
      (sum, item) => sum.plus(fromWei(item.staked)).plus(fromWei(item.rewards)),
      new BigNumber(0)
    );

    let totalUsd: BigNumber | null = null;
    if (rbntUsd !== null && mainnetRbnt !== null) {
      const wrapped = tokens
        .filter((token) => RBNT_PEGGED_TOKENS.has(token.id.toLowerCase()))
        .reduce((sum, token) => sum.plus(token.amount), new BigNumber(0));
      const stable = tokens
        .filter((token) => USD_PEGGED_TOKENS.has(token.id.toLowerCase()))
        .reduce((sum, token) => sum.plus(token.amount), new BigNumber(0));
      totalUsd = mainnetRbnt
        .plus(stakedRbnt)
        .plus(wrapped)
        .times(rbntUsd)
        .plus(stable);
    }

    return {
      loading: loading && !data,
      summaries,
      tokens,
      staking,
      stakingUnavailable: !!data?.staking.unavailable,
      rbntUsd,
      mainnetRbnt,
      stakedRbnt,
      totalUsd,
      refresh,
    };
  }, [data, loading, refresh]);
}
