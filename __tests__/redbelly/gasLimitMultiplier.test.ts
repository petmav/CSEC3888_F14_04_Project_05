import {
  DEFAULT_GAS_LIMIT_MULTIPLIER,
  GAS_LIMIT_MULTIPLIER_PRESETS,
  MAX_GAS_LIMIT_MULTIPLIER,
  MIN_GAS_LIMIT_MULTIPLIER,
  normalizeGasLimitMultiplier,
} from '@/constant/redbelly';

describe('normalizeGasLimitMultiplier', () => {
  it('starts at 1x, so the limit equals the estimate', () => {
    expect(DEFAULT_GAS_LIMIT_MULTIPLIER).toBe(1);
    expect(normalizeGasLimitMultiplier(undefined)).toBe(1);
  });

  it('falls back to the default for anything that is not a finite number', () => {
    for (const value of [null, NaN, Infinity, 'abc', '', {}]) {
      expect(normalizeGasLimitMultiplier(value)).toBe(
        DEFAULT_GAS_LIMIT_MULTIPLIER
      );
    }
  });

  it('clamps to the allowed range', () => {
    expect(normalizeGasLimitMultiplier(0.5)).toBe(MIN_GAS_LIMIT_MULTIPLIER);
    expect(normalizeGasLimitMultiplier(-3)).toBe(MIN_GAS_LIMIT_MULTIPLIER);
    expect(normalizeGasLimitMultiplier(99)).toBe(MAX_GAS_LIMIT_MULTIPLIER);
  });

  it('rounds to two decimals and accepts typed strings', () => {
    expect(normalizeGasLimitMultiplier(1.2345)).toBe(1.23);
    expect(normalizeGasLimitMultiplier('1.5')).toBe(1.5);
  });

  it('keeps every preset unchanged', () => {
    for (const preset of GAS_LIMIT_MULTIPLIER_PRESETS) {
      expect(normalizeGasLimitMultiplier(preset)).toBe(preset);
    }
  });
});
