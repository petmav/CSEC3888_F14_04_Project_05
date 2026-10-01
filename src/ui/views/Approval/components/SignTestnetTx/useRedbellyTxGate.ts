import { useEffect, useMemo } from 'react';
import { useRequest } from 'ahooks';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { isRedbellyChainId } from '@/constant/redbelly';
import { useRedbellyStore } from '@/ui/state/redbelly';
import { useWallet } from '@/ui/utils';
import { paymentTarget, PaymentTarget } from '@/utils/redbelly/recipient';
import { blocksSigning, Verdict } from '@/utils/redbelly/verdict';

export type RedbellyTxGate = {
  isRedbelly: boolean;
  /** Who the transaction pays, decoded locally from `to` and calldata. */
  target: PaymentTarget;
  /** The verdict for `target`, or null while it is being checked. */
  verdict: Verdict | null;
  checking: boolean;
  /** Whether the signer is KYC registered; null if unknown or not checked. */
  senderRegistered: boolean | null;
  /** US dollars per unit of gas, or null if the peg could not be read. */
  usdPerGas: number | null;
  /** Why signing is refused, or null if it may proceed. */
  blockReason: string | null;
};

/**
 * Everything the signing screen needs to decide about a Redbelly transaction
 * (FR1, FR3, FR5, FR7).
 *
 * The payee is decoded here, from the raw transaction, rather than taken from
 * a parsed action. On Rabby's integrated path the parse comes from DeBank's
 * servers, and when that parse failed the recipient came back empty and the
 * check never ran - a gate that opens when its input goes missing. Decoding
 * locally means there is always an answer: a recipient, or "contract
 * creation", which has nobody to check.
 *
 * Signing is refused, fail-closed, while:
 * - the recipient check has not come back - the user cannot outrun it;
 * - the recipient is a confirmed unregistered account (US12);
 * - the signer is a confirmed unregistered account, which the node would
 *   reject with -32603 after the user had already signed (FR5).
 * An `UNKNOWN` verdict does not block: Redbelly has one public endpoint, and
 * an outage must not brick the wallet. It is shown as a warning instead.
 *
 * @param params.chainId - The transaction's chain.
 * @param params.to - The transaction's `to`.
 * @param params.data - The transaction's calldata.
 * @param params.from - The signer.
 * @returns The gate state.
 */
export function useRedbellyTxGate({
  chainId,
  to,
  data,
  from,
}: {
  chainId?: number | null;
  to?: string | null;
  data?: string | null;
  from?: string | null;
}): RedbellyTxGate {
  const { t } = useTranslation();
  const wallet = useWallet();
  const isRedbelly = isRedbellyChainId(chainId);

  const target = useMemo<PaymentTarget>(
    () => (isRedbelly ? paymentTarget({ to, data }) : { kind: 'none' }),
    [isRedbelly, to, data]
  );
  const recipientAddress = target.kind === 'none' ? null : target.recipient;

  const recipient = useRedbellyStore(
    useShallow((state) => state.currentTx.recipient)
  );
  const checkRecipient = useRedbellyStore((state) => state.checkRecipient);
  const resetCurrentTx = useRedbellyStore((state) => state.resetCurrentTx);

  useEffect(() => {
    checkRecipient(isRedbelly ? chainId : null, recipientAddress);
  }, [checkRecipient, isRedbelly, chainId, recipientAddress]);

  // A verdict must never outlive its confirmation: an address can be
  // registered between two sends, and a stale NOT_REGISTERED would block the
  // second.
  useEffect(() => resetCurrentTx, [resetCurrentTx]);

  const isCurrent =
    !!recipientAddress &&
    recipient.address?.toLowerCase() === recipientAddress.toLowerCase() &&
    recipient.chainId === Number(chainId);
  const verdict = isCurrent ? recipient.verdict : null;
  const checking = isRedbelly && !!recipientAddress && !verdict;

  const { data: senderRegistered = null } = useRequest(
    async () =>
      isRedbelly && from
        ? wallet.getRedbellyIsRegistered(Number(chainId), from)
        : null,
    { refreshDeps: [isRedbelly, chainId, from] }
  );

  const { data: usdPerGas = null } = useRequest(
    async () =>
      isRedbelly ? wallet.getRedbellyUsdPerGas(Number(chainId)) : null,
    { refreshDeps: [isRedbelly, chainId] }
  );

  let blockReason: string | null = null;
  if (isRedbelly) {
    if (checking) {
      blockReason = t('page.signTx.redbelly.checkingReason');
    } else if (verdict && blocksSigning(verdict)) {
      blockReason = t('page.signTx.redbelly.blockedReason');
    } else if (senderRegistered === false) {
      blockReason = t('page.signTx.redbelly.senderNotRegisteredReason');
    }
  }

  return {
    isRedbelly,
    target,
    verdict,
    checking,
    senderRegistered,
    usdPerGas,
    blockReason,
  };
}
