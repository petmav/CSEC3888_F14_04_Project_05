import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRedbellyPortfolio } from '@/ui/hooks/useRedbellyPortfolio';
import { useRabbySelector } from '@/ui/store';
import { CustomTestnetAssetList } from './CustomTestnetAssetList';
import { RedbellyAssetSection } from './RedbellyAssetSection';
import { RedbellyStakingSection } from './RedbellyStakingSection';
import { TestnetChainList } from './TestnetChainList';

/**
 * The asset list of a Redbelly-only wallet (US8, US9, US13).
 *
 * Rabby's own list has a DeBank "mainnet" tab and a custom-network tab. The
 * DeBank tab has nothing to show for Redbelly, so this is the custom-network
 * list promoted to the whole view: RBNT and KYC status per network, then
 * tokens read from the node, then stake.
 */
export const RedbellyAssetList = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose?(): void;
}) => {
  const { t } = useTranslation();
  const [selectChainId, setSelectChainId] = useState<string | null>(null);
  const currentAccount = useRabbySelector((s) => s.account.currentAccount);
  const portfolio = useRedbellyPortfolio(
    visible ? currentAccount?.address : undefined
  );

  return (
    <div className="pt-[12px] h-full overflow-auto">
      <div className="px-[20px] pb-[20px]">
        <RedbellyAssetSection visible={visible} className="mt-0" />

        <div className="mt-16 px-4">
          <div className="text-r-neutral-title-1 text-13 font-medium">
            {t('page.dashboard.redbelly.tokensTitle')}
          </div>
          <div className="text-r-neutral-foot text-12">
            {t('page.dashboard.redbelly.tokensSubtitle')}
          </div>
        </div>
        <div className="mt-8">
          <TestnetChainList onChange={setSelectChainId} />
        </div>
        <CustomTestnetAssetList
          selectChainId={selectChainId}
          visible={visible}
          onClose={onClose}
        />

        <RedbellyStakingSection
          positions={portfolio.staking}
          unavailable={portfolio.stakingUnavailable}
          rbntUsd={portfolio.rbntUsd}
        />
      </div>
    </div>
  );
};
