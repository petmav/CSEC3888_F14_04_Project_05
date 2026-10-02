import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import BigNumber from 'bignumber.js';

import { gasUnitsToUsd } from '@/utils/redbelly/fees';
import type { Verdict } from '@/utils/redbelly/verdict';
import { formatTokenAmount } from '@/ui/utils/number';
import { useRedbellyCurrency } from '@/ui/hooks/useRedbellyCurrency';
import { Card } from '../Card';
import { ReactComponent as RcIconCheckboxChecked } from '@/ui/assets/send-token/icon-checkbox-checked.svg';
import { ReactComponent as RcIconCheckboxUncheck } from '@/ui/assets/send-token/icon-checkbox-uncheck.svg';
import type { RedbellyTxGate } from './useRedbellyTxGate';

type Tone = 'safe' | 'danger' | 'warning' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  safe: 'text-r-green-default',
  danger: 'text-r-red-default',
  warning: 'text-r-orange-default',
  neutral: 'text-r-neutral-title1',
};

const TONE_BOX: Record<Tone, string> = {
  safe: 'bg-r-green-light',
  danger: 'bg-r-red-light',
  warning: 'bg-r-orange-light',
  neutral: 'bg-r-neutral-card2',
};

const VERDICT_TONE: Record<Verdict, Tone> = {
  REGISTERED: 'safe',
  NOT_REGISTERED: 'danger',
  // Neutral on purpose: every legitimately deployed contract reports
  // isAllowed == false, so colouring this would cry wolf on every contract
  // call (US3).
  CONTRACT: 'neutral',
  UNKNOWN: 'warning',
};

const VERDICT_KEY: Record<Verdict, string> = {
  REGISTERED: 'registered',
  NOT_REGISTERED: 'notRegistered',
  CONTRACT: 'contract',
  UNKNOWN: 'unknown',
};

const Row: React.FC<React.PropsWithChildren<{ label: React.ReactNode }>> = ({
  label,
  children,
}) => (
  <div className="flex justify-between items-start gap-12 py-[6px]">
    <div className="text-13 text-r-neutral-body shrink-0">{label}</div>
    <div className="text-13 text-right text-r-neutral-title1 min-w-0">
      {children}
    </div>
  </div>
);

/**
 * The Redbelly checks for a transaction, shown above Rabby's own breakdown
 * (FR1, FR3, FR5).
 *
 * The payee is printed in full, not shortened: the point of the check is to
 * let a user compare the address against the one they meant, and the
 * characters a shortened address hides are exactly where a typo would be.
 */
export const RedbellyTxPanel = ({
  gate,
  chain,
  gasUsed,
  gasPrice,
}: {
  gate: RedbellyTxGate;
  chain: { name: string; logo: string; nativeTokenSymbol: string };
  gasUsed?: string | number | null;
  gasPrice?: string | number | null;
}) => {
  const { t } = useTranslation();
  const { format } = useRedbellyCurrency();

  if (!gate.isRedbelly) {
    return null;
  }

  const { target, verdict, checking, senderRegistered, usdPerGas } = gate;
  const tone: Tone = verdict ? VERDICT_TONE[verdict] : 'neutral';

  const feeRbnt =
    gasUsed && gasPrice
      ? new BigNumber(gasUsed.toString())
          .times(new BigNumber(gasPrice.toString()))
          .div(1e18)
      : null;
  const feeUsd = gasUsed ? gasUnitsToUsd(Number(gasUsed), usdPerGas) : null;

  return (
    <Card className="mb-12">
      <div className="px-16 pt-12 pb-[6px] flex items-center justify-between">
        <div className="text-15 font-medium text-r-neutral-title1">
          {t('page.signTx.redbelly.panelTitle')}
        </div>
        <div className="flex items-center gap-6 text-12 text-r-neutral-foot">
          <img src={chain.logo} className="w-14 h-14 rounded-full" alt="" />
          {chain.name}
        </div>
      </div>
      <div className="px-16 pb-12">
        {target.kind === 'none' ? (
          <Row label={t('page.signTx.redbelly.paying')}>
            {t('page.signTx.redbelly.contractCreation')}
          </Row>
        ) : (
          <>
            <div
              className={clsx('rounded-[6px] p-10 mt-[6px]', TONE_BOX[tone])}
              data-testid="redbelly-verdict"
            >
              <div className="flex items-center justify-between gap-8">
                <div className="text-12 text-r-neutral-body">
                  {target.kind === 'token'
                    ? t('page.signTx.redbelly.payingToken')
                    : t('page.signTx.redbelly.paying')}
                </div>
                <div
                  className={clsx(
                    'text-13 font-medium',
                    checking ? 'text-r-neutral-foot' : TONE_TEXT[tone]
                  )}
                >
                  {verdict
                    ? t(`page.signTx.redbelly.${VERDICT_KEY[verdict]}`)
                    : t('page.signTx.redbelly.checking')}
                </div>
              </div>
              <div className="text-13 text-r-neutral-title1 break-all font-mono mt-4">
                {target.recipient}
              </div>
              {verdict ? (
                <div className={clsx('text-12 mt-6', TONE_TEXT[tone])}>
                  {t(`page.signTx.redbelly.${VERDICT_KEY[verdict]}Tip`)}
                </div>
              ) : null}
            </div>
            {gate.needsAcknowledgement ? (
              <div
                className="flex items-center gap-8 mt-8 cursor-pointer"
                data-testid="redbelly-acknowledge"
                onClick={() => gate.setAcknowledged(!gate.acknowledged)}
              >
                {gate.acknowledged ? (
                  <RcIconCheckboxChecked width={20} height={20} />
                ) : (
                  <RcIconCheckboxUncheck width={20} height={20} />
                )}
                <span className="text-13 text-r-neutral-title1">
                  {t('page.sendToken.riskAlert.checkboxText')}
                </span>
              </div>
            ) : null}
            {target.kind === 'token' ? (
              <div className="text-12 text-r-neutral-foot mt-6 break-all">
                {t('page.signTx.redbelly.tokenContract', {
                  address: target.token,
                })}
              </div>
            ) : null}
          </>
        )}

        <div className="mt-6">
          <Row label={t('page.signTx.redbelly.yourAccount')}>
            {senderRegistered === null ? (
              <span className="text-r-neutral-foot">
                {t('page.signTx.redbelly.unknown')}
              </span>
            ) : senderRegistered ? (
              <span className="text-r-green-default">
                {t('page.signTx.redbelly.registered')}
              </span>
            ) : (
              <span className="text-r-red-default">
                {t('page.signTx.redbelly.senderNotRegistered')}
              </span>
            )}
          </Row>
          {senderRegistered === false ? (
            <div className="text-12 text-r-orange-default mb-4">
              {t('page.signTx.redbelly.senderNotRegisteredWarning')}
            </div>
          ) : null}
          <Row label={t('page.signTx.redbelly.networkFee')}>
            {feeRbnt ? (
              <>
                {formatTokenAmount(feeRbnt.toFixed())} {chain.nativeTokenSymbol}
                {feeUsd !== null ? (
                  <span className="text-r-neutral-foot">
                    {' '}
                    (≈{format(feeUsd)})
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-r-neutral-foot">-</span>
            )}
          </Row>
          <div className="text-12 text-r-neutral-foot">
            {t('page.signTx.redbelly.feeNote')}
          </div>
        </div>
      </div>
    </Card>
  );
};
