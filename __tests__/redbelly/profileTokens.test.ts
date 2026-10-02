import { REDBELLY_MAINNET, REDBELLY_TESTNET } from '@/constant/redbelly-chains';
import { createTestnetChain } from '@/background/service/customTestnet';
import { createRedbellyNativeToken } from '@/ui/utils/portfolio/redbellyToken';

// createTestnetChain is pure, but its module pulls in the whole
// custom-network service; stub what needs a browser.
jest.mock('@/background/utils/ipfs', () => ({}));
jest.mock('@/background/service/redbelly', () => ({}));

// Redbelly runs as a built-in custom network, so the chain the UI holds is
// the one createTestnetChain derives.
const MAINNET = createTestnetChain({ ...REDBELLY_MAINNET });
const TESTNET = createTestnetChain({ ...REDBELLY_TESTNET });

describe('Redbelly profile token rows', () => {
  it('converts a mainnet wei balance into an RBNT token row', () => {
    const token = createRedbellyNativeToken(MAINNET, '1234567890000000000');

    expect(token.chain).toBe('custom_151');
    expect(token._tokenId).toBe(MAINNET.nativeTokenAddress);
    expect(token.symbol).toBe('RBNT');
    expect(token.amount).toBe(1.23456789);
    expect(token._amountStr).toBe('1.2346');
    expect(token.raw_amount).toBe('1234567890000000000');
    expect(token._priceStr).toBe('-');
    expect(token._usdValueStr).toBe('-');
  });

  it('uses the selected Redbelly network and labels failed reads unavailable', () => {
    const token = createRedbellyNativeToken(TESTNET, null);

    expect(token.chain).toBe('custom_153');
    expect(token.symbol).toBe('RBNT');
    expect(token.amount).toBe(0);
    expect(token.is_core).toBe(false);
    expect(token._amountStr).toBe('Unavailable');
  });

  it('shows an actual zero balance as zero, not as an unavailable read', () => {
    const token = createRedbellyNativeToken(MAINNET, '0');

    expect(token.amount).toBe(0);
    expect(token.is_core).toBe(true);
    expect(token._amountStr).toBe('0');
  });
});
