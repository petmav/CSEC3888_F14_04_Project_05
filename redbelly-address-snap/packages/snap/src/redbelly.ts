/**
 * Reads Redbelly's on-chain permission registry through the wallet's own
 * Ethereum provider.
 *
 * The selectors and the registry address below were recovered from the
 * `access.redbelly.network` bundles and verified against both live networks;
 * see `FINDINGS.md` section 1.4. None of this is documented by Redbelly, so
 * treat the semantics as empirical.
 */

import type { AddressFacts } from './verdict';

/**
 * The subset of the EIP-1193 provider this module needs. Narrowing it to a
 * function type keeps the module testable with a plain fake - no wallet, no
 * network.
 */
export type EthereumRequest = (args: {
  method: string;
  params?: unknown[];
}) => Promise<unknown>;

/** CAIP-2 chain IDs of the Redbelly networks, with display names. */
const REDBELLY_NETWORKS: Record<string, string> = {
  'eip155:151': 'Redbelly Mainnet',
  'eip155:153': 'Redbelly Testnet',
};

/**
 * Public RPC endpoints, by chain.
 *
 * We reach these directly rather than through the wallet's `ethereum` global.
 * That global is not guaranteed to be connected to the chain the transaction
 * targets: while confirming a transaction on Redbelly Testnet it was observed
 * answering `eth_chainId` with `0x1`, so every call landed on Ethereum
 * Mainnet, where the registry does not exist. The `chainId` passed to
 * `onTransaction` is the only authoritative source for the target chain.
 */
const RPC_ENDPOINTS: Record<string, string> = {
  'eip155:151': 'https://governors.mainnet.redbelly.network',
  'eip155:153': 'https://governors.testnet.redbelly.network',
};

/**
 * The Redbelly RPC endpoint for a chain.
 *
 * @param chainId - A CAIP-2 chain ID.
 * @returns The endpoint URL.
 * @throws If the chain is not a Redbelly network.
 */
export function rpcUrlFor(chainId: string): string {
  const url = RPC_ENDPOINTS[chainId];
  if (!url) {
    throw new Error(`No Redbelly RPC endpoint for ${chainId}`);
  }
  return url;
}

/**
 * Build a transport that speaks JSON-RPC to a Redbelly node over HTTP.
 *
 * Requires `endowment:network-access`.
 *
 * @param chainId - The CAIP-2 chain ID of the transaction being checked.
 * @returns A request function bound to that chain's endpoint.
 */
export function fetchTransport(chainId: string): EthereumRequest {
  const url = rpcUrlFor(chainId);
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
}

/**
 * Bootstrap ContractsRegistry. The same address on both networks, and the only
 * address worth hardcoding: everything else is resolved through it, because
 * the contracts behind it may be redeployed.
 */
const CONTRACTS_REGISTRY = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5';

/** `getContractAddress(string)` */
const SELECTOR_GET_CONTRACT_ADDRESS = '0x04433bbc';

/** `isAllowed(address)` */
const SELECTOR_IS_ALLOWED = '0xbabcc539';

/** Registry key for the permission contract. */
const PERMISSION_KEY = 'permission';

/**
 * Resolved permission contracts, keyed by chain ID. The registry lookup costs
 * one extra `eth_call`, so we pay it once per network per session rather than
 * on every transaction.
 */
const permissionContracts = new Map<string, string>();

/**
 * Whether this Snap should say anything about a given chain.
 *
 * @param chainId - A CAIP-2 chain ID, e.g. `eip155:151`.
 * @returns True for the Redbelly networks only.
 */
export function isRedbellyChain(chainId: string): boolean {
  return chainId in REDBELLY_NETWORKS;
}

/**
 * Human-readable name for a Redbelly chain ID.
 *
 * @param chainId - A CAIP-2 chain ID.
 * @returns The network name, or the raw chain ID if unrecognised.
 */
export function networkName(chainId: string): string {
  return REDBELLY_NETWORKS[chainId] ?? chainId;
}

/**
 * Encode a 32-byte ABI word from a number.
 *
 * @param value - The value to encode.
 * @returns 64 hex characters, no `0x` prefix.
 */
function toWord(value: number): string {
  return value.toString(16).padStart(64, '0');
}

/**
 * ABI-encode a single dynamic string argument (offset, length, padded data).
 *
 * Only ASCII keys are used here, so one character is one byte.
 *
 * @param value - The string to encode.
 * @returns Hex encoding of the argument, no `0x` prefix.
 */
function encodeStringArgument(value: string): string {
  const data = [...value]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, '0');
  return toWord(32) + toWord(value.length) + padded;
}

/**
 * ABI-encode a single address argument.
 *
 * @param address - A hex address.
 * @returns 64 hex characters, no `0x` prefix.
 */
function encodeAddressArgument(address: string): string {
  return address.toLowerCase().replace(/^0x/u, '').padStart(64, '0');
}

/**
 * Decode an address from a 32-byte ABI word.
 *
 * @param word - The returned data.
 * @returns A lowercase hex address.
 */
function decodeAddress(word: string): string {
  const digits = word.replace(/^0x/u, '');
  if (digits.length < 40) {
    throw new Error(`Expected an address, got "${word}"`);
  }
  return `0x${digits.slice(-40)}`;
}

/**
 * Decode a boolean from a 32-byte ABI word.
 *
 * Any non-zero hex digit means true. Checking the digits directly avoids
 * `BigInt('0x')` throwing on an empty response.
 *
 * @param word - The returned data.
 * @returns The decoded boolean.
 */
function decodeBoolean(word: string): boolean {
  const digits = word.replace(/^0x/u, '');
  return /[1-9a-f]/iu.test(digits);
}

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
  data: string,
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
 * Resolve the permission contract for a chain, caching the result.
 *
 * Resolved at runtime rather than hardcoded because the contract sits behind a
 * mutable registry and may be redeployed.
 *
 * @param request - The provider request function.
 * @param chainId - The CAIP-2 chain ID, used as the cache key.
 * @returns The permission contract address.
 */
export async function resolvePermissionContract(
  request: EthereumRequest,
  chainId: string,
): Promise<string> {
  const cached = permissionContracts.get(chainId);
  if (cached) {
    return cached;
  }

  const result = await ethCall(
    request,
    CONTRACTS_REGISTRY,
    SELECTOR_GET_CONTRACT_ADDRESS + encodeStringArgument(PERMISSION_KEY),
  );
  const address = decodeAddress(result);
  permissionContracts.set(chainId, address);
  return address;
}

/**
 * Read the chain facts needed to judge a recipient address.
 *
 * Throws if either call fails; the caller turns that into an `UNKNOWN`
 * verdict rather than guessing.
 *
 * @param request - The provider request function.
 * @param chainId - The CAIP-2 chain ID.
 * @param address - The recipient address to look up.
 * @returns The facts about that address.
 */
export async function readAddressFacts(
  request: EthereumRequest,
  chainId: string,
  address: string,
): Promise<AddressFacts> {
  const permission = await resolvePermissionContract(request, chainId);

  const [code, allowed] = await Promise.all([
    request({ method: 'eth_getCode', params: [address, 'latest'] }),
    ethCall(
      request,
      permission,
      SELECTOR_IS_ALLOWED + encodeAddressArgument(address),
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
 * Read an account's RBNT balance, in wei.
 *
 * Fetched straight from a Redbelly node rather than from MetaMask's cached
 * state. MetaMask seeds every new account/chain entry with a literal `0x0` and
 * silently swallows balance-fetch failures, so a displayed zero cannot be
 * distinguished from a failed refresh (`FINDINGS.md` section 2.1). This gives
 * the user an independent second opinion.
 *
 * @param request - The provider request function.
 * @param address - The account to read.
 * @returns The balance in wei.
 */
export async function readBalance(
  request: EthereumRequest,
  address: string,
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

/** The Redbelly chains this Snap knows about, for iteration. */
export const REDBELLY_CHAIN_IDS = Object.keys(REDBELLY_NETWORKS);

/** `getBaseGasFee()` on the gasfees contract. */
const SELECTOR_GET_BASE_GAS_FEE = '0x96ec79c1';

/** Registry key for the gas fee contract. */
const GAS_FEE_KEY = 'gasfees';

/**
 * Gas units in a base transaction. Redbelly quotes its gas fee as the price of
 * one such transaction, so this is the divisor that turns it into a per-gas
 * figure. The Redbelly access dApp uses the same constant.
 */
const BASE_TRANSACTION_GAS = 21000;

/** Resolved gas fee contracts, keyed by chain. */
const gasFeeContracts = new Map<string, string>();

/**
 * Decode the `(uint256, string, uint8)` returned by `getBaseGasFee`.
 *
 * @param data - The raw eth_call result.
 * @returns The fee value, its currency, and its decimal places.
 */
function decodeBaseGasFee(data: string): {
  value: bigint;
  currency: string;
  decimals: number;
} {
  const words = data.replace(/^0x/u, '');
  if (words.length < 192) {
    throw new Error(`Unexpected getBaseGasFee result: ${data}`);
  }

  const value = BigInt(`0x${words.slice(0, 64)}`);
  const stringOffset = Number(BigInt(`0x${words.slice(64, 128)}`)) * 2;
  const decimals = Number(BigInt(`0x${words.slice(128, 192)}`));

  const length = Number(
    BigInt(`0x${words.slice(stringOffset, stringOffset + 64)}`),
  );
  const bytes = words.slice(stringOffset + 64, stringOffset + 64 + length * 2);
  const currency = (bytes.match(/../gu) ?? [])
    .map((pair) => String.fromCharCode(parseInt(pair, 16)))
    .join('');

  return { value, currency, decimals };
}

/**
 * Read Redbelly's gas price, in US dollars per unit of gas.
 *
 * Redbelly pegs its gas price to USD and converts to RBNT at an oracle rate,
 * which is why RBNT fees look enormous next to Ethereum's. The peg lives in
 * the on-chain `gasfees` contract, which reports the price of one base
 * transaction - currently US$0.01 for 21,000 gas.
 *
 * The contract is undocumented; the `getBaseGasFee()` signature was recovered
 * from the access dApp's bundles and verified live against both networks.
 *
 * @param request - The provider request function.
 * @param chainId - The CAIP-2 chain ID.
 * @returns Dollars per unit of gas.
 * @throws If the contract cannot be read or reports a non-USD currency.
 */
export async function readUsdPerGas(
  request: EthereumRequest,
  chainId: string,
): Promise<number> {
  let contract = gasFeeContracts.get(chainId);
  if (!contract) {
    const resolved = await ethCall(
      request,
      CONTRACTS_REGISTRY,
      SELECTOR_GET_CONTRACT_ADDRESS + encodeStringArgument(GAS_FEE_KEY),
    );
    contract = decodeAddress(resolved);
    gasFeeContracts.set(chainId, contract);
  }

  const { value, currency, decimals } = decodeBaseGasFee(
    await ethCall(request, contract, SELECTOR_GET_BASE_GAS_FEE),
  );

  // Guard the unit rather than assume it. If Redbelly ever reports a different
  // currency, silently treating it as dollars would be worse than no figure.
  if (currency !== 'USD') {
    throw new Error(`Unexpected gas fee currency: ${currency}`);
  }

  return Number(value) / 10 ** decimals / BASE_TRANSACTION_GAS;
}

/**
 * Clear the resolved-contract caches. Test seam only.
 */
export function clearPermissionCache(): void {
  permissionContracts.clear();
  gasFeeContracts.clear();
}
