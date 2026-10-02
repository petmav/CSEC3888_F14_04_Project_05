import { useRequest } from 'ahooks';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';

import {
  BASE_TRANSACTION_GAS,
  REDBELLY_MAINNET_CHAIN_ID,
} from '@/constant/redbelly';
import { REDBELLY_MAINNET } from '@/constant/redbelly-chains';
import { useWallet } from '@/ui/utils';
import { useRedbellyCurrency } from '@/ui/hooks/useRedbellyCurrency';
import { gasUnitsToUsd } from '@/utils/redbelly/fees';

/**
 * RBNT's price and what a transfer costs right now (FR2, FR3).
 *
 * Replaces Rabby's ETH price and Gwei bar. On Redbelly a gas price in Gwei
 * means nothing to anyone: gas is pegged to US dollars and converted to RBNT,
 * so the useful number is "a transfer costs about 3.7 RBNT, which is one
 * cent" - the line that stops a large RBNT fee from reading as a bug.
 */
export const RedbellyPriceBar = () => {
  const { t } = useTranslation();
  const wallet = useWallet();
  const { format, formatPrice, currencyCode } = useRedbellyCurrency();

  const { data } = useRequest(async () => {
    const [rbntUsd, gasList, usdPerGas] = await Promise.all([
      wallet.getRedbellyRbntUsdPrice(),
      wallet
        .getCustomTestnetGasMarket({ chainId: REDBELLY_MAINNET_CHAIN_ID })
        .catch(() => null),
      wallet.getRedbellyUsdPerGas(REDBELLY_MAINNET_CHAIN_ID),
    ]);
    const gasPrice = gasList?.find((item) => item.level === 'normal')?.price;
    return {
      rbntUsd,
      transferRbnt: gasPrice
        ? new BigNumber(gasPrice).times(BASE_TRANSACTION_GAS).div(1e18)
        : null,
      transferUsd: gasUnitsToUsd(BASE_TRANSACTION_GAS, usdPerGas),
    };
  });

  return (
    <div
      className={clsx(
        'rounded-[8px] bg-r-neutral-card-1 px-[12px] py-[8px]',
        'flex items-center justify-between text-[13px]'
      )}
      data-testid="redbelly-price-bar"
    >
      <div className="flex items-center gap-[6px]">
        <img
          src={REDBELLY_MAINNET.logo}
          className="w-[20px] h-[20px] rounded-full"
        />
        <span className="text-r-neutral-title1 font-medium">
          {data?.rbntUsd ? formatPrice(data.rbntUsd) : '-'}
        </span>
        <span className="text-r-neutral-foot">RBNT/{currencyCode}</span>
      </div>
      <div className="text-r-neutral-foot">
        {data?.transferRbnt
          ? t('page.dashboard.redbelly.transferFee', {
              amount: data.transferRbnt.toFixed(2),
              usd:
                data.transferUsd !== null
                  ? ` (${format(data.transferUsd)})`
                  : '',
            })
          : '-'}
      </div>
    </div>
  );
};
