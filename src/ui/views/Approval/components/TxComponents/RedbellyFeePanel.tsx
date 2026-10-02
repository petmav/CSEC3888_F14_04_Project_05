import React from 'react';
import { useTranslation } from 'react-i18next';

import { isRedbellyChainId, RBNT_SYMBOL } from '@/constant/redbelly';
import { useWallet } from '@/ui/utils';
import { estimateFee } from '@/utils/redbelly/fees';
import type { FeeFields } from '@/utils/redbelly/fees';
import { formatRbnt, formatUsd } from '@/utils/redbelly/format';

/**
 * The maximum network fee of a Redbelly transaction, in RBNT and US dollars
 * (FR3 / US6 / US7).
 *
 * The RBNT figure is `gas limit x gas price`. The dollar figure comes from the
 * on-chain `gasfees` contract via `getRedbellyUsdPerGas`, not from a token
 * price, because the wallet has no RBNT price feed. When that peg cannot be
 * read - or the contract reports a currency other than USD, which the reader
 * turns into `null` - the RBNT amount is shown alone. A missing dollar figure
 * is deliberate; a wrong one is not acceptable.
 */
export const RedbellyFeePanel = ({
  chainId,
  fields,
}: {
  chainId?: number | null;
  /** Gas limit and price fields of the transaction being confirmed. */
  fields: FeeFields;
}) => {
  const { t } = useTranslation();
  const wallet = useWallet();
  const isRedbelly = isRedbellyChainId(chainId);

  // `undefined` while loading, `null` once the peg is known to be unusable.
  const [usdPerGas, setUsdPerGas] = React.useState<number | null | undefined>(
    undefined
  );

  React.useEffect(() => {
    if (!isRedbelly || chainId === undefined || chainId === null) {
      return;
    }
    let cancelled = false;
    setUsdPerGas(undefined);
    wallet
      .getRedbellyUsdPerGas(Number(chainId))
      .then((value) => {
        if (!cancelled) {
          setUsdPerGas(
            typeof value === 'number' && Number.isFinite(value) && value >= 0
              ? value
              : null
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsdPerGas(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, chainId, isRedbelly]);

  if (!isRedbelly) {
    return null;
  }

  const fee = estimateFee(fields, usdPerGas ?? null);

  return (
    <div className="flex items-center justify-between text-12 text-r-neutral-foot">
      <span>{t('page.signTx.redbelly.feeTitle')}</span>
      {fee ? (
        <span
          className="text-r-neutral-title-1 font-medium"
          data-testid="redbelly-fee"
        >
          {`${formatRbnt(fee.feeWei)} ${RBNT_SYMBOL}`}
          {fee.feeUsd !== null ? ` (≈ ${formatUsd(fee.feeUsd)})` : ''}
        </span>
      ) : (
        <span>{t('page.signTx.redbelly.feeUnavailable')}</span>
      )}
    </div>
  );
};

export default RedbellyFeePanel;
