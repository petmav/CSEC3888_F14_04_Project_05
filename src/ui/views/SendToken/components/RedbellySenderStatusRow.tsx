import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { isRedbellyChainId } from '@/constant/redbelly';
import { useRedbellyStore } from '@/ui/state/redbelly';

/**
 * Whether the account that is about to send is KYC registered (FR5 / US9).
 *
 * Redbelly nodes reject an unregistered sender with JSON-RPC error -32603, so
 * the Send page says so up front instead of letting the user discover it when
 * the transaction fails. Informational only: the node is the final authority,
 * and a check that could not run is reported as unknown, never as registered.
 */
export const RedbellySenderStatusRow = ({
  chainId,
  address,
}: {
  chainId?: number | null;
  address?: string | null;
}) => {
  const { t } = useTranslation();
  const sender = useRedbellyStore(
    useShallow((state) => state.currentTx.sender)
  );
  const checkSender = useRedbellyStore((state) => state.checkSender);

  React.useEffect(() => {
    checkSender(chainId, address);
  }, [checkSender, chainId, address]);

  if (!isRedbellyChainId(chainId) || !address) {
    return null;
  }

  const isCurrent =
    sender.address?.toLowerCase() === address.toLowerCase() &&
    sender.chainId === Number(chainId);
  const isChecking = !isCurrent || sender.loading || !sender.completed;

  let label: string;
  let tone: string;
  if (isChecking) {
    label = t('page.signTx.redbelly.checking');
    tone = 'text-r-neutral-foot';
  } else if (sender.isRegistered === null) {
    label = t('page.dashboard.assets.redbelly.kycUnknown');
    tone = 'text-r-orange-default';
  } else if (sender.isRegistered) {
    label = t('page.dashboard.assets.redbelly.kycRegistered');
    tone = 'text-r-green-default';
  } else {
    label = t('page.dashboard.assets.redbelly.kycNotRegistered');
    tone = 'text-r-red-default';
  }

  return (
    <div className="px-20 mt-[12px] flex items-center justify-between text-[13px]">
      <span className="text-r-neutral-foot">
        {t('page.signTx.redbelly.senderTitle')}
      </span>
      <span className={clsx('font-medium', tone)}>{label}</span>
    </div>
  );
};
