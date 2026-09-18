import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { isRedbellyChainId } from '@/constant/redbelly';
import { useRedbellyStore } from '@/ui/state/redbelly';
import type { Verdict } from '@/utils/redbelly/verdict';
import { SubCol, SubRow } from './SubTable';

/**
 * The Redbelly KYC verdict for a transaction's recipient (FR1 / US1-US4).
 *
 * Rendered as an ordinary `SubCol`/`SubRow` pair inside the recipient
 * `SubTable`, the same as the `addressNote` and `addressTypeTitle` rows beside
 * it, so it reads as part of Rabby's existing confirmation screen rather than
 * a bolt-on. It deliberately does not fake a security-engine `Result`: the
 * engine's rules live in the `@rabby-wallet/rabby-security-engine` package,
 * and a synthesised result would render a level tag whose drawer has no rule
 * to open.
 */

type Tone = 'safe' | 'danger' | 'warning' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  safe: 'text-r-green-default',
  danger: 'text-r-red-default',
  warning: 'text-r-orange-default',
  neutral: '',
};

const VERDICT_TONE: Record<Verdict, Tone> = {
  REGISTERED: 'safe',
  NOT_REGISTERED: 'danger',
  // Neutral on purpose. Contracts never complete identity verification, so
  // every legitimately deployed contract reports isAllowed == false; colouring
  // this would fire a false alarm on every token transfer.
  CONTRACT: 'neutral',
  UNKNOWN: 'warning',
};

const VERDICT_LABEL_KEY: Record<Verdict, string> = {
  REGISTERED: 'page.signTx.redbelly.registered',
  NOT_REGISTERED: 'page.signTx.redbelly.notRegistered',
  CONTRACT: 'page.signTx.redbelly.contract',
  UNKNOWN: 'page.signTx.redbelly.unknown',
};

const VERDICT_TIP_KEY: Record<Verdict, string> = {
  REGISTERED: 'page.signTx.redbelly.registeredTip',
  NOT_REGISTERED: 'page.signTx.redbelly.notRegisteredTip',
  CONTRACT: 'page.signTx.redbelly.contractTip',
  UNKNOWN: 'page.signTx.redbelly.unknownTip',
};

export const RedbellyRecipientCheck = ({
  chainId,
  address,
}: {
  chainId?: number | null;
  address?: string | null;
}) => {
  const { t } = useTranslation();
  const recipient = useRedbellyStore(
    useShallow((state) => state.currentTx.recipient)
  );
  const checkRecipient = useRedbellyStore((state) => state.checkRecipient);

  // Self-triggering, so the row works wherever a send action is rendered -
  // the full signing screen and the mini sign flows alike. The store
  // de-duplicates by recipient, so SignTx kicking off the same check for the
  // sign-button gate costs nothing.
  React.useEffect(() => {
    checkRecipient(chainId, address);
  }, [checkRecipient, chainId, address]);

  // FR4/US5: render nothing at all off Redbelly, so other networks are
  // untouched.
  if (!isRedbellyChainId(chainId) || !address) {
    return null;
  }

  // The store is keyed to one recipient at a time. While a different one is
  // resolving, show the pending state rather than the previous answer.
  const isCurrent =
    recipient.address?.toLowerCase() === address.toLowerCase() &&
    recipient.chainId === Number(chainId);
  const verdict = isCurrent ? recipient.verdict : null;

  const tip = verdict
    ? t(VERDICT_TIP_KEY[verdict])
    : t('page.signTx.redbelly.recipientTip');

  return (
    <SubCol>
      <SubRow isTitle tip={tip}>
        {t('page.signTx.redbelly.recipientTitle')}
      </SubRow>
      <SubRow>
        {verdict ? (
          <span className={clsx(TONE_CLASS[VERDICT_TONE[verdict]])}>
            {t(VERDICT_LABEL_KEY[verdict])}
          </span>
        ) : (
          <span className="text-r-neutral-foot">
            {t('page.signTx.redbelly.checking')}
          </span>
        )}
      </SubRow>
    </SubCol>
  );
};
