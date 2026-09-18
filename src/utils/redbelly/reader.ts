/**
 * Reads Redbelly's on-chain permission registry and gas peg.
 *
 * Ported from the Snap. Every function takes an injected `request` function
 * rather than reaching for a global provider, for two reasons:
 *
 * 1. Testability. The whole read path can be exercised with a plain fake -
 *    no wallet, no network (NFR5).
 * 2. Correctness. During the Snap stage the wallet's own provider was
 *    observed answering `eth_chainId` with `0x1` while confirming a
 *    transaction on Redbelly Testnet, so every call landed on Ethereum
 *    Mainnet where the registry does not exist. The chain a call belongs to
 *    must be decided by the caller, never inferred from ambient state.
 *
 * All calls here are read-only: `eth_call`, `eth_getCode`, `eth_getBalance`.
 * Nothing in this module signs or submits anything.
 */

import {
  BASE_TRANSACTION_GAS,
  CONTRACTS_REGISTRY,
  GAS_FEE_KEY,
  PERMISSION_KEY,
  SELECTOR_GET_BASE_GAS_FEE,
  SELECTOR_GET_CONTRACT_ADDRESS,
  SELECTOR_IS_ALLOWED,
} from '@/constant/redbelly';
import {
  decodeAddress,
  decodeBaseGasFee,
  decodeBoolean,
  encodeAddressArgument,
  encodeStringArgument,
} from './abi';
import type { AddressFacts } from './verdict';

/**
 * The subset of an EIP-1193 provider this module needs. Narrowing it to a
 * function type keeps the module testable with a plain fake.
 */
export type EthereumRequest = (args: {
  method: string;
  params?: unknown[];
}) => Promise<unknown>;

/**
 * Resolved contract addresses, keyed by chain ID and registry key.
 *
 * The registry lookup costs one extra `eth_call`, so we pay it once per
 * network per session rather than on every transaction (NFR4). The contracts
 * sit behind a mutable registry and may be redeployed, which is why they are
 * resolved at runtime at all rather than hardcoded.
 */
const resolvedContracts = new Map<string, string>();

/**
 * Perform an `eth_call` and return the raw hex result.
 *
 * @param request - The provider request function.
 * @param to - Contract to call.
 * @param data - Encoded calldata.
 * @returns The raw hex result.
 */
async function ethCall(
  request: EthereumRequest,
  to: string,
  data: string
): Promise<string> {
  const result = await request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });

  if (typeof result !== 'string') {
    throw new Error(`Unexpected eth_call result: ${String(result)}`);
  }

  return result;
}

/**
 * Resolve a contract address from the bootstrap registry, caching the result.
 *
 * @param request - The provider request function.
 * @param chainId - The numeric chain ID, used as part of the cache key.
 * @param registryKey - The registry key, e.g. `permission` or `gasfees`.
 * @returns The resolved contract address.
 */
export async function resolveContract(
  request: EthereumRequest,
  chainId: number,
  registryKey: string
): Promise<string> {
  const cacheKey = `${chainId}:${registryKey}`;
  const cached = resolvedContracts.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await ethCall(
    request,
    CONTRACTS_REGISTRY,
    SELECTOR_GET_CONTRACT_ADDRESS + encodeStringArgument(registryKey)
  );
  const address = decodeAddress(result);
  resolvedContracts.set(cacheKey, address);
  return address;
}

/**
 * Resolve the permission contract for a chain.
 *
 * @param request - The provider request function.
 * @param chainId - The numeric chain ID.
 * @returns The permission contract address.
 */
export async function resolvePermissionContract(
  request: EthereumRequest,
  chainId: number
): Promise<string> {
  return resolveContract(request, chainId, PERMISSION_KEY);
}

/**
 * Read the chain facts needed to judge an address.
 *
 * Throws if either call fails; the caller turns that into an `UNKNOWN`
 * verdict rather than guessing.
 *
 * @param request - The provider request function.
 * @param chainId - The numeric chain ID.
 * @param address - The address to look up.
 * @returns The facts about that address.
 */
export async function readAddressFacts(
  request: EthereumRequest,
  chainId: number,
  address: string
): Promise<AddressFacts> {
  const permission = await resolvePermissionContract(request, chainId);

  const [code, allowed] = await Promise.all([
    request({ method: 'eth_getCode', params: [address, 'latest'] }),
    ethCall(
      request,
      permission,
      SELECTOR_IS_ALLOWED + encodeAddressArgument(address)
    ),
  ]);

  if (typeof code !== 'string') {
    throw new Error(`Unexpected eth_getCode result: ${String(code)}`);
  }

  return {
    hasCode: code !== '0x' && code !== '0x0' && code !== '',
    isAllowed: decodeBoolean(allowed),
  };
}

/**
 * Whether an account is on the Redbelly permission list (FR5 / US9).
 *
 * Unlike `readAddressFacts` this ignores bytecode: it answers "is this account
 * KYC registered", which is the question asked about the user's *own*
 * account, where an unregistered sender is rejected by the node with error
 * -32603.
 *
 * @param request - The provider request function.
 * @param chainId - The numeric chain ID.
 * @param address - The account to check.
 * @returns True if the account is on the permission list.
 */
export async function readIsAllowed(
  request: EthereumRequest,
  chainId: number,
  address: string
): Promise<boolean> {
  const permission = await resolvePermissionContract(request, chainId);
  const allowed = await ethCall(
    request,
    permission,
    SELECTOR_IS_ALLOWED + encodeAddressArgument(address)
  );
  return decodeBoolean(allowed);
}

/**
 * Read an account's RBNT balance, in wei (FR2 / US8).
 *
 * Read straight from a Redbelly node rather than from any wallet cache. The
 * Snap stage established that a cached zero cannot be distinguished from a
 * failed refresh, which is the whole point of this call.
 *
 * @param request - The provider request function.
 * @param address - The account to read.
 * @returns The balance in wei.
 */
export async function readBalance(
  request: EthereumRequest,
  address: string
): Promise<bigint> {
  const result = await request({
    method: 'eth_getBalance',
    params: [address, 'latest'],
  });

  if (typeof result !== 'string') {
    throw new Error(`Unexpected eth_getBalance result: ${String(result)}`);
  }

  return BigInt(result);
}

/**
 * Read Redbelly's gas price, in US dollars per unit of gas (FR3).
 *
 * Redbelly pegs its gas price to USD and converts to RBNT at an oracle rate,
 * which is why RBNT fees look enormous next to Ethereum's. The peg lives in
 * the on-chain `gasfees` contract, which reports the price of one base
 * transaction - currently US$0.01 for 21,000 gas.
 *
 * @param request - The provider request function.
 * @param chainId - The numeric chain ID.
 * @returns Dollars per unit of gas.
 * @throws If the contract cannot be read or reports a non-USD currency.
 */
export async function readUsdPerGas(
  request: EthereumRequest,
  chainId: number
): Promise<number> {
  const contract = await resolveContract(request, chainId, GAS_FEE_KEY);

  const { value, currency, decimals } = decodeBaseGasFee(
    await ethCall(request, contract, SELECTOR_GET_BASE_GAS_FEE)
  );

  // Guard the unit rather than assume it. If Redbelly ever reports a different
  // currency, silently treating it as dollars would be worse than no figure
  // (US7).
  if (currency !== 'USD') {
    throw new Error(`Unexpected gas fee currency: ${currency}`);
  }

  return Number(value) / 10 ** decimals / BASE_TRANSACTION_GAS;
}

/**
 * Clear the resolved-contract cache. Test seam, and used when a user changes
 * the Redbelly RPC endpoint.
 */
export function clearRedbellyContractCache(): void {
  resolvedContracts.clear();
}
