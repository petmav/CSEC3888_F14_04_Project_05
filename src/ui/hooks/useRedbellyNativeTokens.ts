import { useAsync } from 'react-use';
import type { TokenItem } from '@rabby-wallet/rabby-api/dist/types';

import { REDBELLY_CHAINS } from '@/constant/redbelly-chains';
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
    if (!enabled || !address) {
      return [];
    }
    return Promise.all(
      REDBELLY_CHAINS.map(async (chain) =>
        buildRedbellyNativeToken(
          chain,
          await wallet.getRedbellyBalance(chain.id, address)
        )
      )
    );
  }, [enabled, address]);

  return value || [];
}
