import { portfolioUsd } from '@/utils/redbelly/portfolio';

describe('portfolioUsd', () => {
  it('values RBNT, stake and wrapped RBNT at the feed price', () => {
    // The live Mainnet staker of 2026-10-01 at the feed price of the day.
    const total = portfolioUsd({
      rbnt: '896.756',
      staked: '890680.0564',
      wrappedRbnt: '1.3911',
      stablecoins: 0,
      rbntUsd: 0.002465,
    });
    expect(total.toFixed(2)).toBe('2197.74');
  });

  it('adds stablecoins at face value, unaffected by the RBNT price', () => {
    expect(
      portfolioUsd({
        rbnt: 0,
        staked: 0,
        wrappedRbnt: 0,
        stablecoins: '12.5',
        rbntUsd: 0.002465,
      }).toFixed()
    ).toBe('12.5');
  });

  it('is zero for an empty account', () => {
    expect(
      portfolioUsd({
        rbnt: 0,
        staked: 0,
        wrappedRbnt: 0,
        stablecoins: 0,
        rbntUsd: 0.002465,
      }).isZero()
    ).toBe(true);
  });
});
