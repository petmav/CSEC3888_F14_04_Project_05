import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequest } from 'ahooks';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { isRedbellyChainId } from '@/constant/redbelly';
import { useRedbellyStore } from '@/ui/state/redbelly';
import { useWallet } from '@/ui/utils';
import {
  Familiarity,
  recipientFamiliarity,
} from '@/utils/redbelly/familiarity';
import { paymentTarget, PaymentTarget } from '@/utils/redbelly/recipient';
import { isRegistrationCall } from '@/utils/redbelly/registration';
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
  /**
   * The transaction is the permission contract's registration call, which
   * the network accepts from an unregistered signer. False while unknown.
   */
  isRegistration: boolean;
  /** US dollars per unit of gas, or null if the peg could not be read. */
  usdPerGas: number | null;
  /**
   * Whether the user has paid this address before, or it imitates one they
   * have; null while loading, or for a contract call.
   */
  familiarity: Familiarity | null;
  /**
   * False if the user's history could not be fully read: a "new" address
   * may then be one they have paid, so it is not called first-time.
   */
  historyComplete: boolean;
  /** The recipient is confirmed unregistered: signing is refused outright. */
  blocked: boolean;
  /** A lookalike address needs acknowledgement before signing. */
  needsAcknowledgement: boolean;
  acknowledged: boolean;
  setAcknowledged: (value: boolean) => void;
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
 * What holds signing:
 * - while the recipient check has not come back, signing waits - the user
 *   cannot outrun the warning;
 * - a confirmed unregistered recipient is outside the network: it is shown
 *   in red and signing is refused outright (US12), as on the Send page. There
 *   is no tick box to get past it (the team's first choice, 2026-10-02, was
 *   warn-and-confirm);
 * - an address that imitates one the user has paid before (address
 *   poisoning) waits for "I understand the risks"; one never paid before is
 *   noted, not held;
 * - an unregistered signer is a warning only: the node rejects it with
 *   -32603, and the panel says so before the user signs (FR5) - except for
 *   the registration call itself, which the panel explains instead.
 * An `UNKNOWN` verdict does not hold signing: Redbelly has one public
 * endpoint, and an outage must not brick the wallet.
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

  // Who the user already knows - their accounts, contacts, past payees.
  // Read once per signer. A failure leaves the list empty rather than
  // holding signing: it is a hint, not the KYC check.
  const { data: known = null } = useRequest(
    async () => {
      if (!isRedbelly || !from) {
        return { addresses: [], complete: true };
      }
      try {
        return await wallet.getRedbellyKnownAddresses(from);
      } catch (error) {
        console.error('[redbelly] known addresses failed', error);
        return { addresses: [], complete: false };
      }
    },
    { refreshDeps: [isRedbelly, from] }
  );
  const familiarity = useMemo<Familiarity | null>(
    () =>
      // A contract call's `to` is the dApp's contract; "first time" there
      // is noise.
      recipientAddress && known && target.kind !== 'call'
        ? recipientFamiliarity(recipientAddress, known.addresses)
        : null,
    [recipientAddress, known, target.kind]
  );
  const knownAddresses = known?.addresses ?? null;

  const isCurrent =
    !!recipientAddress &&
    recipient.address?.toLowerCase() === recipientAddress.toLowerCase() &&
    recipient.chainId === Number(chainId);
  const verdict = isCurrent ? recipient.verdict : null;
  const checking =
    isRedbelly && !!recipientAddress && (!verdict || knownAddresses === null);
  const isLookalike = familiarity?.kind === 'lookalike';
  const blocked = !checking && !!verdict && blocksSigning(verdict);
  // Only a lookalike can be acknowledged; an unregistered recipient cannot.
  const needsAcknowledgement = !checking && !blocked && isLookalike;

  // An acknowledgement is for one recipient on one chain. It is stored
  // against that pair rather than reset by an effect, so a tick can never
  // carry over to a new recipient - not even for the render before an
  // effect would run.
  const ackKey = recipientAddress
    ? `${Number(chainId)}:${recipientAddress.toLowerCase()}`
    : null;
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const acknowledged = !!ackKey && acknowledgedKey === ackKey;
  const setAcknowledged = useCallback(
    (value: boolean) => setAcknowledgedKey(value ? ackKey : null),
    [ackKey]
  );
  // And a tick for an earlier recipient is dropped, so switching away and
  // back again starts unticked.
  useEffect(() => {
    setAcknowledgedKey(null);
  }, [ackKey]);

  const { data: senderRegistered = null } = useRequest(
    async () =>
      isRedbelly && from
        ? wallet.getRedbellyIsRegistered(Number(chainId), from)
        : null,
    { refreshDeps: [isRedbelly, chainId, from] }
  );

  // Only changes what the panel says about an unregistered signer; it never
  // affects `blockReason`.
  const { data: permissionContract = null } = useRequest(
    async () =>
      isRedbelly ? wallet.getRedbellyPermissionContract(Number(chainId)) : null,
    { refreshDeps: [isRedbelly, chainId] }
  );
  const isRegistration =
    isRedbelly && isRegistrationCall({ to, data }, permissionContract);

  const { data: usdPerGas = null } = useRequest(
    async () =>
      isRedbelly ? wallet.getRedbellyUsdPerGas(Number(chainId)) : null,
    { refreshDeps: [isRedbelly, chainId] }
  );

  let blockReason: string | null = null;
  if (isRedbelly) {
    if (checking) {
      blockReason = t('page.signTx.redbelly.checkingReason');
    } else if (blocked) {
      blockReason = t('page.signTx.redbelly.blockedReason');
    } else if (needsAcknowledgement && !acknowledged) {
      blockReason = t('page.signTx.redbelly.lookalikeReason');
    }
  }

  return {
    isRedbelly,
    target,
    verdict,
    checking,
    senderRegistered,
    isRegistration,
    usdPerGas,
    familiarity,
    historyComplete: known?.complete ?? true,
    blocked,
    needsAcknowledgement,
    acknowledged,
    setAcknowledged,
    blockReason,
  };
}
