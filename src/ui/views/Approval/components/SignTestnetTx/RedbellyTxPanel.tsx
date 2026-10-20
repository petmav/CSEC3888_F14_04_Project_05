import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import BigNumber from 'bignumber.js';

import { gasUnitsToUsd } from '@/utils/redbelly/fees';
import type { PaymentTarget } from '@/utils/redbelly/recipient';
import type { Verdict } from '@/utils/redbelly/verdict';
import { formatTokenAmount } from '@/ui/utils/number';
import { useRedbellyCurrency } from '@/ui/hooks/useRedbellyCurrency';
import { Card } from '../Card';
import { ReactComponent as RcIconCheckboxChecked } from '@/ui/assets/send-token/icon-checkbox-checked.svg';
import { ReactComponent as RcIconCheckboxUncheck } from '@/ui/assets/send-token/icon-checkbox-uncheck.svg';
import type { RedbellyTxGate } from './useRedbellyTxGate';
import type { EstimateFailure } from '@/utils/redbelly/estimate';

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

const PAYING_KEY: Record<Exclude<PaymentTarget['kind'], 'none'>, string> = {
  native: 'paying',
  token: 'payingToken',
  approval: 'approving',
  call: 'calling',
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
  gasLimitLowered = false,
  estimateFailure = null,
}: {
  gate: RedbellyTxGate;
  chain: { name: string; logo: string; nativeTokenSymbol: string };
  gasUsed?: string | number | null;
  gasPrice?: string | number | null;
  /** The registration call's gas limit was lowered to fit the balance. */
  gasLimitLowered?: boolean;
  /** Why the gas estimate failed, if it did. */
  estimateFailure?: EstimateFailure | null;
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
                  {t(`page.signTx.redbelly.${PAYING_KEY[target.kind]}`)}
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
                  {target.kind === 'approval' && verdict === 'NOT_REGISTERED'
                    ? t('page.signTx.redbelly.notRegisteredSpenderTip')
                    : t(`page.signTx.redbelly.${VERDICT_KEY[verdict]}Tip`)}
                </div>
              ) : null}
            </div>
            {gate.blocked ? (
              <div
                className="text-12 font-medium text-r-red-default mt-6"
                data-testid="redbelly-blocked"
              >
                {t('page.signTx.redbelly.blockedNote')}
              </div>
            ) : null}
            {gate.familiarity?.kind === 'lookalike' ? (
              <div
                className="text-12 text-r-red-default mt-6 break-all"
                data-testid="redbelly-lookalike"
              >
                {t('page.signTx.redbelly.lookalike', {
                  address: gate.familiarity.similarTo,
                })}
              </div>
            ) : null}
            {gate.familiarity?.kind === 'new' && verdict !== 'CONTRACT' ? (
              gate.historyComplete ? (
                <div
                  className="text-12 text-r-neutral-foot mt-6"
                  data-testid="redbelly-first-time"
                >
                  {t('page.signTx.redbelly.firstTime')}
                </div>
              ) : (
                <div
                  className="text-12 text-r-orange-default mt-6"
                  data-testid="redbelly-history-incomplete"
                >
                  {t('page.signTx.redbelly.historyIncomplete')}
                </div>
              )
            ) : null}
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
            {target.kind === 'approval' ? (
              <div className="text-12 text-r-orange-default mt-6 break-all">
                {t('page.signTx.redbelly.approvalNote', {
                  address: target.token,
                })}
              </div>
            ) : null}
            {/* A contract can pass funds on to anyone; say what the check
                could not see rather than let "Contract address" read as
                "checked, all fine". */}
            {target.kind === 'call' && verdict === 'CONTRACT' ? (
              <div
                className="text-12 text-r-orange-default mt-6"
                data-testid="redbelly-call-note"
              >
                {t('page.signTx.redbelly.callNote')}
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
            gate.isRegistration ? (
              <div
                className="text-12 text-r-neutral-body mb-4"
                data-testid="redbelly-registration-note"
              >
                {t('page.signTx.redbelly.senderRegistrationNote')}
              </div>
            ) : (
              <div className="text-12 text-r-orange-default mb-4">
                {t('page.signTx.redbelly.senderNotRegisteredWarning')}
              </div>
            )
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
          {estimateFailure === 'reverted' ? (
            <div
              className="text-12 text-r-red-default mt-4"
              data-testid="redbelly-estimate-reverted"
            >
              {t('page.signTx.redbelly.estimateReverted')}
            </div>
          ) : null}
          {estimateFailure === 'unavailable' ? (
            <div
              className="text-12 text-r-red-default mt-4"
              data-testid="redbelly-estimate-unavailable"
            >
              {t('page.signTx.redbelly.estimateUnavailable')}
            </div>
          ) : null}
          {gasLimitLowered ? (
            <div
              className="text-12 text-r-orange-default mt-4"
              data-testid="redbelly-gas-limit-lowered"
            >
              {t('page.signTx.redbelly.gasLimitLowered')}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
};
