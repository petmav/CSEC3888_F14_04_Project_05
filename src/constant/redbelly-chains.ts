/**
 * Redbelly as a first-class chain in Rabby's chain list (FR6 / US10).
 *
 * Redbelly is not a DeBank chain, so it will never appear in
 * `default-support-chains.json` or in the hourly sync from
 * `static.debank.com/supported_chains.json`. These two entries are injected
 * into the mainnet list instead, and `utils/chain.ts` re-applies them after
 * every sync so the sync cannot drop them.
 *
 * Both networks go in the *mainnet* list rather than the testnet list on
 * purpose. Rabby's testnet list is the custom-network path: it forces
 * `isTestnet: true`, which gates off the full signing UI (see the `isTestnet`
 * branch in `Approval/components/Actions/Send.tsx`) and hardcodes 18 decimals
 * and `eip1559: false` in `createTestnetChain`. We want the full UI on both
 * Redbelly networks, so `isTestnet` is false for both here and the
 * testnet-ness is carried by the chain name. Everything that would otherwise
 * hit DeBank for these chains is routed to direct RPC instead - see
 * `isRedbellyServerId` and the Redbelly background service.
 */

// `Chain` comes from @debank/common rather than @/types/chain because the
// repo patches it (patches/@debank+common+0.3.60.patch) to add the
// `needEstimateGas` and `blockInterval` fields the chain store actually uses.
import { CHAINS_ENUM, Chain } from '@debank/common';
import { toHex } from 'viem';
import {
  REDBELLY_EXPLORER_HOSTS,
  REDBELLY_MAINNET_CHAIN_ID,
  REDBELLY_MAINNET_ENUM,
  REDBELLY_MAINNET_SERVER_ID,
  REDBELLY_NETWORK_NAMES,
  REDBELLY_TESTNET_CHAIN_ID,
  REDBELLY_TESTNET_ENUM,
  REDBELLY_TESTNET_SERVER_ID,
  RBNT_DECIMALS,
  RBNT_SYMBOL,
} from './redbelly';

/**
 * Placeholder chain logo: a red disc with an R, inlined so the chain list
 * needs no bundled asset. Replace with real Redbelly branding before release.
 *
 * @param background - Fill colour for the disc.
 * @returns An SVG data URI.
 */
function placeholderLogo(background: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><circle cx='14' cy='14' r='14' fill='${background}'></circle><text x='14' y='15' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='16' font-weight='500'>R</text></svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/#/gu, '%23')}`;
}

const MAINNET_LOGO = placeholderLogo('#C3272B');
const TESTNET_LOGO = placeholderLogo('#8A6A6B');

export const REDBELLY_MAINNET: Chain = {
  id: REDBELLY_MAINNET_CHAIN_ID,
  enum: REDBELLY_MAINNET_ENUM as CHAINS_ENUM,
  name: REDBELLY_NETWORK_NAMES[REDBELLY_MAINNET_CHAIN_ID],
  serverId: REDBELLY_MAINNET_SERVER_ID,
  hex: toHex(REDBELLY_MAINNET_CHAIN_ID),
  network: String(REDBELLY_MAINNET_CHAIN_ID),
  nativeTokenSymbol: RBNT_SYMBOL,
  nativeTokenLogo: MAINNET_LOGO,
  nativeTokenDecimals: RBNT_DECIMALS,
  nativeTokenAddress: REDBELLY_MAINNET_SERVER_ID,
  scanLink: `${REDBELLY_EXPLORER_HOSTS[REDBELLY_MAINNET_CHAIN_ID]}/tx/_s_`,
  logo: MAINNET_LOGO,
  whiteLogo: MAINNET_LOGO,
  // UNVERIFIED: Redbelly's EIP-1559 support has not been confirmed against a
  // live node. Legacy `gasPrice` is the safe assumption and is what the Snap
  // observed in practice; the fee code reads either shape.
  eip: { '1559': false },
  // No DeBank pre-execution for these chains, so gas must be estimated
  // locally via eth_estimateGas.
  needEstimateGas: true,
  isTestnet: false,
  // @ts-expect-error `severity` is present on every chain the sync produces
  // but is not declared on the Chain type.
  severity: 0,
};

export const REDBELLY_TESTNET: Chain = {
  ...REDBELLY_MAINNET,
  id: REDBELLY_TESTNET_CHAIN_ID,
  enum: REDBELLY_TESTNET_ENUM as CHAINS_ENUM,
  name: REDBELLY_NETWORK_NAMES[REDBELLY_TESTNET_CHAIN_ID],
  serverId: REDBELLY_TESTNET_SERVER_ID,
  hex: toHex(REDBELLY_TESTNET_CHAIN_ID),
  network: String(REDBELLY_TESTNET_CHAIN_ID),
  nativeTokenLogo: TESTNET_LOGO,
  nativeTokenAddress: REDBELLY_TESTNET_SERVER_ID,
  scanLink: `${REDBELLY_EXPLORER_HOSTS[REDBELLY_TESTNET_CHAIN_ID]}/tx/_s_`,
  logo: TESTNET_LOGO,
  whiteLogo: TESTNET_LOGO,
};

/** Both Redbelly networks, Mainnet first. */
export const REDBELLY_CHAINS: Chain[] = [REDBELLY_MAINNET, REDBELLY_TESTNET];

/**
 * Put the Redbelly chains at the front of a mainnet chain list.
 *
 * Applied at every point the mainnet list is written, so no code path - the
 * hourly DeBank sync included - can drop them. Any entry already claiming a
 * Redbelly chain id is replaced rather than duplicated, so this is safe to
 * apply repeatedly and stays correct if DeBank ever does list Redbelly.
 *
 * @param list - A mainnet chain list.
 * @returns The same list with both Redbelly chains guaranteed present.
 */
export function withRedbellyChains(list: Chain[]): Chain[] {
  const redbellyIds = new Set(REDBELLY_CHAINS.map((chain) => chain.id));
  const rest = (list ?? []).filter((chain) => !redbellyIds.has(chain.id));
  return [...REDBELLY_CHAINS, ...rest];
}
