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
 * Hide the account types not yet tested on Redbelly: hardware wallets,
 * WalletConnect/mobile wallets and institutional wallets (Safe, Cobo Argus).
 * Safe is not deployed on Redbelly, and a hardware or mobile wallet that
 * fails mid-signature is worse than one that is not offered. Seed phrase,
 * private key and watch-only addresses stay. Re-enable a type once a
 * transaction has been signed and broadcast with it.
 */
export const REDBELLY_HIDE_UNTESTED_ACCOUNTS = REDBELLY_ONLY;

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

/**
 * The permission contract's self-registration call: the "enable wallet" step
 * at access.redbelly.network, which submits the account's KYC credential.
 * It is the account's first transaction, and the network accepts it from an
 * unregistered account. Observed on Mainnet (2026-10-15), not documented.
 */
export const SELECTOR_REGISTER = '0x33f6cfb2';

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
/**
 * Whether a chain's RPC endpoint is pinned to the canonical one: the
 * built-in Redbelly networks in the Redbelly-only build. The KYC check reads
 * `REDBELLY_RPC_ENDPOINTS` directly, so a custom RPC would let broadcasting
 * and the check talk to different nodes - and a dishonest node could answer
 * the check falsely. Pinning keeps both on the same endpoint.
 *
 * @param chainEnum - A `CHAINS_ENUM` value (string).
 * @returns True if custom RPCs are ignored for it.
 */
export function isPinnedRedbellyRpc(chainEnum: string): boolean {
  return (
    REDBELLY_ONLY &&
    (chainEnum === REDBELLY_MAINNET_ENUM || chainEnum === REDBELLY_TESTNET_ENUM)
  );
}

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

/** What this wallet calls itself in window titles and approval screens. */
export const WALLET_NAME = 'Redbelly Wallet';

/**
 * Gas limit multiplier: the factor applied to the node's gas estimate to get
 * the gas limit a transaction is signed with. Redbelly's gas is cheap and an
 * unused limit is refunded, but the wallet checks `limit * price + value`
 * against the balance up front, so a large factor blocks an account that holds
 * only a little more than the real fee. It therefore starts at 1.1x, enough to
 * absorb small differences between estimate and execution, and can be changed
 * in Settings (1x to 3x) for contract calls whose gas varies more.
 */
export const DEFAULT_GAS_LIMIT_MULTIPLIER = 1.1;
export const MIN_GAS_LIMIT_MULTIPLIER = 1;
export const MAX_GAS_LIMIT_MULTIPLIER = 3;
export const GAS_LIMIT_MULTIPLIER_PRESETS = [1, 1.1, 1.25, 1.5];

/**
 * Clamp a stored or typed multiplier to the allowed range, to two decimals.
 * Anything that is not a finite number falls back to the default.
 *
 * @param value - The raw value.
 * @returns A multiplier within `[MIN, MAX]`.
 */
export function normalizeGasLimitMultiplier(value: unknown): number {
  const number = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return DEFAULT_GAS_LIMIT_MULTIPLIER;
  }
  const clamped = Math.min(
    MAX_GAS_LIMIT_MULTIPLIER,
    Math.max(MIN_GAS_LIMIT_MULTIPLIER, number)
  );
  return Math.round(clamped * 100) / 100;
}
