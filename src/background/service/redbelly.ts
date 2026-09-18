/**
 * Redbelly background service.
 *
 * Owns every Redbelly-specific chain read the wallet makes: the KYC permission
 * check (FR1/FR5), the RBNT balance (FR2) and the USD gas peg (FR3). It talks
 * to Redbelly's public RPC endpoints directly (NFR3) rather than through
 * DeBank, which does not index Redbelly.
 *
 * Read-only by construction. This service issues `eth_call`, `eth_getCode` and
 * `eth_getBalance` and nothing else; it never signs, never submits, and holds
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
  readIsAllowed,
  readUsdPerGas,
} from '@/utils/redbelly/reader';
import type { EthereumRequest } from '@/utils/redbelly/reader';
import { verdictFor } from '@/utils/redbelly/verdict';
import type { AddressFacts, Verdict } from '@/utils/redbelly/verdict';
import { withTimeout } from 'background/utils';

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

  /** Drop every cache. Used when the Redbelly RPC endpoint changes. */
  clearCaches = () => {
    this.gasPegCache.clear();
    clearRedbellyContractCache();
  };
}

export const redbellyService = new RedbellyService();
export default redbellyService;
