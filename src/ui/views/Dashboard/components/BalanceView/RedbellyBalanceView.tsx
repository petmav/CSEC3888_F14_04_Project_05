import { Skeleton } from 'antd';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { Account } from '@/background/service/preference';
import { REDBELLY_MAINNET_CHAIN_ID } from '@/constant/redbelly';
import { useRedbellyPortfolio } from '@/ui/hooks/useRedbellyPortfolio';
import { useWallet } from '@/ui/utils';
import { formatTokenAmount } from '@/ui/utils/number';
import { useRedbellyCurrency } from '@/ui/hooks/useRedbellyCurrency';

const rbnt = (value: BigNumber) => `${formatTokenAmount(value.toFixed())} RBNT`;

/**
 * The home page balance for a Redbelly-only wallet (M10: FR2, FR5, US8, US9,
 * US13).
 *
 * Replaces Rabby's DeBank portfolio card, which reads $0 for every Redbelly
 * holding because DeBank has no Redbelly prices. Everything here comes from
 * a Redbelly node: the RBNT balance, the stake in the RBNT pools, and the
 * dollar value at Redbelly's own on-chain price feed.
 *
 * Two rules from the Snap stage carry over. A node that does not answer is
 * shown as unavailable, never as 0 RBNT, because a failed read that looks
 * like an empty account is the original bug (US8). And a dollar figure that
 * cannot be backed - no price, stale price - is left out rather than shown
 * as $0 (US7).
 */
export const RedbellyBalanceView = ({
  currentAccount,
}: {
  currentAccount?: Account | null;
}) => {
  const { t } = useTranslation();
  const wallet = useWallet();
  const portfolio = useRedbellyPortfolio(currentAccount?.address);
  const { format } = useRedbellyCurrency();

  const mainnet = portfolio.summaries.find(
    (item) => item.chainId === REDBELLY_MAINNET_CHAIN_ID
  );

  return (
    <div
      className={clsx(
        'w-full min-h-[120px] rounded-[8px] px-[16px] py-[12px] cursor-pointer',
        'bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)]'
      )}
      onClick={() => {
        wallet.openInDesktop('/desktop/profile');
        window.close();
      }}
      data-testid="redbelly-balance-card"
    >
      {portfolio.loading ? (
        <Skeleton.Input active className="w-[160px] h-[38px] rounded-[6px]" />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-r-neutral-title2 opacity-80">
              {t('page.dashboard.redbelly.portfolio')}
            </div>
            <KycChip isRegistered={mainnet?.isRegistered ?? null} />
          </div>

          <div className="flex items-center gap-[8px] mt-[4px]">
            <div className="text-[30px] leading-[36px] font-bold text-r-neutral-title2">
              {portfolio.totalUsd
                ? format(portfolio.totalUsd)
                : mainnet?.unavailable
                ? t('page.dashboard.redbelly.unavailable')
                : portfolio.mainnetRbnt
                ? rbnt(portfolio.mainnetRbnt.plus(portfolio.stakedRbnt))
                : '-'}
            </div>
          </div>

          {/* Side by side, not stacked: the tile grid overlaps the bottom
              of the banner, so the card has a fixed height to work in. */}
          <div className="mt-[10px] flex gap-[16px] text-r-neutral-title2">
            <div className="min-w-0">
              <div className="text-[12px] opacity-70">
                {t('page.dashboard.redbelly.available')}
              </div>
              <div className="text-[13px] font-medium truncate">
                {portfolio.mainnetRbnt
                  ? rbnt(portfolio.mainnetRbnt)
                  : t('page.dashboard.redbelly.unavailable')}
              </div>
            </div>
            {portfolio.stakedRbnt.gt(0) || portfolio.stakingUnavailable ? (
              <div className="min-w-0">
                <div className="text-[12px] opacity-70">
                  {t('page.dashboard.redbelly.stakedWithRewards')}
                </div>
                <div className="text-[13px] font-medium truncate">
                  {portfolio.stakingUnavailable && portfolio.stakedRbnt.eq(0)
                    ? t('page.dashboard.redbelly.unavailable')
                    : rbnt(portfolio.stakedRbnt)}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

const KycChip = ({ isRegistered }: { isRegistered: boolean | null }) => {
  const { t } = useTranslation();
  if (isRegistered === null) {
    return null;
  }
  return (
    <div
      className={clsx(
        'text-[12px] px-[8px] py-[2px] rounded-[10px] font-medium',
        isRegistered
          ? 'bg-[rgba(39,193,103,0.25)] text-white'
          : 'bg-[rgba(236,81,81,0.85)] text-white'
      )}
      title={
        isRegistered
          ? undefined
          : t('page.dashboard.assets.redbelly.kycNotRegisteredTip')
      }
    >
      {isRegistered
        ? t('page.dashboard.assets.redbelly.kycRegistered')
        : t('page.dashboard.assets.redbelly.kycNotRegistered')}
    </div>
  );
};
