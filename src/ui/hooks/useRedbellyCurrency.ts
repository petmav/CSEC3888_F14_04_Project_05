import BigNumber from 'bignumber.js';
import { useCallback, useEffect } from 'react';

import { useCurrency } from '@/ui/hooks/useCurrency';
import { formatCurrency } from '@/ui/utils';

/**
 * Display currency for every Redbelly value (FR2).
 *
 * All Redbelly prices are in US dollars - the on-chain feed and the gas peg
 * both are - and this converts them at the rate in Rabby's currency list.
 * The choice is Rabby's own setting and is changed only in Settings >
 * Currency; nothing on the home page switches it.
 *
 * @returns The currency and formatters.
 */
export function useRedbellyCurrency() {
  const { currency, currencyCode, syncCurrencyList } = useCurrency();

  useEffect(() => {
    // Cached for an hour in the background; this only fetches when stale.
    syncCurrencyList();
  }, [syncCurrencyList]);

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
    format,
    formatPrice,
  };
}
