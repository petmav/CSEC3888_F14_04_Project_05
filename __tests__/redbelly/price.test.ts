import { encodeAbiParameters } from 'viem';
import { readRbntUsdPrice } from '@/utils/redbelly/price';
import {
  clearRedbellyContractCache,
  EthereumRequest,
} from '@/utils/redbelly/reader';
import {
  CONTRACTS_REGISTRY,
  SELECTOR_DECIMALS,
  SELECTOR_GET_LATEST_PRICE,
} from '@/constant/redbelly';

/** Mainnet's price feed, as resolved live on 2026-10-01. */
const FEED = '0x0cd42d829f88fe539f710e9b7692c70b94aaead4';
const NOW = 1790832199;

const word = (value: bigint | number) =>
  encodeAbiParameters([{ type: 'uint256' }], [BigInt(value)]);

/**
 * A provider that answers the registry lookup and the two feed reads.
 *
 * @param price - The feed's `(price, updatedAt, flag)`.
 * @param decimals - The feed's `decimals()`.
 * @returns The request function.
 */
function feedProvider(
  price: [bigint, bigint, boolean],
  decimals = 6
): EthereumRequest {
  return async ({ method, params }) => {
    if (method !== 'eth_call') {
      throw new Error(`Unexpected ${method}`);
    }
    const [{ to, data }] = params as { to: string; data: string }[];
    if (to.toLowerCase() === CONTRACTS_REGISTRY.toLowerCase()) {
      return encodeAbiParameters([{ type: 'address' }], [FEED]);
    }
    if (to === FEED && data === SELECTOR_DECIMALS) {
      return word(decimals);
    }
    if (to === FEED && data === SELECTOR_GET_LATEST_PRICE) {
      return encodeAbiParameters(
        [{ type: 'int256' }, { type: 'uint256' }, { type: 'bool' }],
        price
      );
    }
    throw new Error(`Unexpected call to ${to} with ${data}`);
  };
}

describe('readRbntUsdPrice', () => {
  beforeEach(() => clearRedbellyContractCache());

  it('scales the live price by the feed decimals', async () => {
    // (2467, t, false) with 6 decimals is the live reading: $0.002467.
    const price = await readRbntUsdPrice(
      feedProvider([2467n, BigInt(NOW), false]),
      151,
      NOW + 60
    );
    expect(price).toBeCloseTo(0.002467, 9);
  });

  it('refuses a stale price rather than show an old dollar figure', async () => {
    await expect(
      readRbntUsdPrice(
        feedProvider([2467n, BigInt(NOW), false]),
        151,
        NOW + 2 * 24 * 60 * 60
      )
    ).rejects.toThrow('stale');
  });

  it('refuses a zero or negative price rather than show $0', async () => {
    await expect(
      readRbntUsdPrice(feedProvider([0n, BigInt(NOW), false]), 151, NOW)
    ).rejects.toThrow('non-positive');
    await expect(
      readRbntUsdPrice(feedProvider([-5n, BigInt(NOW), false]), 151, NOW)
    ).rejects.toThrow('non-positive');
  });

  it('propagates a failed read so the caller shows no figure', async () => {
    const broken: EthereumRequest = async () => {
      throw new Error('node down');
    };
    await expect(readRbntUsdPrice(broken, 151, NOW)).rejects.toThrow(
      'node down'
    );
  });
});
