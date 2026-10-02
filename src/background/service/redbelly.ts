/**
 * Redbelly background service.
 *
 * Owns every Redbelly-specific chain read the wallet makes: the KYC permission
 * check (FR1/FR5), the RBNT balance (FR2) and the USD gas peg (FR3). It talks
 * to Redbelly's public RPC endpoints directly (NFR3) rather than through
 * DeBank, which does not index Redbelly.
 *
 * Read-only by construction. This service issues `eth_call`, `eth_getCode`,
 * `eth_getBalance` and `eth_gasPrice` and nothing else; it never signs, never submits, and holds
 * no key material.
 */

import {
  isRedbellyChainId,
  redbellyRpcUrl,
  REDBELLY_MAINNET_CHAIN_ID,
  REDBELLY_TESTNET_CHAIN_ID,
} from '@/constant/redbelly';
import {
  clearRedbellyContractCache,
  readAddressFacts,
  readBalance,
  readGasPrice,
  readIsAllowed,
  readUsdPerGas,
} from '@/utils/redbelly/reader';
import type { EthereumRequest } from '@/utils/redbelly/reader';
import { verdictFor } from '@/utils/redbelly/verdict';
import type { AddressFacts, Verdict } from '@/utils/redbelly/verdict';
import { withTimeout } from 'background/utils';
import {
  RBNT_PEGGED_TOKENS,
  REDBELLY_DEFAULT_TOKENS,
  REDBELLY_EXPLORER_API,
  REDBELLY_STAKING_POOLS,
  USD_PEGGED_TOKENS,
} from '@/constant/redbelly-assets';
import BigNumber from 'bignumber.js';
import { encodeAddressArgument } from '@/utils/redbelly/abi';
import { portfolioUsd } from '@/utils/redbelly/portfolio';
import type { RedbellyTokenInfo } from '@/constant/redbelly-assets';
import { readRbntUsdPrice } from '@/utils/redbelly/price';
import { readStakingPosition } from '@/utils/redbelly/staking';
import type { StakingPosition } from '@/utils/redbelly/staking';

/**
 * Per-call ceiling, in milliseconds.
 *
 * NFR4 requires the address check to complete inside the normal confirmation
 * flow with no user-visible delay. Redbelly has a single public endpoint with
 * no failover, so a hung socket must degrade to an `UNKNOWN` verdict quickly
 * rather than stalling the signing screen indefinitely.
 */
const RPC_TIMEOUT = 8_000;

/**
 * How long a gas peg reading stays fresh, in milliseconds.
 *
 * The peg is a governance-set constant that has held at US$0.01 per base
 * transaction throughout the project; re-reading it on every keystroke of a
 * gas edit is pure latency. The recipient verdict is deliberately NOT cached -
 * an address can be registered between two confirmations, and a stale "not
 * registered" would block a legitimate send (US12).
 */
const GAS_PEG_TTL = 60_000;

type CachedPeg = { usdPerGas: number; readAt: number };

/** How long a price or token discovery result stays fresh, in milliseconds. */
const PRICE_TTL = 60_000;
const DISCOVERY_TTL = 5 * 60_000;

/** One line of on-chain activity, from the block explorer. */
export type RedbellyActivityItem = {
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  kind: 'native' | 'token';
  /** Raw amount, as a decimal string in the token's smallest unit. */
  value: string;
  symbol: string;
  decimals: number;
  failed: boolean;
  /** The called function's name, when the explorer knows it. */
  method: string;
};

/** A staking position as sent to the UI: amounts as decimal wei strings. */
export type RedbellyStakingSummary = {
  pool: StakingPosition['pool'];
  staked: string;
  rewards: string;
  withdrawable: string;
  locked: string;
  nextUnlock: { amount: string; timestamp: number } | null;
  aprPercent: number;
};

/** A description of an account on one Redbelly network, for the home page. */
export type RedbellyAccountSummary = {
  chainId: number;
  /** Balance in wei, or `null` if the node did not answer. */
  balanceWei: string | null;
  /** Whether the account is KYC registered, or `null` if unknown. */
  isRegistered: boolean | null;
  /**
   * True when the node could not be reached. Distinct from a zero balance,
   * which is the entire point of US8: a displayed zero must never be a failed
   * read.
   */
  unavailable: boolean;
};

class RedbellyService {
  private gasPegCache = new Map<number, CachedPeg>();

  private priceCache: { usd: number; readAt: number } | null = null;

  private discoveryCache = new Map<
    string,
    { tokens: RedbellyTokenInfo[]; readAt: number }
  >();

  /**
   * A JSON-RPC transport bound to one Redbelly network.
   *
   * The chain is taken from the caller, never from ambient wallet state. The
   * Snap stage observed the wallet's own provider reporting chain 1 while
   * confirming a transaction on Redbelly Testnet, which sent every call to a
   * chain where the registry does not exist.
   *
   * @param chainId - The numeric Redbelly chain ID.
   * @returns A request function bound to that chain's endpoint.
   */
  private transport = (chainId: number): EthereumRequest => {
    const url = redbellyRpcUrl(chainId);
    let nextId = 0;

    return async ({ method, params }) => {
      nextId += 1;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: nextId,
          method,
          params: params ?? [],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const payload = (await response.json()) as {
        result?: unknown;
        error?: { message?: string };
      };

      if (payload.error) {
        throw new Error(`RPC error: ${payload.error.message ?? 'unknown'}`);
      }

      return payload.result;
    };
  };

  /**
   * Chain facts about a recipient, or `null` if they could not be gathered.
   *
   * @param chainId - The numeric chain ID.
   * @param address - The recipient address.
   * @returns The facts, or `null` on any failure.
   */
  getAddressFacts = async (
    chainId: number,
    address: string
  ): Promise<AddressFacts | null> => {
    if (!isRedbellyChainId(chainId) || !address) {
      return null;
    }
    try {
      return await withTimeout(
        readAddressFacts(this.transport(chainId), chainId, address),
        RPC_TIMEOUT
      );
    } catch (error) {
      console.error('[redbelly] address facts failed', error);
      return null;
    }
  };

  /**
   * The verdict for a recipient address (FR1 / US1-US4).
   *
   * Never throws: a failed check is reported as `UNKNOWN`, which the UI states
   * explicitly rather than passing over in silence (NFR2).
   *
   * @param chainId - The numeric chain ID.
   * @param address - The recipient address.
   * @returns The verdict.
   */
  getVerdict = async (chainId: number, address: string): Promise<Verdict> => {
    return verdictFor(await this.getAddressFacts(chainId, address));
  };

  /**
   * Whether an account is on the permission list (FR5 / US9).
   *
   * @param chainId - The numeric chain ID.
   * @param address - The account to check.
   * @returns True, false, or `null` if the check did not complete.
   */
  getIsRegistered = async (
    chainId: number,
    address: string
  ): Promise<boolean | null> => {
    if (!isRedbellyChainId(chainId) || !address) {
      return null;
    }
    try {
      return await withTimeout(
        readIsAllowed(this.transport(chainId), chainId, address),
        RPC_TIMEOUT
      );
    } catch (error) {
      console.error('[redbelly] registration check failed', error);
      return null;
    }
  };

  /**
   * US dollars per unit of gas (FR3), cached briefly.
   *
   * @param chainId - The numeric chain ID.
   * @returns Dollars per gas unit, or `null` if the peg could not be read.
   */
  getUsdPerGas = async (chainId: number): Promise<number | null> => {
    if (!isRedbellyChainId(chainId)) {
      return null;
    }

    const cached = this.gasPegCache.get(chainId);
    if (cached && Date.now() - cached.readAt < GAS_PEG_TTL) {
      return cached.usdPerGas;
    }

    try {
      const usdPerGas = await withTimeout(
        readUsdPerGas(this.transport(chainId), chainId),
        RPC_TIMEOUT
      );
      this.gasPegCache.set(chainId, { usdPerGas, readAt: Date.now() });
      return usdPerGas;
    } catch (error) {
      // US7: no dollar figure at all beats a figure we cannot substantiate.
      console.error('[redbelly] gas peg read failed', error);
      return null;
    }
  };

  /**
   * The node's current gas price in wei, for the Send page's fee row (FR3).
   *
   * Redbelly is not a DeBank chain, so there is no DeBank gas market to ask.
   *
   * @param chainId - The numeric chain ID.
   * @returns The gas price as a decimal string, or `null` if unavailable.
   */
  getGasPrice = async (chainId: number): Promise<string | null> => {
    if (!isRedbellyChainId(chainId)) {
      return null;
    }
    try {
      const price = await withTimeout(
        readGasPrice(this.transport(chainId)),
        RPC_TIMEOUT
      );
      return price.toString();
    } catch (error) {
      console.error('[redbelly] gas price read failed', error);
      return null;
    }
  };

  /**
   * An account's RBNT balance in wei, read straight from a node (FR2 / US8).
   *
   * @param chainId - The numeric chain ID.
   * @param address - The account to read.
   * @returns The balance as a decimal string, or `null` if unavailable.
   */
  getBalance = async (
    chainId: number,
    address: string
  ): Promise<string | null> => {
    if (!isRedbellyChainId(chainId) || !address) {
      return null;
    }
    try {
      const balance = await withTimeout(
        readBalance(this.transport(chainId), address),
        RPC_TIMEOUT
      );
      return balance.toString();
    } catch (error) {
      console.error('[redbelly] balance read failed', error);
      return null;
    }
  };

  /**
   * Describe an account on both Redbelly networks (US8 / US9).
   *
   * One network being unreachable must not blank out the other, so each is
   * summarised independently.
   *
   * @param address - The account to describe.
   * @returns One summary per Redbelly network.
   */
  getAccountSummaries = async (
    address: string
  ): Promise<RedbellyAccountSummary[]> => {
    const chainIds = [REDBELLY_MAINNET_CHAIN_ID, REDBELLY_TESTNET_CHAIN_ID];

    return Promise.all(
      chainIds.map(async (chainId) => {
        const [balanceWei, isRegistered] = await Promise.all([
          this.getBalance(chainId, address),
          this.getIsRegistered(chainId, address),
        ]);

        return {
          chainId,
          balanceWei,
          isRegistered,
          // A null balance means the read failed. Reported as unavailable, not
          // as zero.
          unavailable: balanceWei === null,
        };
      })
    );
  };

  /**
   * US dollars per RBNT, from Redbelly's on-chain price feed (FR2).
   *
   * Always Mainnet's feed: Testnet RBNT is worthless, so the UI applies this
   * to Mainnet holdings only and to fees, never to Testnet balances.
   *
   * @returns The price, or `null` if it could not be read or is stale. A
   * missing price means no dollar figure, never $0 (US7).
   */
  getRbntUsdPrice = async (): Promise<number | null> => {
    if (this.priceCache && Date.now() - this.priceCache.readAt < PRICE_TTL) {
      return this.priceCache.usd;
    }
    try {
      const usd = await withTimeout(
        readRbntUsdPrice(
          this.transport(REDBELLY_MAINNET_CHAIN_ID),
          REDBELLY_MAINNET_CHAIN_ID
        ),
        RPC_TIMEOUT
      );
      this.priceCache = { usd, readAt: Date.now() };
      return usd;
    } catch (error) {
      console.error('[redbelly] price read failed', error);
      return null;
    }
  };

  /**
   * An account's positions in the RBNT staking pools (US13).
   *
   * @param address - The staker.
   * @returns Positions with a non-zero stake or reward, and whether any pool
   * could not be read. A pool that fails to answer is reported, never
   * silently dropped: a missing stake looks exactly like a lost one.
   */
  getStakingPositions = async (
    address: string
  ): Promise<{ positions: RedbellyStakingSummary[]; unavailable: boolean }> => {
    if (!address) {
      return { positions: [], unavailable: false };
    }
    const results = await Promise.all(
      REDBELLY_STAKING_POOLS.map((pool) =>
        withTimeout(
          readStakingPosition(this.transport(pool.chainId), pool, address),
          RPC_TIMEOUT
        ).catch((error) => {
          console.error('[redbelly] staking read failed', pool.address, error);
          return null;
        })
      )
    );
    const positions = results
      .filter((item): item is StakingPosition => !!item)
      .filter((item) => item.staked > 0n || item.rewards > 0n)
      .map((item) => ({
        pool: item.pool,
        staked: item.staked.toString(),
        rewards: item.rewards.toString(),
        withdrawable: item.withdrawable.toString(),
        locked: item.locked.toString(),
        nextUnlock: item.nextUnlock
          ? {
              amount: item.nextUnlock.amount.toString(),
              timestamp: item.nextUnlock.timestamp,
            }
          : null,
        aprPercent: item.aprPercent,
      }));
    return { positions, unavailable: results.some((item) => item === null) };
  };

  /**
   * ERC-20s an address holds, according to Redbelly's block explorer.
   *
   * Best effort: this is how tokens outside the default list (Buffy's DONO,
   * FeTi70 and WBIOME, say) appear without being added by hand. Any failure
   * returns an empty list and the default list still shows.
   *
   * @param chainId - The numeric chain id.
   * @param address - The holder.
   * @returns The tokens held.
   */
  discoverTokens = async (
    chainId: number,
    address: string
  ): Promise<RedbellyTokenInfo[]> => {
    const api = REDBELLY_EXPLORER_API[chainId];
    if (!api || !address) {
      return [];
    }
    const key = `${chainId}:${address.toLowerCase()}`;
    const cached = this.discoveryCache.get(key);
    if (cached && Date.now() - cached.readAt < DISCOVERY_TTL) {
      return cached.tokens;
    }
    try {
      const response = await withTimeout(
        fetch(`${api}/address/${address}/erc20-holdings?limit=100`),
        RPC_TIMEOUT
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        items?: {
          tokenAddress?: string;
          tokenSymbol?: string;
          tokenName?: string;
          tokenDecimals?: number;
        }[];
      };
      const tokens = (payload.items || [])
        .filter(
          (item) =>
            typeof item.tokenAddress === 'string' &&
            /^0x[0-9a-fA-F]{40}$/.test(item.tokenAddress) &&
            typeof item.tokenDecimals === 'number' &&
            item.tokenDecimals >= 0 &&
            item.tokenDecimals <= 36
        )
        .map((item) => ({
          address: item.tokenAddress!.toLowerCase(),
          symbol: (item.tokenSymbol || '???').slice(0, 24),
          name: (item.tokenName || '').slice(0, 64),
          decimals: item.tokenDecimals!,
        }));
      this.discoveryCache.set(key, { tokens, readAt: Date.now() });
      return tokens;
    } catch (error) {
      console.error('[redbelly] token discovery failed', error);
      return [];
    }
  };

  /**
   * An address's recent Mainnet activity, incoming included (FR2).
   *
   * Rabby's own history comes from DeBank, which shows nothing for Redbelly -
   * and for an address used elsewhere, other chains' activity (scam airdrops
   * included) in a wallet that cannot touch them. A node cannot list an
   * address's history, so this asks Redbelly's block explorer.
   *
   * @param address - The account.
   * @returns Up to 50 native and 50 token movements, newest first, or
   * `null` if the explorer could not be reached - shown as unavailable, not
   * as "no activity".
   */
  getActivity = async (
    address: string
  ): Promise<RedbellyActivityItem[] | null> => {
    const api = REDBELLY_EXPLORER_API[REDBELLY_MAINNET_CHAIN_ID];
    if (!api || !address) {
      return [];
    }
    const query = (action: string) =>
      withTimeout(
        fetch(
          `${api}/etherscan/api?module=account&action=${action}&address=${address}&page=1&offset=50&sort=desc`
        ).then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json() as Promise<{
            status?: string;
            message?: string;
            result?: Record<string, string>[] | string;
          }>;
        }),
        RPC_TIMEOUT
      );
    try {
      const [native, tokens] = await Promise.all([
        query('txlist'),
        query('tokentx'),
      ]);
      // "No transactions found" comes back as status 0 with an empty list.
      const rows = (payload: typeof native) =>
        Array.isArray(payload.result) ? payload.result : [];
      const tokenRows = rows(tokens).map(
        (row): RedbellyActivityItem => ({
          hash: row.hash,
          timestamp: Number(row.timeStamp),
          from: (row.from || '').toLowerCase(),
          to: (row.to || '').toLowerCase(),
          kind: 'token',
          value: row.value || '0',
          symbol: (row.tokenSymbol || '???').slice(0, 24),
          decimals: Number(row.tokenDecimal || 18),
          failed: false,
          method: '',
        })
      );
      const tokenHashes = new Set(tokenRows.map((row) => row.hash));
      const nativeRows = rows(native)
        // A token transfer also appears here as a zero-value call to the
        // token contract; the token row already says it better.
        .filter((row) => !(tokenHashes.has(row.hash) && row.value === '0'))
        .map(
          (row): RedbellyActivityItem => ({
            hash: row.hash,
            timestamp: Number(row.timeStamp),
            from: (row.from || '').toLowerCase(),
            to: (row.to || '').toLowerCase(),
            kind: 'native',
            value: row.value || '0',
            symbol: 'RBNT',
            decimals: 18,
            failed: row.isError === '1' || row.txreceipt_status === '0',
            method: (row.functionName || '').split('(')[0].slice(0, 40),
          })
        );
      return [...nativeRows, ...tokenRows].sort(
        (a, b) => b.timestamp - a.timestamp
      );
    } catch (error) {
      console.error('[redbelly] activity read failed', error);
      return null;
    }
  };

  /**
   * Balances of the priced Mainnet tokens (wrapped RBNT, dollar
   * stablecoins), in whole tokens.
   *
   * @param address - The holder.
   * @returns Totals per kind.
   * @throws If any balance cannot be read.
   */
  private getPricedTokenBalances = async (address: string) => {
    const request = this.transport(REDBELLY_MAINNET_CHAIN_ID);
    const tokens = (REDBELLY_DEFAULT_TOKENS[REDBELLY_MAINNET_CHAIN_ID] || [])
      .map((token) => ({ ...token, address: token.address.toLowerCase() }))
      .filter(
        (token) =>
          RBNT_PEGGED_TOKENS.has(token.address) ||
          USD_PEGGED_TOKENS.has(token.address)
      );
    const balances = await Promise.all(
      tokens.map(async (token) => {
        const raw = await request({
          method: 'eth_call',
          params: [
            {
              to: token.address,
              // balanceOf(address)
              data: `0x70a08231${encodeAddressArgument(address)}`,
            },
            'latest',
          ],
        });
        if (typeof raw !== 'string') {
          throw new Error(`Unexpected balanceOf result: ${String(raw)}`);
        }
        return {
          token,
          amount: new BigNumber(raw === '0x' ? 0 : raw).div(
            new BigNumber(10).pow(token.decimals)
          ),
        };
      })
    );
    const sum = (set: Set<string>) =>
      balances
        .filter((item) => set.has(item.token.address))
        .reduce((total, item) => total.plus(item.amount), new BigNumber(0));
    return {
      wrappedRbnt: sum(RBNT_PEGGED_TOKENS),
      stablecoins: sum(USD_PEGGED_TOKENS),
    };
  };

  /**
   * An account's Mainnet holdings in US dollars, in the shape Rabby's
   * balance cache expects (FR2).
   *
   * Used in place of DeBank's total for every account-level balance - the
   * account switcher, the address list - so they show what the account
   * holds on Redbelly rather than a total from chains this wallet cannot
   * use.
   *
   * @param address - The account.
   * @returns The total, with no per-chain breakdown.
   * @throws If any part cannot be read. A partial total would understate
   * the account, so the caller keeps its last good value instead.
   */
  getTotalBalance = async (
    address: string
  ): Promise<{ total_usd_value: number; chain_list: [] }> => {
    const [balanceWei, rbntUsd, staking, tokens] = await Promise.all([
      this.getBalance(REDBELLY_MAINNET_CHAIN_ID, address),
      this.getRbntUsdPrice(),
      this.getStakingPositions(address),
      withTimeout(this.getPricedTokenBalances(address), RPC_TIMEOUT),
    ]);
    if (balanceWei === null || rbntUsd === null || staking.unavailable) {
      throw new Error('Redbelly balance unavailable');
    }
    const staked = staking.positions.reduce(
      (total, item) =>
        total.plus(new BigNumber(item.staked).plus(item.rewards).div(1e18)),
      new BigNumber(0)
    );
    const total = portfolioUsd({
      rbnt: new BigNumber(balanceWei).div(1e18),
      staked,
      wrappedRbnt: tokens.wrappedRbnt,
      stablecoins: tokens.stablecoins,
      rbntUsd,
    });
    return { total_usd_value: total.toNumber(), chain_list: [] };
  };

  /** Drop every cache. Used when the Redbelly RPC endpoint changes. */
  clearCaches = () => {
    this.priceCache = null;
    this.discoveryCache.clear();
    this.gasPegCache.clear();
    clearRedbellyContractCache();
  };
}

export const redbellyService = new RedbellyService();
export default redbellyService;
