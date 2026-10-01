import { decodeFunctionData, encodeFunctionResult } from 'viem';
import {
  nextUnlockFrom,
  readStakingPosition,
  STAKING_POOL_ABI,
} from '@/utils/redbelly/staking';
import { REDBELLY_STAKING_POOLS } from '@/constant/redbelly-assets';
import type { EthereumRequest } from '@/utils/redbelly/reader';

const [LOCKED_POOL, FLEX_POOL] = REDBELLY_STAKING_POOLS;
const STAKER = '0xb80e7a43f8a162ced2dd367a1d41f9b28cd0e7aa';
const NOW = 1790831811;
const LOCK_PERIOD = 31536000n;

type Replies = Partial<Record<string, readonly unknown[] | unknown>>;

/**
 * A provider that answers staking pool reads from a table, keyed by function.
 *
 * @param replies - Function name to decoded return value.
 * @returns The request function.
 */
function poolProvider(replies: Replies): EthereumRequest {
  return async ({ params }) => {
    const [{ data }] = params as { data: `0x${string}` }[];
    const { functionName } = decodeFunctionData({
      abi: STAKING_POOL_ABI,
      data,
    });
    if (!(functionName in replies)) {
      throw new Error(`Unexpected ${functionName}`);
    }
    return encodeFunctionResult({
      abi: STAKING_POOL_ABI,
      functionName,
      result: replies[functionName],
    } as Parameters<typeof encodeFunctionResult>[0]);
  };
}

describe('nextUnlockFrom', () => {
  it('picks the earliest future tranche and skips the padding entry', () => {
    // Shape observed live: three tranches plus a zero-amount entry whose
    // "time" is the bare lock period.
    const next = nextUnlockFrom(
      [881902n, 536n, 8217n, 0n],
      [1814765495n, 1814765762n, 1820988102n, LOCK_PERIOD],
      NOW
    );
    expect(next).toEqual({ amount: 881902n, timestamp: 1814765495 });
  });

  it('ignores tranches that have already unlocked', () => {
    expect(
      nextUnlockFrom([5n, 7n], [BigInt(NOW - 1), BigInt(NOW + 10)], NOW)
    ).toEqual({ amount: 7n, timestamp: NOW + 10 });
  });

  it('returns null when nothing is pending', () => {
    expect(nextUnlockFrom([0n], [LOCK_PERIOD], NOW)).toBeNull();
    expect(nextUnlockFrom([], [], NOW)).toBeNull();
  });
});

describe('readStakingPosition', () => {
  it('reads a locked position the way the live pool reports it', async () => {
    const staked = 890656701265146589800000n;
    const position = await readStakingPosition(
      poolProvider({
        userInfo: [staked, 1n, 0n, 1790830239n],
        getReward: 6269843597186153695n,
        getCurrentAllocPoint: 1500000n,
        getAvailalbeUnstakeAmount: [0n, 1814765495n],
        getStakeUnlockTimes: [
          [staked, 0n],
          [1814765495n, LOCK_PERIOD],
        ],
      }),
      LOCKED_POOL,
      STAKER,
      NOW
    );
    expect(position.staked).toBe(staked);
    expect(position.rewards).toBe(6269843597186153695n);
    expect(position.withdrawable).toBe(0n);
    expect(position.locked).toBe(staked);
    expect(position.nextUnlock).toEqual({
      amount: staked,
      timestamp: 1814765495,
    });
    // Reddex's formula: 1,500,000 / 1e6 * 10 = 15%, the advertised rate.
    expect(position.aprPercent).toBe(15);
  });

  it('never reports more withdrawable than staked', async () => {
    const position = await readStakingPosition(
      poolProvider({
        userInfo: [10n, 0n, 0n, 0n],
        getReward: 0n,
        getCurrentAllocPoint: 1500000n,
        getAvailalbeUnstakeAmount: [25n, 0n],
        getStakeUnlockTimes: [[], []],
      }),
      LOCKED_POOL,
      STAKER,
      NOW
    );
    expect(position.withdrawable).toBe(10n);
    expect(position.locked).toBe(0n);
  });

  it('treats a flexible stake as fully withdrawable without lock reads', async () => {
    const position = await readStakingPosition(
      poolProvider({
        userInfo: [42n, 2n, 0n, 1759276312n],
        getReward: 3n,
        getCurrentAllocPoint: 600000n,
      }),
      FLEX_POOL,
      STAKER,
      NOW
    );
    expect(position.withdrawable).toBe(42n);
    expect(position.locked).toBe(0n);
    expect(position.nextUnlock).toBeNull();
    expect(position.aprPercent).toBe(6);
  });

  it('throws when the pool cannot be read, so it is shown as unavailable', async () => {
    const broken: EthereumRequest = async () => {
      throw new Error('node down');
    };
    await expect(
      readStakingPosition(broken, FLEX_POOL, STAKER, NOW)
    ).rejects.toThrow('node down');
  });
});
