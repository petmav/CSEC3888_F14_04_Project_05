/**
 * RBNT's US dollar price, from Redbelly's own on-chain price feed.
 *
 * RBNT has no price in DeBank, so on Rabby's integrated path every Redbelly
 * holding reads "$0.00" - the confusion behind FR2/US8. The price feed is the
 * contract registered under `pricefeed` in the ContractsRegistry; the access
 * dApp values RBNT from it the same way (`decimals()` and
 * `getLatestPrice()`).
 *
 * Pure apart from the injected `request`, so testable without a network.
 */

import { decodeFunctionResult, parseAbi } from 'viem';
import {
  PRICE_FEED_KEY,
  PRICE_MAX_AGE_SECONDS,
  SELECTOR_DECIMALS,
  SELECTOR_GET_LATEST_PRICE,
} from '@/constant/redbelly';
import { EthereumRequest, resolveContract } from './reader';

const PRICE_FEED_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function getLatestPrice() view returns (int256, uint256, bool)',
]);

const call = async (
  request: EthereumRequest,
  to: string,
  data: string
): Promise<`0x${string}`> => {
  const result = await request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new Error(`Unexpected eth_call result: ${String(result)}`);
  }
  return result as `0x${string}`;
};

/**
 * Read the RBNT/USD price.
 *
 * @param request - The provider request function.
 * @param chainId - The numeric chain id.
 * @param nowSeconds - The current time, injectable for tests.
 * @returns US dollars per RBNT.
 * @throws If the feed cannot be read, is not positive, or is stale. A
 * missing price is shown as no dollar figure, never as $0 (US7).
 */
export async function readRbntUsdPrice(
  request: EthereumRequest,
  chainId: number,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<number> {
  const feed = await resolveContract(request, chainId, PRICE_FEED_KEY);

  const [decimalsData, priceData] = await Promise.all([
    call(request, feed, SELECTOR_DECIMALS),
    call(request, feed, SELECTOR_GET_LATEST_PRICE),
  ]);

  const decimals = decodeFunctionResult({
    abi: PRICE_FEED_ABI,
    functionName: 'decimals',
    data: decimalsData,
  });
  const [price, updatedAt] = decodeFunctionResult({
    abi: PRICE_FEED_ABI,
    functionName: 'getLatestPrice',
    data: priceData,
  });

  if (price <= 0n) {
    throw new Error(`Price feed returned a non-positive price: ${price}`);
  }
  if (nowSeconds - Number(updatedAt) > PRICE_MAX_AGE_SECONDS) {
    throw new Error(`Price feed is stale: last updated at ${updatedAt}`);
  }

  return Number(price) / 10 ** Number(decimals);
}
