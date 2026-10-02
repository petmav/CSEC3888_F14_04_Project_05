import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import dayjs from 'dayjs';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { RedbellyStakingSummary } from '@/background/service/redbelly';
import { REDBELLY_STAKING_URL } from '@/constant/redbelly-assets';
import { openInTab } from '@/ui/utils';
import { formatTokenAmount } from '@/ui/utils/number';
import { useRedbellyCurrency } from '@/ui/hooks/useRedbellyCurrency';

const rbnt = (wei: string) =>
  `${formatTokenAmount(new BigNumber(wei).div(1e18).toFixed())} RBNT`;

const Line = ({
  label,
  value,
  muted,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  muted?: boolean;
}) => (
  <div className="flex justify-between text-13 py-[3px]">
    <span className="text-r-neutral-foot">{label}</span>
    <span
      className={clsx(
        muted ? 'text-r-neutral-foot' : 'text-r-neutral-title1',
        'text-right'
      )}
    >
      {value}
    </span>
  </div>
);

/**
 * Staked RBNT, per pool (US13).
 *
 * Read-only on purpose. Staking, unstaking and claiming are contract calls a
 * user makes on the pool's own site, through the wallet's normal signing
 * screen and its checks; duplicating those flows here would be a second,
 * less-reviewed route to moving funds.
 */
export const RedbellyStakingSection = ({
  positions,
  unavailable,
  rbntUsd,
  className,
}: {
  positions: RedbellyStakingSummary[];
  unavailable: boolean;
  rbntUsd: number | null;
  className?: string;
}) => {
  const { t } = useTranslation();
  const { format } = useRedbellyCurrency();

  if (!positions.length && !unavailable) {
    return null;
  }

  return (
    <div className={clsx('mt-16', className)} data-testid="redbelly-staking">
      <div className="flex items-end justify-between px-4 mb-8">
        <div>
          <div className="text-r-neutral-title-1 text-13 font-medium">
            {t('page.dashboard.redbelly.stakingTitle')}
          </div>
          <div className="text-r-neutral-foot text-12">
            {t('page.dashboard.redbelly.stakingSubtitle')}
          </div>
        </div>
        <span
          className="text-12 text-r-blue-default cursor-pointer"
          onClick={() => openInTab(REDBELLY_STAKING_URL)}
        >
          {t('page.dashboard.redbelly.manageStake')}
        </span>
      </div>

      {unavailable ? (
        <div className="text-12 text-r-orange-default px-4 mb-8">
          {t('page.dashboard.redbelly.stakingUnavailable')}
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {positions.map((position) => {
          const stakedUsd =
            rbntUsd === null
              ? null
              : new BigNumber(position.staked)
                  .plus(position.rewards)
                  .div(1e18)
                  .times(rbntUsd);
          return (
            <div
              key={position.pool.address}
              className="rounded-[8px] bg-r-neutral-card1 px-12 py-10"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="text-14 font-medium text-r-neutral-title1">
                  {position.pool.name}
                </div>
                <div className="text-12 text-r-green-default">
                  {t('page.dashboard.redbelly.apr', {
                    apr: position.aprPercent.toFixed(2),
                  })}
                </div>
              </div>
              <Line
                label={t('page.dashboard.redbelly.staked')}
                value={
                  <>
                    {rbnt(position.staked)}
                    {stakedUsd ? (
                      <span className="text-r-neutral-foot">
                        {' '}
                        ≈{format(stakedUsd)}
                      </span>
                    ) : null}
                  </>
                }
              />
              <Line
                label={t('page.dashboard.redbelly.rewards')}
                value={rbnt(position.rewards)}
              />
              {position.pool.hasLockPeriod ? (
                <>
                  <Line
                    label={t('page.dashboard.redbelly.withdrawable')}
                    value={rbnt(position.withdrawable)}
                  />
                  <Line
                    label={t('page.dashboard.redbelly.locked')}
                    value={rbnt(position.locked)}
                  />
                  {position.nextUnlock ? (
                    <Line
                      muted
                      label={t('page.dashboard.redbelly.nextUnlock')}
                      value={t('page.dashboard.redbelly.nextUnlockValue', {
                        amount: rbnt(position.nextUnlock.amount),
                        date: dayjs
                          .unix(position.nextUnlock.timestamp)
                          .format('D MMM YYYY'),
                      })}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
