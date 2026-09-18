import { estimateFee, gasUnitsToUsd } from '@/utils/redbelly/fees';
import { formatRbnt, formatUsd } from '@/utils/redbelly/format';

/**
 * Assert a fee was readable and return its wei amount.
 *
 * Keeps the null check out of the test bodies, where a conditional would
 * obscure what is actually being asserted.
 *
 * @param fee - The result of `estimateFee`.
 * @returns The fee in wei.
 */
function feeWeiOf(fee: ReturnType<typeof estimateFee>): bigint {
  if (!fee) {
    throw new Error('Expected estimateFee to return a fee');
  }
  return fee.feeWei;
}

describe('estimateFee', () => {
  // Live-observed Redbelly gas price: 0xa0d6836bbe7e wei ~= 176,842 gwei.
  const GAS_PRICE = '0xa0d6836bbe7e';
  const TRANSFER_GAS = '0x5208'; // 21,000

  // Live value from the gasfees contract: US$0.01 per 21,000-gas transaction.
  const USD_PER_GAS = 0.01 / 21000;

  it('prices a simple transfer at one US cent', () => {
    const fee = estimateFee(
      { gas: TRANSFER_GAS, maxFeePerGas: GAS_PRICE },
      USD_PER_GAS
    );
    // The gasfees contract quotes the price of one base transaction, so a
    // 21,000-gas transfer costs exactly that by construction. This is the
    // figure that makes the large RBNT number explicable.
    expect(fee?.feeUsd).toBeCloseTo(0.01, 9);
  });

  it('converts the same transfer to a large RBNT figure', () => {
    const fee = estimateFee(
      { gas: TRANSFER_GAS, maxFeePerGas: GAS_PRICE },
      USD_PER_GAS
    );
    // ~3.7 RBNT for a transfer - the number users report as broken (US6).
    expect(Number(formatRbnt(feeWeiOf(fee), 2))).toBeCloseTo(3.71, 1);
  });

  it('omits the dollar figure rather than guessing when the peg is unreadable', () => {
    const fee = estimateFee(
      { gas: TRANSFER_GAS, maxFeePerGas: GAS_PRICE },
      null
    );
    expect(fee?.feeUsd).toBeNull();
    // The RBNT figure is still sound - it comes from the transaction itself.
    expect(fee?.feeWei).toBe(21000n * BigInt(GAS_PRICE));
  });

  it('reads legacy transactions that carry gasPrice instead', () => {
    const fee = estimateFee(
      { gas: TRANSFER_GAS, gasPrice: GAS_PRICE },
      USD_PER_GAS
    );
    expect(fee?.gasPriceWei).toBe(BigInt(GAS_PRICE));
  });

  it('prefers maxFeePerGas when both are present', () => {
    const fee = estimateFee(
      { gas: TRANSFER_GAS, maxFeePerGas: '0x2', gasPrice: '0x1' },
      USD_PER_GAS
    );
    expect(fee?.gasPriceWei).toBe(2n);
  });

  it('returns null rather than a partial answer when gas is missing', () => {
    expect(estimateFee({ maxFeePerGas: GAS_PRICE }, USD_PER_GAS)).toBeNull();
  });

  it('returns null rather than a partial answer when no price is present', () => {
    expect(estimateFee({ gas: TRANSFER_GAS }, USD_PER_GAS)).toBeNull();
  });

  it('rejects malformed values instead of coercing them', () => {
    expect(
      estimateFee({ gas: 'not-hex', maxFeePerGas: GAS_PRICE }, USD_PER_GAS)
    ).toBeNull();
    expect(
      estimateFee({ gas: 21000, maxFeePerGas: GAS_PRICE }, USD_PER_GAS)
    ).toBeNull();
  });
});

describe('gasUnitsToUsd', () => {
  const USD_PER_GAS = 0.01 / 21000;

  it('prices a base transaction at one cent', () => {
    expect(gasUnitsToUsd(21000, USD_PER_GAS)).toBeCloseTo(0.01, 9);
  });

  it('scales linearly with gas, not with the RBNT amount', () => {
    // The distinction that makes this module necessary: Redbelly quotes USD
    // per unit of gas, so the dollar figure never touches the RBNT price.
    expect(gasUnitsToUsd(42000, USD_PER_GAS)).toBeCloseTo(0.02, 9);
  });

  it('accepts the hex-free numeric forms Rabby threads around', () => {
    expect(gasUnitsToUsd('21000', USD_PER_GAS)).toBeCloseTo(0.01, 9);
    expect(gasUnitsToUsd(21000n, USD_PER_GAS)).toBeCloseTo(0.01, 9);
  });

  it('returns null when the peg is unreadable rather than showing zero', () => {
    // US7: no dollar figure beats a wrong one.
    expect(gasUnitsToUsd(21000, null)).toBeNull();
  });

  it('returns null for missing or nonsensical gas', () => {
    expect(gasUnitsToUsd(null, USD_PER_GAS)).toBeNull();
    expect(gasUnitsToUsd(undefined, USD_PER_GAS)).toBeNull();
    expect(gasUnitsToUsd('not-a-number', USD_PER_GAS)).toBeNull();
  });
});

describe('formatRbnt', () => {
  it('formats whole and fractional RBNT', () => {
    expect(formatRbnt(10n ** 18n)).toBe('1.0000');
    expect(formatRbnt(10n ** 18n / 2n)).toBe('0.5000');
  });

  it('keeps precision on balances too large for a double', () => {
    // The live testnet balance of a profiled account, to the wei.
    expect(formatRbnt(852645464771449483090n)).toBe('852.6454');
  });

  it('formats zero', () => {
    expect(formatRbnt(0n)).toBe('0.0000');
  });
});

describe('formatUsd', () => {
  it('shows extra digits below a cent, so small fees do not read as US$0.00', () => {
    expect(formatUsd(0.0042)).toBe('US$0.0042');
  });

  it('shows two digits at a cent and above', () => {
    expect(formatUsd(0.01)).toBe('US$0.01');
    expect(formatUsd(1.5)).toBe('US$1.50');
  });
});
