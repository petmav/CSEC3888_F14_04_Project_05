import type { Chain } from '@debank/common';
import type { TokenItem } from '@rabby-wallet/rabby-api/dist/types';
import { formatUnits } from 'viem';
import { formatAmount } from '@/ui/utils/number';
import type { AbstractPortfolioToken } from './types';

/**
 * Build a profile token row from a Redbelly native balance.
 *
 * A missing balance means the RPC read failed; it is represented as
 * "Unavailable" rather than a zero balance.
 *
 * @param chain - The Redbelly chain.
 * @param balanceWei - The native balance in wei, or null when unavailable.
 * @returns The native token in the profile's portfolio-token shape.
 */
export function createRedbellyNativeToken(
  chain: Chain,
  balanceWei: string | null
): AbstractPortfolioToken {
  const balance = balanceWei === null ? 0n : BigInt(balanceWei);
  const formattedBalance = formatUnits(balance, chain.nativeTokenDecimals);
  const isAvailable = balanceWei !== null;
  const token: TokenItem = {
    id: chain.nativeTokenAddress,
    chain: chain.serverId,
    amount: isAvailable ? Number(formattedBalance) : 0,
    raw_amount: balance.toString(),
    raw_amount_hex_str: `0x${balance.toString(16)}`,
    decimals: chain.nativeTokenDecimals,
    display_symbol: chain.nativeTokenSymbol,
    is_core: isAvailable,
    is_verified: true,
    is_wallet: true,
    logo_url: chain.nativeTokenLogo,
    name: chain.nativeTokenSymbol,
    optimized_symbol: chain.nativeTokenSymbol,
    price: 0,
    symbol: chain.nativeTokenSymbol,
    time_at: 0,
  };

  return {
    ...token,
    _tokenId: token.id,
    _amountStr: isAvailable
      ? formatAmount(formattedBalance, chain.nativeTokenDecimals)
      : 'Unavailable',
    _priceStr: '-',
    _realUsdValue: 0,
    _usdValue: 0,
    _usdValueStr: '-',
    _amountChangeStr: '',
    _usdValueChangeStr: '-',
    _amountChangeUsdValueStr: '',
  };
}
