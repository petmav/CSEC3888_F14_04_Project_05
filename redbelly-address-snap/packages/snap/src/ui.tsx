import {
  Bold,
  Box,
  Copyable,
  Divider,
  Heading,
  Text,
} from '@metamask/snaps-sdk/jsx';

import type { Verdict } from './verdict';

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
      'On a token transfer this is the token contract, not the person you are paying.',
  },
  UNKNOWN: {
    heading: 'Could not verify',
    body: 'The Redbelly node did not answer, so this address was not checked.',
    footer:
      'This is not a confirmation that the address is valid. Verify it another way before you continue.',
  },
};

/**
 * Build the transaction-insight panel for a verdict.
 *
 * @param verdict - The conclusion about the recipient.
 * @param address - The recipient address, shown in full so the user can
 * compare it against their intended destination.
 * @param network - Display name of the network that was checked.
 * @param feeNotes - Extra fee lines to append below the verdict.
 * @returns The panel to render on the confirmation screen.
 */
export function insightPanel(
  verdict: Verdict,
  address: string,
  network: string,
  feeNotes: string[] = [],
) {
  const copy = COPY[verdict];

  return (
    <Box>
      <Heading>{copy.heading}</Heading>
      <Text>{copy.body}</Text>
      <Copyable value={address} />
      <Text>{copy.footer}</Text>
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
