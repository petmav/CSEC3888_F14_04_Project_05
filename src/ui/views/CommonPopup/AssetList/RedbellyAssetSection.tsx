import { useRequest } from 'ahooks';
import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { isRedbellyServerId, RBNT_SYMBOL } from '@/constant/redbelly';
import { TooltipWithMagnetArrow } from '@/ui/component/Tooltip/TooltipWithMagnetArrow';
import { useRabbySelector } from '@/ui/store';
import { useWallet } from '@/ui/utils';
import { formatRbnt } from '@/utils/redbelly/format';
import { findChain } from '@/utils/chain';
import IconUnknown from '@/ui/assets/token-default.svg';
import { TBody, TCell, TRow, Table } from './components/Table';

/**
 * RBNT balances and KYC status for the active account (FR2/FR5, US8/US9).
 *
 * Why this exists as its own section rather than a row in the normal token
 * list: Rabby's mainnet asset list is a USD portfolio backed by DeBank, and
 * DeBank does not index Redbelly, so RBNT has no price and would render as a
 * $0 holding - exactly the "is my money gone?" confusion this is meant to
 * dispel. The presentation instead follows Rabby's own convention for chains
 * without a price feed (`CustomTestnetAssetList`): amount and symbol, no USD
 * column.
 *
 * Both networks are always listed. The Snap did this because `onHomePage`
 * received no chain context; here it is kept because it is simply more useful,
 * and because one network being unreachable must not blank out the other.
 */

export const RedbellyAssetSection = ({
  selectChainId,
  visible,
  className,
}: {
  /** Chain `serverId` currently filtered on, or null for "all chains". */
  selectChainId?: string | null;
  visible?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const wallet = useWallet();
  const { currentAccount } = useRabbySelector((s) => ({
    currentAccount: s.account.currentAccount,
  }));

  const { data: summaries, loading } = useRequest(
    async () => {
      if (!currentAccount?.address) {
        return [];
      }
      return wallet.getRedbellyAccountSummaries(currentAccount.address);
    },
    {
      refreshDeps: [currentAccount?.address, visible],
      ready: !!currentAccount?.address && visible !== false,
    }
  );

  // Respect the chain filter: hidden when the user has narrowed to a
  // non-Redbelly chain.
  if (selectChainId && !isRedbellyServerId(selectChainId)) {
    return null;
  }

  if (loading || !summaries?.length) {
    return null;
  }

  return (
    <div className={clsx('mt-12', className)}>
      <div className="px-16 mb-8">
        <div className="text-r-neutral-title-1 text-13 font-medium">
          {t('page.dashboard.assets.redbelly.title')}
        </div>
        <div className="text-r-neutral-foot text-12 font-normal">
          {t('page.dashboard.assets.redbelly.subtitle')}
        </div>
      </div>
      <Table>
        <TBody>
          {summaries.map((summary) => {
            const chain = findChain({ id: summary.chainId });

            return (
              <TRow key={summary.chainId}>
                <TCell className="py-[13px] flex gap-10 flex-1 items-center">
                  <img
                    className="w-32 h-32 rounded-full"
                    src={chain?.logo || IconUnknown}
                    alt={chain?.name}
                  />
                  <div className="overflow-hidden">
                    <div className="text-r-neutral-title-1 text-15 font-medium leading-[16px] mb-[1px]">
                      {RBNT_SYMBOL}
                    </div>
                    <div className="text-r-neutral-foot text-13 font-normal leading-[14px] truncate">
                      {chain?.name}
                    </div>
                  </div>
                </TCell>

                <TCell className="py-[13px] text-right">
                  {summary.unavailable ? (
                    // US8: a node that does not answer is reported as
                    // unavailable, never as a zero balance.
                    <TooltipWithMagnetArrow
                      title={t('page.dashboard.assets.redbelly.unavailableTip')}
                      className="rectangle w-[max-content] max-w-[280px]"
                    >
                      <span className="text-r-orange-default text-13">
                        {t('page.dashboard.assets.redbelly.unavailable')}
                      </span>
                    </TooltipWithMagnetArrow>
                  ) : (
                    <div className="text-r-neutral-title-1 text-15 font-medium leading-[16px]">
                      {formatRbnt(BigInt(summary.balanceWei ?? '0'))}
                    </div>
                  )}

                  <RedbellyKycTag isRegistered={summary.isRegistered} />
                </TCell>
              </TRow>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
};

/**
 * The account's own KYC status on one network (US9).
 *
 * @param props - Component props.
 * @param props.isRegistered - Registration state, or `null` if unknown.
 * @returns The status line.
 */
const RedbellyKycTag = ({ isRegistered }: { isRegistered: boolean | null }) => {
  const { t } = useTranslation();

  if (isRegistered === null) {
    return (
      <div className="text-r-neutral-foot text-12 font-normal leading-[14px] mt-[2px]">
        {t('page.dashboard.assets.redbelly.kycUnknown')}
      </div>
    );
  }

  if (isRegistered) {
    return (
      <div className="text-r-green-default text-12 font-normal leading-[14px] mt-[2px]">
        {t('page.dashboard.assets.redbelly.kycRegistered')}
      </div>
    );
  }

  return (
    <TooltipWithMagnetArrow
      title={t('page.dashboard.assets.redbelly.kycNotRegisteredTip')}
      className="rectangle w-[max-content] max-w-[280px]"
    >
      <div className="text-r-red-default text-12 font-normal leading-[14px] mt-[2px]">
        {t('page.dashboard.assets.redbelly.kycNotRegistered')}
      </div>
    </TooltipWithMagnetArrow>
  );
};
