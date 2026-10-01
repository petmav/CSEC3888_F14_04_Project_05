/**
 * A user's RBNT stake in Redbelly's staking pools (US13).
 *
 * Staked RBNT has left the account, so `eth_getBalance` cannot see it: a user
 * with millions staked sees only their loose change, which reads exactly like
 * the balance bug this project began with. These reads put the stake back on
 * the home page.
 *
 * The ABI was recovered from the Reddex staking page, which reads the same
 * functions. Note `getAvailalbeUnstakeAmount` is misspelt in the deployed
 * contract; the selector depends on the spelling, so it stays.
 *
 * Pure apart from the injected `request`, so testable without a network.
 */

import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import type { RedbellyStakingPool } from '@/constant/redbelly-assets';
import type { EthereumRequest } from './reader';

export const STAKING_POOL_ABI = parseAbi([
  'function userInfo(address) view returns (uint256 amount, uint256 logStartIndex, uint256 debtReward, uint256 timestamp)',
  'function getReward(address) view returns (uint256)',
  'function getAvailalbeUnstakeAmount(address) view returns (uint256, uint256)',
  'function getStakeUnlockTimes(address) view returns (uint256[], uint256[])',
  'function getCurrentAllocPoint() view returns (uint256)',
]);

type ReadFunction =
  | 'userInfo'
  | 'getReward'
  | 'getAvailalbeUnstakeAmount'
  | 'getStakeUnlockTimes'
  | 'getCurrentAllocPoint';

/** One pool position. All amounts are in wei of RBNT. */
export type StakingPosition = {
  pool: RedbellyStakingPool;
  staked: bigint;
  /** Rewards that can be claimed now. */
  rewards: bigint;
  /** Stake that can be withdrawn now. */
  withdrawable: bigint;
  /** Stake still inside its lock period. */
  locked: bigint;
  /** The next tranche to unlock, or null if nothing is pending. */
  nextUnlock: { amount: bigint; timestamp: number } | null;
  /** Annual rate, in percent. */
  aprPercent: number;
};

const read = async (
  request: EthereumRequest,
  pool: string,
  functionName: ReadFunction,
  args: readonly unknown[] = []
) => {
  const data = encodeFunctionData({
    abi: STAKING_POOL_ABI,
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);
  const result = await request({
    method: 'eth_call',
    params: [{ to: pool, data }, 'latest'],
  });
  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new Error(`Unexpected eth_call result: ${String(result)}`);
  }
  return decodeFunctionResult({
    abi: STAKING_POOL_ABI,
    functionName,
    data: result as `0x${string}`,
  } as Parameters<typeof decodeFunctionResult>[0]);
};

/**
 * The earliest tranche that has not unlocked yet.
 *
 * `getStakeUnlockTimes` returns parallel arrays of tranche amounts and unlock
 * times, and pads them with a zero-amount entry whose "time" is the bare lock
 * period (31536000). Zero-amount entries are skipped, which drops the padding.
 *
 * @param amounts - Tranche amounts.
 * @param times - Unlock timestamps, in seconds.
 * @param nowSeconds - The current time.
 * @returns The next unlock, or null.
 */
export function nextUnlockFrom(
  amounts: readonly bigint[],
  times: readonly bigint[],
  nowSeconds: number
): { amount: bigint; timestamp: number } | null {
  let next: { amount: bigint; timestamp: number } | null = null;
  amounts.forEach((amount, index) => {
    const timestamp = Number(times[index] ?? 0n);
    if (amount <= 0n || timestamp <= nowSeconds) {
      return;
    }
    if (!next || timestamp < next.timestamp) {
      next = { amount, timestamp };
    }
  });
  return next;
}

/**
 * Read one account's position in one pool.
 *
 * @param request - The provider request function, bound to the pool's chain.
 * @param pool - The pool.
 * @param account - The staker.
 * @param nowSeconds - The current time, injectable for tests.
 * @returns The position. A zero `staked` means no position.
 * @throws If any read fails; the caller reports that as unavailable.
 */
export async function readStakingPosition(
  request: EthereumRequest,
  pool: RedbellyStakingPool,
  account: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<StakingPosition> {
  const [userInfo, rewards, allocPoint] = (await Promise.all([
    read(request, pool.address, 'userInfo', [account]),
    read(request, pool.address, 'getReward', [account]),
    read(request, pool.address, 'getCurrentAllocPoint'),
  ])) as [readonly bigint[], bigint, bigint];

  const staked = userInfo[0];
  // Reddex shows APR as allocPoint / 1e6 * 10; 1,500,000 is the 15% pool.
  const aprPercent = (Number(allocPoint) / 1e6) * 10;

  if (!pool.hasLockPeriod) {
    return {
      pool,
      staked,
      rewards,
      withdrawable: staked,
      locked: 0n,
      nextUnlock: null,
      aprPercent,
    };
  }

  const [available, schedule] = (await Promise.all([
    read(request, pool.address, 'getAvailalbeUnstakeAmount', [account]),
    read(request, pool.address, 'getStakeUnlockTimes', [account]),
  ])) as [readonly bigint[], readonly (readonly bigint[])[]];

  const withdrawable = available[0] > staked ? staked : available[0];

  return {
    pool,
    staked,
    rewards,
    withdrawable,
    locked: staked - withdrawable,
    nextUnlock: nextUnlockFrom(schedule[0], schedule[1], nowSeconds),
    aprPercent,
  };
}
