import { useAsync } from 'react-use';
import type { TokenItem } from '@rabby-wallet/rabby-api/dist/types';

import { REDBELLY_ONLY } from '@/constant/redbelly';
import { REDBELLY_NETWORKS } from '@/constant/redbelly-chains';
import { findChain } from '@/utils/chain';
import { useRabbySelector } from '@/ui/store';
import { useWallet } from '@/ui/utils';
import { buildRedbellyNativeToken } from '@/utils/redbelly/token';

/**
 * RBNT on both Redbelly networks, with live balances, for token pickers.
 *
 * @param enabled - Only read balances while a picker is actually open.
 * @returns Both RBNT tokens, or an empty list until loaded.
 */
export function useRedbellyNativeTokens(enabled: boolean): TokenItem[] {
  const wallet = useWallet();
  const address = useRabbySelector((s) => s.account.currentAccount?.address);

  const { value } = useAsync(async () => {
    // Redbelly-only: Redbelly is a built-in custom network, and the picker
    // already lists custom-network tokens (RBNT included) - adding them here
    // would show RBNT twice.
    if (REDBELLY_ONLY || !enabled || !address) {
      return [];
    }
    const chains = REDBELLY_NETWORKS.map((network) =>
      findChain({ id: network.id })
    ).filter((chain): chain is NonNullable<typeof chain> => !!chain);
    return Promise.all(
      chains.map(async (chain) =>
        buildRedbellyNativeToken(
          chain,
          await wallet.getRedbellyBalance(chain.id, address)
        )
      )
    );
  }, [enabled, address]);

  return value || [];
}
