import {
  Bold,
  Box,
  Copyable,
  Divider,
  Heading,
  Text,
} from '@metamask/snaps-sdk/jsx';

import type { PaymentTarget } from './recipient';
import type { Verdict } from './verdict';

/** A transaction with someone to check. */
export type CheckedTarget = Exclude<PaymentTarget, { kind: 'none' }>;

type PanelCopy = {
  heading: string;
  body: string;
  footer: string;
};

/**
 * What each verdict says.
 *
 * Every verdict gets a footer, including the reassuring ones. `REGISTERED` is
 * the easiest result to over-read: it proves a verified person controls the
 * address, not that they are the person being paid.
 */
const COPY: Record<Verdict, PanelCopy> = {
  REGISTERED: {
    heading: 'Registered on Redbelly',
    body: 'This address has completed Redbelly identity verification and is on the permission list.',
    footer:
      'That confirms someone verified controls this address - not that it is the recipient you intended. Check the address itself.',
  },
  NOT_REGISTERED: {
    heading: 'Not registered on Redbelly',
    body: 'This address is not on the Redbelly permission list. Nobody can spend funds sent here, and the transfer cannot be reversed.',
    footer: 'Check the address carefully before you continue.',
  },
  CONTRACT: {
    heading: 'Contract address',
    body: 'This is a smart contract. The permission list covers user accounts, so no identity check applies to it.',
    footer:
      'A contract is not a person: check that it is the one you meant to use.',
  },
  UNKNOWN: {
    heading: 'Could not verify',
    body: 'The Redbelly node did not answer, so this address was not checked.',
    footer:
      'This is not a confirmation that the address is valid. Verify it another way before you continue.',
  },
};

/** An unregistered spender is a different risk from an unregistered payee. */
const NOT_REGISTERED_SPENDER_BODY =
  'This address is not on the Redbelly permission list, so it is not a verified participant. Approving it lets it spend your tokens.';

/**
 * What the panel adds about where the checked address came from.
 *
 * @param target - What the transaction pays and to whom.
 * @param verdict - The conclusion about the address checked.
 * @returns The note, or `null` if the address is simply `to`.
 */
function targetNote(target: CheckedTarget, verdict: Verdict): string | null {
  if (target.kind === 'token') {
    return `Token transfer: this is the account being paid, read from the transfer data. The token contract is ${target.token}.`;
  }
  if (target.kind === 'approval') {
    return `Approval: if you confirm, this address can spend your tokens from contract ${target.token}.`;
  }
  // A contract can pass funds on to anyone; say what the check could not see
  // rather than let "Contract address" read as "checked, all fine".
  if (target.kind === 'call' && verdict === 'CONTRACT') {
    return 'Contract call: only this contract was checked. If it passes funds on to another address, that address is not checked.';
  }
  return null;
}

/**
 * Build the transaction-insight panel for a verdict.
 *
 * @param verdict - The conclusion about the address checked.
 * @param target - What the transaction pays and to whom. The address is
 * shown in full so the user can compare it against their intended
 * destination. For a token transfer or approval it is read from the
 * calldata (US11), and the panel says so, since it is not the `to` MetaMask
 * shows.
 * @param network - Display name of the network that was checked.
 * @param feeNotes - Extra fee lines to append below the verdict.
 * @returns The panel to render on the confirmation screen.
 */
export function insightPanel(
  verdict: Verdict,
  target: CheckedTarget,
  network: string,
  feeNotes: string[] = [],
) {
  const copy = COPY[verdict];
  const body =
    target.kind === 'approval' && verdict === 'NOT_REGISTERED'
      ? NOT_REGISTERED_SPENDER_BODY
      : copy.body;
  const targetLine = targetNote(target, verdict);

  return (
    <Box>
      <Heading>{copy.heading}</Heading>
      <Text>{body}</Text>
      <Copyable value={target.recipient} />
      <Text>{copy.footer}</Text>
      {targetLine ? <Text>{targetLine}</Text> : null}
      <Divider />
      <Text>
        Checked against the Redbelly permission contract on{' '}
        <Bold>{network}</Bold>.
      </Text>
      {feeNotes.map((note) => (
        <Text>{note}</Text>
      ))}
    </Box>
  );
}
