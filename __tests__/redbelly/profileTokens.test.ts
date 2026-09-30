import { REDBELLY_MAINNET, REDBELLY_TESTNET } from '@/constant/redbelly-chains';
import { createRedbellyNativeToken } from '@/ui/utils/portfolio/redbellyToken';

describe('Redbelly profile token rows', () => {
  it('converts a mainnet wei balance into an RBNT token row', () => {
    const token = createRedbellyNativeToken(
      REDBELLY_MAINNET,
      '1234567890000000000'
    );

    expect(token.chain).toBe('redbelly');
    expect(token._tokenId).toBe(REDBELLY_MAINNET.nativeTokenAddress);
    expect(token.symbol).toBe('RBNT');
    expect(token.amount).toBe(1.23456789);
    expect(token._amountStr).toBe('1.2346');
    expect(token.raw_amount).toBe('1234567890000000000');
    expect(token._priceStr).toBe('-');
    expect(token._usdValueStr).toBe('-');
  });

  it('uses the selected Redbelly network and labels failed reads unavailable', () => {
    const token = createRedbellyNativeToken(REDBELLY_TESTNET, null);

    expect(token.chain).toBe('redbelly-testnet');
    expect(token.symbol).toBe('RBNT');
    expect(token.amount).toBe(0);
    expect(token.is_core).toBe(false);
    expect(token._amountStr).toBe('Unavailable');
  });

  it('shows an actual zero balance as zero, not as an unavailable read', () => {
    const token = createRedbellyNativeToken(REDBELLY_MAINNET, '0');

    expect(token.amount).toBe(0);
    expect(token.is_core).toBe(true);
    expect(token._amountStr).toBe('0');
  });
});
