// Rabby's constants and chain utils import each other; the app always loads
// the constants first, so the test does the same.
import '@/constant';
import { isRedbellyChainId, REDBELLY_MAINNET_ENUM } from '@/constant/redbelly';
import {
  DEFAULT_SITE_CHAIN_ENUM,
  isChainAllowed,
} from '@/utils/redbelly/allowlist';

describe('dApp chain allowlist (Redbelly-only build)', () => {
  it('allows Redbelly Mainnet and Testnet, numeric or hex', () => {
    expect(isChainAllowed(151)).toBe(true);
    expect(isChainAllowed(153)).toBe(true);
    expect(isChainAllowed('0x97')).toBe(true);
    expect(isChainAllowed('0x99')).toBe(true);
  });

  it('refuses every other chain, and nothing at all', () => {
    [1, 56, 137, 8453, 42161, '0x1', '0x89'].forEach((id) => {
      expect(isChainAllowed(id)).toBe(false);
    });
    expect(isChainAllowed(undefined)).toBe(false);
    expect(isChainAllowed(null)).toBe(false);
    expect(isChainAllowed('')).toBe(false);
  });

  it('starts new sites on Redbelly Mainnet', () => {
    expect(DEFAULT_SITE_CHAIN_ENUM).toBe(REDBELLY_MAINNET_ENUM);
    expect(isRedbellyChainId(151)).toBe(true);
  });
});
