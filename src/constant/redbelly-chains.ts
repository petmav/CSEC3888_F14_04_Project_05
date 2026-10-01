/**
 * Redbelly as Rabby's built-in networks (FR6 / US10).
 *
 * Rabby has two kinds of chain. "Integrated" chains are DeBank's: balances,
 * token lists, gas tiers, transaction parsing and simulation all come from
 * DeBank's servers. Custom networks are RPC-only: the wallet talks to the
 * node and nothing else. DeBank does not index Redbelly, so on the integrated
 * path the signing screen cannot even load - it dies with "No gas level
 * available" before showing the transaction. Redbelly therefore lives on the
 * custom-network path, which is also the only path that keeps a user's
 * transactions off a third-party server.
 *
 * The custom-network service treats these two as built in: they are present
 * from first run, cannot be removed, and carry Redbelly's branding rather
 * than the generic letter logo. Rabby derives everything else (enum, serverId,
 * native token id) from the chain id - see `createTestnetChain`.
 */

import {
  REDBELLY_EXPLORER_HOSTS,
  REDBELLY_MAINNET_CHAIN_ID,
  REDBELLY_NETWORK_NAMES,
  REDBELLY_RPC_ENDPOINTS,
  REDBELLY_TESTNET_CHAIN_ID,
  RBNT_SYMBOL,
} from './redbelly';

export type RedbellyNetwork = {
  id: number;
  name: string;
  nativeTokenSymbol: string;
  rpcUrl: string;
  scanLink: string;
  logo: string;
};

const network = (id: number, logo: string): RedbellyNetwork => ({
  id,
  name: REDBELLY_NETWORK_NAMES[id],
  nativeTokenSymbol: RBNT_SYMBOL,
  rpcUrl: REDBELLY_RPC_ENDPOINTS[id],
  scanLink: `${REDBELLY_EXPLORER_HOSTS[id]}/tx/_s_`,
  logo,
});

export const REDBELLY_MAINNET = network(
  REDBELLY_MAINNET_CHAIN_ID,
  '/images/redbelly-chain-mainnet.png'
);

export const REDBELLY_TESTNET = network(
  REDBELLY_TESTNET_CHAIN_ID,
  '/images/redbelly-chain-testnet.png'
);

/** Both Redbelly networks, Mainnet first. */
export const REDBELLY_NETWORKS: RedbellyNetwork[] = [
  REDBELLY_MAINNET,
  REDBELLY_TESTNET,
];

/**
 * The built-in network for a chain id, if it is one.
 *
 * @param chainId - A numeric chain id.
 * @returns The Redbelly network, or undefined.
 */
export function builtinRedbellyNetwork(
  chainId: number | string
): RedbellyNetwork | undefined {
  return REDBELLY_NETWORKS.find((item) => item.id === Number(chainId));
}
