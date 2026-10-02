/**
 * RBNT as a Rabby `TokenItem`.
 *
 * DeBank does not index Redbelly, so the native token never arrives in any
 * DeBank-backed token list. It is built locally from the chain definition and
 * a balance read straight from a Redbelly node (FR2).
 *
 * `price` is 0 on purpose: there is no RBNT price feed in this wallet, and a
 * made-up price would put a false dollar figure on the confirmation screen.
 */
import BigNumber from 'bignumber.js';
import type { TokenItem } from '@rabby-wallet/rabby-api/dist/types';
import type { Chain } from '@debank/common';

import { makeTokenFromChain } from '@/utils/chain';

/**
 * @param chain - A Redbelly chain definition.
 * @param balanceWei - Balance in wei as a decimal string, or null when the node
 * could not be read. Null yields a zero balance so the token stays selectable.
 * @returns The RBNT token for that chain.
 */
export function buildRedbellyNativeToken(
  chain: Chain,
  balanceWei: string | null
): TokenItem {
  const wei = new BigNumber(balanceWei ?? 0);
  return {
    ...makeTokenFromChain(chain),
    amount: wei
      .div(new BigNumber(10).pow(chain.nativeTokenDecimals))
      .toNumber(),
    raw_amount: wei.toFixed(0),
    raw_amount_hex_str: `0x${wei.toString(16)}`,
  } as TokenItem;
}
