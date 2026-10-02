/**
 * The chains a dApp may use (FR4).
 *
 * A Redbelly-only wallet still carries Rabby's full chain list internally -
 * too much of Rabby looks Ethereum up by enum to remove it - so the limit is
 * enforced where dApps come in: the chain a site is connected to, and the
 * chains it may switch or add. Every per-request check downstream (a
 * transaction's chainId, a typed-data domain's chainId) is then checked
 * against a chain that can only be Redbelly.
 */

import {
  isRedbellyChainId,
  REDBELLY_MAINNET_ENUM,
  REDBELLY_ONLY,
} from '@/constant/redbelly';
import { findChain } from '@/utils/chain';

/** The chain a newly connected site starts on. */
export const DEFAULT_SITE_CHAIN_ENUM = REDBELLY_MAINNET_ENUM;

/**
 * Whether a dApp may use this chain.
 *
 * @param chainId - A numeric or hex chain id.
 * @returns True if the chain is allowed.
 */
export function isChainAllowed(
  chainId: number | string | undefined | null
): boolean {
  if (!REDBELLY_ONLY) {
    return true;
  }
  if (chainId === undefined || chainId === null || chainId === '') {
    return false;
  }
  return isRedbellyChainId(Number(chainId));
}

/**
 * A site's chain, or the default if it is not one a dApp may use.
 *
 * Covers sites whose stored chain predates the allowlist, and anything that
 * reaches the permission store some other way.
 *
 * @param chainEnum - The chain enum stored for the site.
 * @returns An allowed chain enum.
 */
export function allowedSiteChain(chainEnum?: string | null): string {
  if (!REDBELLY_ONLY) {
    return chainEnum || DEFAULT_SITE_CHAIN_ENUM;
  }
  const chain = chainEnum ? findChain({ enum: chainEnum }) : null;
  return chain && isChainAllowed(chain.id)
    ? chain.enum
    : DEFAULT_SITE_CHAIN_ENUM;
}
