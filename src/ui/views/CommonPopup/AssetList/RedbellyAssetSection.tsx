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
 * RBNT balances and KYC status for the active account, per network (FR2/FR5,
 * US8/US9).
 *
 * Read straight from each Redbelly node. Both networks are always listed, and
 * one being unreachable must not blank out the other: a node that does not
 * answer is reported as unavailable, never as a zero balance - a failed read
 * that looks like an empty account is the bug this project started from.
 */

export const RedbellyAssetSection = ({
  selectChainId,
  visible,
  className,
  onHasBalanceChange,
  fluid = false,
  refreshSignal = 0,
}: {
  /** Chain `serverId` currently filtered on, or null for "all chains". */
  selectChainId?: string | null;
  visible?: boolean;
  className?: string;
  /**
   * Reports whether any Redbelly balance is non-zero. The parent's "No assets"
   * state is driven by DeBank, which cannot see RBNT, so without this a wallet
   * holding only RBNT is shown as empty.
   */
  onHasBalanceChange?: (hasBalance: boolean) => void;
  /**
   * Fit the parent's width instead of the viewport's. The popup `Table` is
   * `w-screen -mx-20`, sized for the 400px extension popup; inside the desktop
   * profile that is wider than its container, which pushes the whole page past
   * the window edge. Desktop callers set this.
   */
  fluid?: boolean;
  /**
   * Bump to re-read the balances in place. The rows already on screen stay
   * until the new answer arrives, so a refresh that finds nothing new changes
   * nothing visible (a remount would blank the list for a moment).
   */
  refreshSignal?: number;
}) => {
  const { t } = useTranslation();
  const wallet = useWallet();
  const { currentAccount } = useRabbySelector((s) => ({
    currentAccount: s.account.currentAccount,
  }));

  const { data } = useRequest(
    async () => {
      const address = currentAccount?.address;
      if (!address) {
        return { address: '', list: [] };
      }
      return {
        address,
        list: await wallet.getRedbellyAccountSummaries(address),
      };
    },
    {
      refreshDeps: [currentAccount?.address, visible, refreshSignal],
      ready: !!currentAccount?.address && visible !== false,
    }
  );

  // Keep showing the last answer while a refresh runs, but never one that
  // belongs to a different account.
  const summaries =
    data &&
    data.address.toLowerCase() === (currentAccount?.address || '').toLowerCase()
      ? data.list
      : undefined;

  const hasBalance = !!summaries?.some(
    (summary) => BigInt(summary.balanceWei ?? '0') > 0n
  );
  React.useEffect(() => {
    onHasBalanceChange?.(hasBalance);
  }, [hasBalance, onHasBalanceChange]);

  // Respect the chain filter: hidden when the user has narrowed to a
  // non-Redbelly chain.
  if (selectChainId && !isRedbellyServerId(selectChainId)) {
    return null;
  }

  if (!summaries?.length) {
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
      <Table className={fluid ? 'w-full mx-0' : undefined}>
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
