import { useRequest } from 'ahooks';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import dayjs from 'dayjs';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { RedbellyActivityItem } from '@/background/service/redbelly';
import {
  REDBELLY_EXPLORER_HOSTS,
  REDBELLY_MAINNET_CHAIN_ID,
} from '@/constant/redbelly';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { ellipsisAddress } from '@/ui/utils/address';
import { formatTokenAmount } from '@/ui/utils/number';
import { openInTab, useWallet } from 'ui/utils';
import { TestnetTransactionHistory } from '../TransactionHistory/TestnetTranasctionHistory';

const ActivityRow = ({
  item,
  self,
}: {
  item: RedbellyActivityItem;
  self: string;
}) => {
  const { t } = useTranslation();
  const outgoing = item.from === self;
  const counterparty = outgoing ? item.to : item.from;
  const amount = new BigNumber(item.value).div(
    new BigNumber(10).pow(item.decimals)
  );
  const isCall = item.kind === 'native' && amount.isZero();

  return (
    <div
      className="flex items-center justify-between gap-12 px-16 py-12 bg-r-neutral-card1 rounded-[8px] cursor-pointer hover:bg-r-blue-light1"
      onClick={() =>
        openInTab(
          `${REDBELLY_EXPLORER_HOSTS[REDBELLY_MAINNET_CHAIN_ID]}/tx/${item.hash}`
        )
      }
    >
      <div className="min-w-0">
        <div className="text-14 font-medium text-r-neutral-title1">
          {isCall
            ? item.method || t('page.transactions.redbelly.contractCall')
            : outgoing
            ? t('page.transactions.redbelly.sent')
            : t('page.transactions.redbelly.received')}
          {item.failed ? (
            <span className="ml-6 text-12 text-r-red-default">
              {t('page.transactions.redbelly.failed')}
            </span>
          ) : null}
        </div>
        <div className="text-12 text-r-neutral-foot">
          {outgoing
            ? t('page.transactions.redbelly.to', {
                address: ellipsisAddress(counterparty),
              })
            : t('page.transactions.redbelly.from', {
                address: ellipsisAddress(counterparty),
              })}
          {' · '}
          {dayjs.unix(item.timestamp).format('D MMM YYYY HH:mm')}
        </div>
      </div>
      {isCall ? null : (
        <div
          className={clsx(
            'text-14 font-medium whitespace-nowrap',
            outgoing ? 'text-r-neutral-title1' : 'text-r-green-default'
          )}
        >
          {outgoing ? '-' : '+'}
          {formatTokenAmount(amount.toFixed())} {item.symbol}
        </div>
      )}
    </div>
  );
};

/**
 * Transaction history for a Redbelly-only wallet.
 *
 * Mainnet activity, incoming included, comes from Redbelly's block explorer:
 * DeBank, Rabby's usual source, has nothing for Redbelly. Testnet has no
 * explorer API we can rely on, so it shows what this wallet itself sent.
 */
export const RedbellyHistory = () => {
  const { t } = useTranslation();
  const wallet = useWallet();
  const account = useCurrentAccount();
  const self = account?.address?.toLowerCase() || '';

  const { data, loading } = useRequest(() => wallet.getRedbellyActivity(self), {
    refreshDeps: [self],
    ready: !!self,
  });

  return (
    <div className="h-full overflow-auto px-20 pb-20">
      <div className="mt-8 mb-8">
        <div className="text-13 font-medium text-r-neutral-title1">
          {t('page.transactions.redbelly.mainnetTitle')}
        </div>
        <div className="text-12 text-r-neutral-foot">
          {t('page.transactions.redbelly.mainnetSubtitle')}
        </div>
      </div>
      {loading ? (
        <div className="text-13 text-r-neutral-foot py-12">
          {t('page.transactions.redbelly.loading')}
        </div>
      ) : data === null ? (
        <div className="text-13 text-r-orange-default py-12">
          {t('page.transactions.redbelly.unavailable')}
        </div>
      ) : data?.length ? (
        <div className="flex flex-col gap-8" data-testid="redbelly-activity">
          {data.map((item) => (
            <ActivityRow
              key={`${item.hash}-${item.kind}-${item.symbol}`}
              item={item}
              self={self}
            />
          ))}
        </div>
      ) : (
        <div className="text-13 text-r-neutral-foot py-12">
          {t('page.transactions.redbelly.empty')}
        </div>
      )}

      <div className="mt-20 mb-8">
        <div className="text-13 font-medium text-r-neutral-title1">
          {t('page.transactions.redbelly.localTitle')}
        </div>
        <div className="text-12 text-r-neutral-foot">
          {t('page.transactions.redbelly.localSubtitle')}
        </div>
      </div>
      <TestnetTransactionHistory />
    </div>
  );
};
