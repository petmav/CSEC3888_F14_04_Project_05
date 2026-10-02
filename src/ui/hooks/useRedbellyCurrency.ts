import BigNumber from 'bignumber.js';
import { useCallback, useEffect, useMemo } from 'react';

import { useCurrency } from '@/ui/hooks/useCurrency';
import { formatCurrency } from '@/ui/utils';

/**
 * Currencies the home page's currency chip cycles through, in order. Only
 * those the rate list actually has are offered; the full list stays in
 * Settings > Currency. AUD second because Redbelly is an Australian network.
 */
export const CURRENCY_ROTATION = ['USD', 'AUD', 'EUR', 'GBP', 'SGD', 'JPY'];

/**
 * Display currency for every Redbelly value (FR2).
 *
 * All Redbelly prices are in US dollars - the on-chain feed and the gas peg
 * both are - and this converts them at the rate in Rabby's currency list.
 * The choice is Rabby's own setting, so Settings > Currency and the home
 * chip are the same switch.
 *
 * @returns The currency, formatters and a rotate action.
 */
export function useRedbellyCurrency() {
  const {
    currency,
    currencyCode,
    currencyList,
    setCurrentCurrency,
    syncCurrencyList,
  } = useCurrency();

  useEffect(() => {
    // Cached for an hour in the background; this only fetches when stale.
    syncCurrencyList();
  }, [syncCurrencyList]);

  const rotation = useMemo(() => {
    const available = CURRENCY_ROTATION.filter(
      (code) =>
        code === 'USD' || currencyList.some((item) => item.code === code)
    );
    return available.includes(currencyCode)
      ? available
      : [...available, currencyCode];
  }, [currencyList, currencyCode]);

  const rotate = useCallback(() => {
    const next =
      rotation[(rotation.indexOf(currencyCode) + 1) % rotation.length];
    setCurrentCurrency(next);
  }, [rotation, currencyCode, setCurrentCurrency]);

  /** A US dollar amount in the display currency, e.g. "A$3,412.10". */
  const format = useCallback(
    (usd: BigNumber.Value) =>
      formatCurrency(new BigNumber(usd).toFixed(), { currency }),
    [currency]
  );

  /**
   * A small unit price (RBNT is a fraction of a cent) to four significant
   * figures, where `format` would round it to "<$0.01".
   */
  const formatPrice = useCallback(
    (usd: number) => {
      const value = new BigNumber(usd)
        .times(currency.usd_rate || 1)
        .precision(4)
        .toFixed();
      return currency.is_prefix === false
        ? `${value} ${currency.symbol}`
        : `${currency.symbol}${value}`;
    },
    [currency]
  );

  return {
    currency,
    currencyCode,
    rotation,
    rotate,
    format,
    formatPrice,
  };
}
