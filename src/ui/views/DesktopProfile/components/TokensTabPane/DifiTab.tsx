import React, { useEffect } from 'react';
import ProtocolList from './ProtocolList';
import { useTranslation } from 'react-i18next';
import { AbstractProject } from '@/ui/utils/portfolio/types';
import { useExpandList } from './useExpandList';
import ProjectOverview from './ProjectOverview';
import { TokenListEmpty } from './TokenListEmpty';
import { DisplayedProject } from '@/ui/utils/portfolio/project';
import styled from 'styled-components';
import { TokenListViewSkeleton } from '@/ui/views/CommonPopup/AssetList/TokenListViewSkeleton';
import { HomePerpsPositionList } from '@/ui/views/CommonPopup/AssetList/HomePerpsPositionList';
import { REDBELLY_ONLY } from '@/constant/redbelly';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { useRedbellyPortfolio } from '@/ui/hooks/useRedbellyPortfolio';
import { RedbellyStakingSection } from '@/ui/views/CommonPopup/AssetList/RedbellyStakingSection';

const ListContainer = styled.div`
  background-color: var(--rb-neutral-bg-3, #f9f9f9);
  border-radius: 16px;
  padding: 16px;
  margin: 0 20px 20px;
`;

interface Props {
  onProjectOverviewListChange?: (projects: AbstractProject[]) => void;
  appIds: string[];
  displayPortfolios: DisplayedProject[];
  currentPortfolioNetWorth: number;
  isLoading: boolean;
  isNoResults: boolean;
  removeProtocol: (id: string) => void;
}

const DebankDifiTab = ({
  appIds,
  displayPortfolios,
  currentPortfolioNetWorth,
  removeProtocol,
  isLoading,
  isNoResults,
  onProjectOverviewListChange,
}: Props) => {
  const { t } = useTranslation();

  const {
    isExpanded,
    result: currentList,
    toggleExpand,
    hasExpandSwitch,
    smallLength,
  } = useExpandList(displayPortfolios, currentPortfolioNetWorth);

  const projectOverviewList = React.useMemo(() => {
    return [
      // getTokenWalletFakeProject(
      //   tokenListTotalValue,
      //   t('page.desktopProfile.portfolio.headers.wallet')
      // ),
      ...(currentList || []),
    ];
  }, [currentList]);

  useEffect(() => {
    if (isNoResults || projectOverviewList?.length <= 0) {
      onProjectOverviewListChange?.([]);
      return;
    }
    if (projectOverviewList) {
      onProjectOverviewListChange?.(projectOverviewList);
    }
  }, [projectOverviewList.length, isNoResults]);

  if (isLoading) {
    return (
      <div className="mx-20">
        <TokenListViewSkeleton />
      </div>
    );
  }

  if (!currentList?.length && !isLoading) {
    return (
      <ListContainer className="mt-20">
        <TokenListEmpty text={t('page.dashboard.assets.table.noMatch')} />
      </ListContainer>
    );
  }

  return (
    <>
      {!isNoResults && projectOverviewList?.length > 0 && (
        <ProjectOverview
          list={projectOverviewList}
          appIds={appIds}
          isExpanded={isExpanded}
          smallLength={smallLength}
          toggleExpand={toggleExpand}
          hasExpandSwitch={hasExpandSwitch}
          filterWallet
        />
      )}
      <HomePerpsPositionList needFetchMarket />
      <ProtocolList
        removeProtocol={removeProtocol}
        appIds={appIds}
        list={currentList}
        isExpanded={isExpanded}
        toggleExpand={toggleExpand}
        hasExpandSwitch={hasExpandSwitch}
      />
    </>
  );
};

/**
 * The DeFi tab on Redbelly.
 *
 * DeBank, which feeds the tab elsewhere, knows nothing about Redbelly, so its
 * protocol list is always empty and (before it was switched off) never
 * finished loading. Redbelly's DeFi is staking, read from the pools
 * themselves, so that is what the tab shows.
 */
const RedbellyDifiTab = ({
  onProjectOverviewListChange,
}: Pick<Props, 'onProjectOverviewListChange'>) => {
  const { t } = useTranslation();
  const currentAccount = useCurrentAccount();
  const portfolio = useRedbellyPortfolio(currentAccount?.address);

  // The shortcut rail beside the list is for DeBank protocols; clear it.
  useEffect(() => {
    onProjectOverviewListChange?.([]);
  }, []);

  if (portfolio.loading) {
    return (
      <div className="mx-20">
        <TokenListViewSkeleton />
      </div>
    );
  }

  if (!portfolio.staking.length && !portfolio.stakingUnavailable) {
    return (
      <ListContainer className="mt-20">
        <TokenListEmpty
          text={t('page.dashboard.redbelly.noDefiPositions', {
            defaultValue: 'No DeFi positions yet',
          })}
        />
      </ListContainer>
    );
  }

  return (
    <div className="mx-20 mb-20">
      <RedbellyStakingSection
        positions={portfolio.staking}
        unavailable={portfolio.stakingUnavailable}
        rbntUsd={portfolio.rbntUsd}
      />
    </div>
  );
};

export const DIFITab = (props: Props) =>
  REDBELLY_ONLY ? (
    <RedbellyDifiTab
      onProjectOverviewListChange={props.onProjectOverviewListChange}
    />
  ) : (
    <DebankDifiTab {...props} />
  );
