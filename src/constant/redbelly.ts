/**
 * Redbelly Network constants.
 *
 * Ported from the `redbelly-address-check` Snap (`packages/snap/src/redbelly.ts`).
 * The registry address and the four selectors below are not documented by
 * Redbelly: they were recovered from the `access.redbelly.network` bundles and
 * verified against both live networks during the Snap stage of this project.
 * Treat the semantics as empirical.
 */

/** Chain IDs of the two Redbelly networks. */
export const REDBELLY_MAINNET_CHAIN_ID = 151;
export const REDBELLY_TESTNET_CHAIN_ID = 153;

/**
 * `serverId` values. Redbelly is registered as a built-in custom network (see
 * `redbelly-chains.ts`), and Rabby derives a custom network's ids from its
 * chain id, so these must match `createTestnetChain` exactly.
 */
export const REDBELLY_MAINNET_SERVER_ID = `custom_${REDBELLY_MAINNET_CHAIN_ID}`;
export const REDBELLY_TESTNET_SERVER_ID = `custom_${REDBELLY_TESTNET_CHAIN_ID}`;

/** `CHAINS_ENUM` keys, derived the same way. */
export const REDBELLY_MAINNET_ENUM = `CUSTOM_${REDBELLY_MAINNET_CHAIN_ID}`;
export const REDBELLY_TESTNET_ENUM = `CUSTOM_${REDBELLY_TESTNET_CHAIN_ID}`;

/**
 * The wallet only talks to Redbelly (FR4). Every other chain is kept in the
 * internal chain store, because large parts of Rabby look Ethereum up by
 * enum, but is hidden from every chain picker and refused at the dApp
 * provider. Flip this to re-enable the rest of Rabby's networks.
 */
export const REDBELLY_ONLY = true;

/**
 * Public RPC endpoints, by chain ID.
 *
 * NFR3: these are open endpoints - no API key, no IP whitelisting.
 */
export const REDBELLY_RPC_ENDPOINTS: Record<number, string> = {
  [REDBELLY_MAINNET_CHAIN_ID]: 'https://governors.mainnet.redbelly.network',
  [REDBELLY_TESTNET_CHAIN_ID]: 'https://governors.testnet.redbelly.network',
};

/** Display names, by chain ID. */
export const REDBELLY_NETWORK_NAMES: Record<number, string> = {
  [REDBELLY_MAINNET_CHAIN_ID]: 'Redbelly Mainnet',
  [REDBELLY_TESTNET_CHAIN_ID]: 'Redbelly Testnet',
};

/**
 * Block explorer bases, by chain ID. Routescan is Redbelly's explorer; Reddex
 * links its pool contracts to the mainnet host.
 */
export const REDBELLY_EXPLORER_HOSTS: Record<number, string> = {
  [REDBELLY_MAINNET_CHAIN_ID]: 'https://redbelly.routescan.io',
  [REDBELLY_TESTNET_CHAIN_ID]: 'https://redbelly.testnet.routescan.io',
};

/**
 * Bootstrap ContractsRegistry. The same address on both networks, and the only
 * address worth hardcoding: everything else is resolved through it, because
 * the contracts behind it may be redeployed.
 */
export const CONTRACTS_REGISTRY = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5';

/** `getContractAddress(string)` on the registry. */
export const SELECTOR_GET_CONTRACT_ADDRESS = '0x04433bbc';

/** `isAllowed(address)` on the permission contract. */
export const SELECTOR_IS_ALLOWED = '0xbabcc539';

/** `getBaseGasFee()` on the gasfees contract. */
export const SELECTOR_GET_BASE_GAS_FEE = '0x96ec79c1';

/** Registry key for the permission contract. */
export const PERMISSION_KEY = 'permission';

/** Registry key for the gas fee contract. */
export const GAS_FEE_KEY = 'gasfees';

/** Registry key for the RBNT/USD price feed. */
export const PRICE_FEED_KEY = 'pricefeed';

/** `decimals()` on the price feed. */
export const SELECTOR_DECIMALS = '0x313ce567';

/**
 * `getLatestPrice()` on the price feed: `(int256 price, uint256 updatedAt,
 * bool)`. Recovered from the access dApp, which reads it the same way to
 * value RBNT; the third field is not used there either.
 */
export const SELECTOR_GET_LATEST_PRICE = '0x8e15f473';

/**
 * How old a price may be before we stop showing dollar values. The feed is
 * updated every few minutes; a day-old price is a broken oracle, and no
 * dollar figure beats a wrong one (US7).
 */
export const PRICE_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Gas units in a base transaction. Redbelly quotes its gas fee as the price of
 * one such transaction, so this is the divisor that turns it into a per-gas
 * figure. The Redbelly access dApp uses the same constant.
 */
export const BASE_TRANSACTION_GAS = 21000;

/** RBNT has 18 decimals, like ether. */
export const RBNT_DECIMALS = 18;

/** Native token symbol on both networks. */
export const RBNT_SYMBOL = 'RBNT';

/**
 * Whether a numeric chain ID is one of the Redbelly networks.
 *
 * FR4: every Redbelly-specific behaviour in this wallet is gated on this.
 *
 * @param chainId - A numeric EVM chain ID.
 * @returns True for Redbelly Mainnet and Testnet only.
 */
export function isRedbellyChainId(
  chainId: number | string | undefined | null
): boolean {
  if (chainId === undefined || chainId === null || chainId === '') {
    return false;
  }
  const id = Number(chainId);
  return id === REDBELLY_MAINNET_CHAIN_ID || id === REDBELLY_TESTNET_CHAIN_ID;
}

/**
 * Whether a chain `serverId` belongs to a Redbelly network.
 *
 * Rabby threads `serverId` rather than the numeric id through most of its
 * signing and gas code, so both predicates are needed.
 *
 * @param serverId - A chain server id.
 * @returns True for Redbelly Mainnet and Testnet only.
 */
export function isRedbellyServerId(
  serverId: string | undefined | null
): boolean {
  return (
    serverId === REDBELLY_MAINNET_SERVER_ID ||
    serverId === REDBELLY_TESTNET_SERVER_ID
  );
}

/**
 * The Redbelly RPC endpoint for a chain.
 *
 * @param chainId - A numeric Redbelly chain ID.
 * @returns The endpoint URL.
 * @throws If the chain is not a Redbelly network.
 */
export function redbellyRpcUrl(chainId: number): string {
  const url = REDBELLY_RPC_ENDPOINTS[Number(chainId)];
  if (!url) {
    throw new Error(`No Redbelly RPC endpoint for chain ${chainId}`);
  }
  return url;
}

/**
 * Human-readable name for a Redbelly chain ID.
 *
 * @param chainId - A numeric chain ID.
 * @returns The network name, or the raw chain ID if unrecognised.
 */
export function redbellyNetworkName(chainId: number): string {
  return REDBELLY_NETWORK_NAMES[Number(chainId)] ?? String(chainId);
}

/**
 * The Redbelly RPC endpoint for a chain `serverId`.
 *
 * The wallet's generic RPC layer keys on `serverId` and takes its hosts from a
 * list DeBank syncs, which has no Redbelly entry. This lets that layer reach
 * Redbelly's own public endpoint instead of falling back to DeBank.
 *
 * @param serverId - A chain server id.
 * @returns The endpoint URL, or `undefined` for any non-Redbelly chain.
 */
export function redbellyRpcUrlForServerId(
  serverId: string | undefined | null
): string | undefined {
  if (serverId === REDBELLY_MAINNET_SERVER_ID) {
    return REDBELLY_RPC_ENDPOINTS[REDBELLY_MAINNET_CHAIN_ID];
  }
  if (serverId === REDBELLY_TESTNET_SERVER_ID) {
    return REDBELLY_RPC_ENDPOINTS[REDBELLY_TESTNET_CHAIN_ID];
  }
  return undefined;
}
