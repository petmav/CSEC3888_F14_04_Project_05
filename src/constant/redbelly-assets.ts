/**
 * Redbelly tokens and staking pools the wallet knows about without being told
 * (US13).
 *
 * There is no token indexer for Redbelly in Rabby's backend, so a wallet that
 * only lists what the user adds by hand shows a mainnet holder nothing but
 * RBNT. These lists close that gap. Everything here was read from the Reddex
 * frontend (the main Redbelly DEX) and confirmed on chain on 2026-10-01: name,
 * symbol and decimals come from the token contracts themselves, and the pool
 * reads below return live positions.
 */

import {
  REDBELLY_MAINNET_CHAIN_ID,
  REDBELLY_TESTNET_CHAIN_ID,
} from './redbelly';

export type RedbellyTokenInfo = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /**
   * Bundled logo (`_raw/images/redbelly-tokens/`), taken from Reddex's
   * token images. Bundled, not linked: the network guard keeps the wallet
   * off third-party CDNs.
   */
  logo?: string;
};

const tokenLogo = (name: string) => `/images/redbelly-tokens/${name}.png`;

/** ERC-20s listed by default, by chain id. Order is display order. */
export const REDBELLY_DEFAULT_TOKENS: Record<number, RedbellyTokenInfo[]> = {
  [REDBELLY_MAINNET_CHAIN_ID]: [
    {
      address: '0x8c4acd74ff4385f3b7911432fa6787aa14406f8b',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      logo: tokenLogo('usdt'),
    },
    {
      address: '0x8201c02d4ab2214471e8c3ad6475c8b0cd9f2d06',
      symbol: 'USDC.e',
      name: 'Bridged USDC',
      decimals: 6,
      logo: tokenLogo('usdc'),
    },
    {
      address: '0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076',
      symbol: 'WRBNT',
      name: 'Wrapped RBNT',
      decimals: 18,
      logo: tokenLogo('wrbnt'),
    },
    {
      address: '0x0fa205c0446cd9eedcc7538c9e24bc55ad08207f',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      logo: tokenLogo('weth'),
    },
    {
      address: '0x0233971bd2de29e81029336c46997055df3b5282',
      symbol: 'LQDX',
      name: 'Liquid Crypto',
      decimals: 18,
      logo: tokenLogo('lqdx'),
    },
    {
      address: '0x4ab8302453bff522847bd8609e3264719c6bbd13',
      symbol: 'SNEC',
      name: 'Slithery Lil Sneaky Snec',
      decimals: 18,
      logo: tokenLogo('snec'),
    },
  ],
  [REDBELLY_TESTNET_CHAIN_ID]: [
    {
      address: '0x7401f2518b0fcb4bbfda55215b586b7688ad2448',
      symbol: 'WRBNT',
      name: 'Wrapped RedBelly Token',
      decimals: 18,
      logo: tokenLogo('wrbnt'),
    },
  ],
};

/**
 * Tokens priced 1:1 with RBNT. Wrapped RBNT is the only one; everything else
 * is shown without a dollar value rather than with a guessed one (US7).
 */
export const RBNT_PEGGED_TOKENS = new Set([
  '0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076',
  '0x7401f2518b0fcb4bbfda55215b586b7688ad2448',
]);

/**
 * Tokens priced 1:1 with the US dollar. Shown at $1 a unit, which is what the
 * rest of the ecosystem (Reddex included) does.
 */
export const USD_PEGGED_TOKENS = new Set([
  '0x8c4acd74ff4385f3b7911432fa6787aa14406f8b',
  '0x8201c02d4ab2214471e8c3ad6475c8b0cd9f2d06',
]);

export type RedbellyStakingPool = {
  chainId: number;
  address: string;
  name: string;
  /** Whether stakes vest on a schedule rather than being withdrawable. */
  hasLockPeriod: boolean;
  lockPeriodLabel: string | null;
};

/**
 * RBNT staking pools. Both take native RBNT and pay rewards in RBNT; the APR
 * is read from the pool (`getCurrentAllocPoint() / 1e6 * 10`, the formula
 * Reddex itself uses) rather than hardcoded.
 *
 * Mainnet only: Reddex has deployed no staking pools on Testnet.
 */
export const REDBELLY_STAKING_POOLS: RedbellyStakingPool[] = [
  {
    chainId: REDBELLY_MAINNET_CHAIN_ID,
    address: '0x5e8040e85d0e6363d798a43bea939c026449946d',
    name: 'RBNT 365-day lock',
    hasLockPeriod: true,
    lockPeriodLabel: '365 days',
  },
  {
    chainId: REDBELLY_MAINNET_CHAIN_ID,
    address: '0x43a1dc107bbb06df266278056055ae7fc5bd2817',
    name: 'RBNT flexible',
    hasLockPeriod: false,
    lockPeriodLabel: null,
  },
];

/**
 * Where users manage a stake. The wallet shows positions read-only; staking,
 * unstaking and claiming happen on the pool's own site, through the normal
 * signing flow.
 */
export const REDBELLY_STAKING_URL = 'https://www.reddex.io/stake';

/**
 * Routescan's API, used to discover tokens a user holds that are not in the
 * default list. Optional: if it fails, the default list still shows.
 */
export const REDBELLY_EXPLORER_API: Record<number, string> = {
  [REDBELLY_MAINNET_CHAIN_ID]:
    'https://api.routescan.io/v2/network/mainnet/evm/151',
};
