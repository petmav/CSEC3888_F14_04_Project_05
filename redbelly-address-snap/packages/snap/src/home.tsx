import type { OnHomePageHandler } from '@metamask/snaps-sdk';
import {
  Bold,
  Box,
  Copyable,
  Divider,
  Heading,
  Text,
} from '@metamask/snaps-sdk/jsx';

import { formatRbnt } from './format';
import {
  REDBELLY_CHAIN_IDS,
  fetchTransport,
  networkName,
  readAddressFacts,
  readBalance,
} from './redbelly';

/**
 * One line per network, describing the account there.
 *
 * Both networks are shown rather than "the current one" because `onHomePage`
 * receives no chain context, and the wallet's own provider cannot be trusted
 * to report the chain a user is looking at - it answered `0x1` while MetaMask
 * was confirming a transaction on chain 153. Showing both sidesteps the
 * question and is more useful anyway.
 *
 * @param address - The account to describe.
 * @returns One summary line per Redbelly network.
 */
async function summarise(address: string): Promise<string[]> {
  const lines = await Promise.all(
    REDBELLY_CHAIN_IDS.map(async (chainId) => {
      const request = fetchTransport(chainId);
      try {
        const [balance, facts] = await Promise.all([
          readBalance(request, address),
          readAddressFacts(request, chainId, address),
        ]);
        const status = facts.isAllowed ? 'registered' : 'NOT registered';
        return `${networkName(chainId)}: ${formatRbnt(balance)} RBNT - ${status}`;
      } catch {
        // One network being unreachable must not blank out the other.
        return `${networkName(chainId)}: unavailable (node did not answer)`;
      }
    }),
  );
  return lines;
}

/**
 * The Snap's own screen inside MetaMask.
 *
 * Exists because MetaMask's balance display cannot be corrected from a Snap.
 * When the main UI shows 0 RBNT, this page answers the question the user
 * actually has - "is my money still there?" - by reading the chain directly.
 *
 * @returns The home page content.
 */
export const onHomePage: OnHomePageHandler = async () => {
  let address: string | null = null;

  try {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
      address = accounts[0];
    }
  } catch {
    address = null;
  }

  if (!address) {
    return {
      content: (
        <Box>
          <Heading>Redbelly balance</Heading>
          <Text>
            Could not read your account from MetaMask, so no balance was
            fetched. This is not a statement about your funds.
          </Text>
        </Box>
      ),
    };
  }

  const lines = await summarise(address);

  return {
    content: (
      <Box>
        <Heading>Redbelly balance</Heading>
        <Text>Read directly from Redbelly, not from MetaMask's cache.</Text>
        <Copyable value={address} />
        {lines.map((line) => (
          <Text>{line}</Text>
        ))}
        <Divider />
        <Text>
          If MetaMask shows <Bold>0 RBNT</Bold> but a balance appears here, the
          wallet failed to refresh rather than your funds being gone. Switching
          networks or locking and unlocking MetaMask forces a refresh.
        </Text>
      </Box>
    ),
  };
};
