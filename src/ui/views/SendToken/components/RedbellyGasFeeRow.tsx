import React from 'react';
import { useAsync } from 'react-use';
import { useTranslation } from 'react-i18next';

import { RBNT_SYMBOL } from '@/constant/redbelly';
import { useWallet } from '@/ui/utils';
import { estimateFee } from '@/utils/redbelly/fees';
import { formatRbnt, formatUsd } from '@/utils/redbelly/format';

/**
 * The Send page's fee row on Redbelly (FR3 / US6 / US7).
 *
 * Rabby's own fee row is fed by DeBank's gas market and pre-execution, neither
 * of which knows Redbelly, so on Redbelly it never resolves. This row reads
 * the gas price from a Redbelly node and the dollar peg from the on-chain
 * `gasfees` contract, and shows `gas limit x gas price` in RBNT with the dollar
 * value beside it. If the peg cannot be read the RBNT amount stands alone; if
 * the gas price cannot be read the row says so rather than showing a figure.
 */
export const RedbellyGasFeeRow = ({
  chainId,
  gasLimit,
}: {
  chainId: number;
  gasLimit: number;
}) => {
  const { t } = useTranslation();
  const wallet = useWallet();

  const { value, loading } = useAsync(async () => {
    const [gasPriceWei, usdPerGas] = await Promise.all([
      wallet.getRedbellyGasPrice(chainId),
      wallet.getRedbellyUsdPerGas(chainId),
    ]);
    if (gasPriceWei === null) {
      return null;
    }
    return estimateFee(
      {
        gas: `0x${gasLimit.toString(16)}`,
        gasPrice: `0x${BigInt(gasPriceWei).toString(16)}`,
      },
      usdPerGas
    );
  }, [chainId, gasLimit]);

  let content: React.ReactNode;
  if (loading) {
    content = <span className="text-r-neutral-foot">…</span>;
  } else if (!value) {
    content = (
      <span className="text-r-orange-default">
        {t('page.sendToken.redbelly.gasFeeUnavailable')}
      </span>
    );
  } else {
    content = (
      <span className="text-r-neutral-title-1 font-medium">
        {value.feeUsd !== null ? (
          <>
            {formatUsd(value.feeUsd)}{' '}
            <span className="text-r-neutral-foot font-normal">
              ~{formatRbnt(value.feeWei)} {RBNT_SYMBOL}
            </span>
          </>
        ) : (
          `${formatRbnt(value.feeWei)} ${RBNT_SYMBOL}`
        )}
      </span>
    );
  }

  return (
    <div className="px-20 mt-[12px] flex items-center justify-between text-[13px]">
      <span className="text-r-neutral-foot">
        {t('page.sendToken.redbelly.gasFee')}
      </span>
      {content}
    </div>
  );
};
