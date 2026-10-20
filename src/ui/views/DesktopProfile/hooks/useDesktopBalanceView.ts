import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useHomeBalanceView,
  useRefreshHomeBalanceView,
} from '../../Dashboard/components/BalanceView/useHomeBalanceView';
import { BALANCE_LOADING_CONFS } from '@/constant/timeout';
import useCurrentBalance from '@/ui/hooks/useCurrentBalance';
import { useCurrency } from '@/ui/hooks/useCurrency';
import {
  formChartData,
  useCurve,
} from '../../Dashboard/components/BalanceView/useCurve';

export const useDesktopBalanceView = ({ address }: { address?: string }) => {
  const { currentHomeBalanceCache } = useHomeBalanceView(address);

  const initHasCacheRef = useRef(!!currentHomeBalanceCache);
  const [accountBalanceUpdateNonce, setAccountBalanceUpdateNonce] = useState(
    initHasCacheRef?.current ? -1 : 0
  );

  const [isShowCurveModal, setIsShowCurveModal] = useState(false);

  useEffect(() => {
    if (!initHasCacheRef?.current) return;
    const timer = setTimeout(() => {
      setAccountBalanceUpdateNonce((prev) => prev + 1);
    }, BALANCE_LOADING_CONFS.TIMEOUT);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const {
    balance: latestBalance,
    evmBalance: latestEvmBalance,
    appChainIds: latestAppChainIds,
    matteredChainBalances: latestMatteredChainBalances,
    chainBalancesWithValue: latestChainBalancesWithValue,
    success: loadBalanceSuccess,
    balanceLoading,
    isCurrentBalanceExpired,
    refreshBalance,
    missingList,
  } = useCurrentBalance(address, {
    update: true,
    noNeedBalance: false,
    nonce: accountBalanceUpdateNonce,
    initBalanceFromLocalCache: !!currentHomeBalanceCache,
  });

  const { currency } = useCurrency();

  const {
    curveData: latestCurveData,
    curveChartData: latestCurveChartData,
    refresh: refreshCurve,
    isCurveCollectionExpired,
    isLoading: curveLoading,
  } = useCurve(address, {
    nonce: accountBalanceUpdateNonce,
    realtimeNetWorth: latestEvmBalance,
    initData: currentHomeBalanceCache?.originalCurveData,
    currency,
  });

  const {
    balance,
    evmBalance,
    curveChartData,
    matteredChainBalances,
    chainBalancesWithValue,
    appChainIds,
  } = useMemo(() => {
    const balanceValue = latestBalance ?? currentHomeBalanceCache?.balance;
    const evmBalanceValue =
      latestEvmBalance ?? currentHomeBalanceCache?.evmBalance;
    const appChainIds =
      latestAppChainIds || currentHomeBalanceCache?.appChainIds;
    return {
      balance: balanceValue,
      evmBalance: evmBalanceValue,
      appChainIds,
      curveChartData:
        latestCurveChartData ||
        formChartData(
          currentHomeBalanceCache?.originalCurveData || [],
          undefined,
          undefined,
          currency
        ),
      matteredChainBalances: latestMatteredChainBalances.length
        ? latestMatteredChainBalances
        : currentHomeBalanceCache?.matteredChainBalances || [],
      chainBalancesWithValue: latestChainBalancesWithValue.length
        ? latestChainBalancesWithValue
        : currentHomeBalanceCache?.chainBalancesWithValue || [],
    };
  }, [
    latestBalance,
    latestEvmBalance,
    latestMatteredChainBalances,
    latestChainBalancesWithValue,
    latestCurveChartData,
    currentHomeBalanceCache,
    currency,
  ]);

  const getCacheExpired = useCallback(async () => {
    const res = {
      balanceExpired: await isCurrentBalanceExpired(),
      curveExpired: await isCurveCollectionExpired(),
      expired: false,
    };
    res.expired = res.balanceExpired || res.curveExpired;

    return res;
  }, [isCurrentBalanceExpired, isCurveCollectionExpired]);

  const { isManualRefreshing, onRefresh } = useRefreshHomeBalanceView({
    currentAddress: address,
    refreshBalance,
    refreshCurve,
    isExpired: getCacheExpired,
  });

  const refreshBalanceAndCurveIfExpired = useCallback(async () => {
    const expirationInfo = await getCacheExpired();
    if (!expirationInfo.expired) return;

    await onRefresh({
      balanceExpired: expirationInfo.balanceExpired,
      curveExpired: expirationInfo.curveExpired,
      isManual: false,
    });
  }, [getCacheExpired, onRefresh]);

  // const refreshTimerlegacy = useRef<NodeJS.Timeout>();
  // only execute once on component mounted or address changed
  useEffect(
    () => {
      if (!currentHomeBalanceCache) {
        onRefresh({
          balanceExpired: true,
          curveExpired: true,
          isManual: false,
        });
      } else {
        refreshBalanceAndCurveIfExpired();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const couldShowLoadingDueToBalanceNil = balance === null;
  const couldShowLoadingDueToUpdateSource =
    !currentHomeBalanceCache || isManualRefreshing;

  const isBalanceLoading =
    couldShowLoadingDueToBalanceNil ||
    (couldShowLoadingDueToUpdateSource && balanceLoading);
  const isCurveLoading =
    couldShowLoadingDueToBalanceNil ||
    (couldShowLoadingDueToUpdateSource && curveLoading);
  const isRefreshing =
    balanceLoading || curveLoading || isBalanceLoading || isCurveLoading;

  // The grey placeholder over the amount and the chart is for a first load,
  // when there is nothing to show yet. A refresh keeps the figures on screen
  // and the refresh icon spins instead: Redbelly answers almost at once, so
  // showing the placeholder again only made it flash.
  const isLoadingNow = isBalanceLoading || isCurveLoading;
  const sawLoadingRef = useRef(false);
  const [settledFor, setSettledFor] = useState<string | undefined>();
  const hasCache = !!currentHomeBalanceCache;

  useEffect(() => {
    sawLoadingRef.current = false;
  }, [address]);

  useEffect(() => {
    if (isLoadingNow) {
      sawLoadingRef.current = true;
      return;
    }
    if (sawLoadingRef.current || hasCache) {
      setSettledFor(address);
    }
  }, [isLoadingNow, hasCache, address]);

  const isSkeletonLoading =
    isLoadingNow && !(!!address && settledFor === address);

  return {
    balance,
    evmBalance,
    curveChartData,
    isCurveLoading,
    isBalanceLoading,
    isSkeletonLoading,
    isRefreshing,
    refreshCurve,
    refreshBalance,
    refreshBalanceAndCurveIfExpired,
    appChainIds,
  };
};
