import type { OnTransactionHandler } from '@metamask/snaps-sdk';
import { SeverityLevel } from '@metamask/snaps-sdk';

import { estimateFee } from './fees';
import { formatRbnt, formatUsd } from './format';
import {
  fetchTransport,
  isRedbellyChain,
  networkName,
  readAddressFacts,
  readUsdPerGas,
} from './redbelly';
import { insightPanel } from './ui';
import { isCritical, verdictFor } from './verdict';
import type { AddressFacts } from './verdict';

export { onHomePage } from './home';

/**
 * Explain the fee MetaMask is already showing.
 *
 * Redbelly prices gas in US dollars, so a routine transfer costs several RBNT
 * rather than a fraction of one. Users read that as a bug. Stating the dollar
 * equivalent turns a shocking number into an ordinary one.
 *
 * @param transaction - The unsigned transaction.
 * @param transaction.gas - The gas limit, as a hex quantity.
 * @param transaction.gasPrice - The legacy gas price, as a hex quantity.
 * @param transaction.maxFeePerGas - The EIP-1559 fee cap, as a hex quantity.
 * @param usdPerGas - US dollars per unit of gas, or null if unavailable.
 * @returns Lines to append to the panel, empty if the fee is unreadable.
 */
function feeNotesFor(
  transaction: {
    gas?: unknown;
    gasPrice?: unknown;
    maxFeePerGas?: unknown;
  },
  usdPerGas: number | null,
): string[] {
  const fee = estimateFee(transaction, usdPerGas);
  if (!fee) {
    return [];
  }

  const amount =
    fee.feeUsd === null
      ? `${formatRbnt(fee.feeWei)} RBNT`
      : `${formatRbnt(fee.feeWei)} RBNT (${formatUsd(fee.feeUsd)})`;

  return [
    `Network fee: up to ${amount}.`,
    'Redbelly prices gas in US dollars and converts to RBNT, so fees look large next to Ethereum. This is expected, not an error.',
  ];
}

/**
 * Warn the user whether a transaction's recipient is on Redbelly's on-chain
 * permission list, before they sign.
 *
 * The endpoint is chosen from `chainId` rather than taken from the wallet's
 * `ethereum` global: that global is not guaranteed to be connected to the
 * chain the transaction targets. See `redbelly.ts`.
 *
 * Returns `null` - rendering nothing - only when the check does not apply at
 * all: a non-Redbelly chain, or a contract creation with no recipient. When
 * the check applies but fails, we say so explicitly rather than staying
 * silent.
 *
 * @param args - The handler arguments.
 * @param args.transaction - The unsigned transaction.
 * @param args.chainId - CAIP-2 chain ID of the target network.
 * @returns The insight panel, or `null` if the check does not apply.
 */
export const onTransaction: OnTransactionHandler = async ({
  transaction,
  chainId,
}) => {
  if (!isRedbellyChain(chainId)) {
    return null;
  }

  const recipient = transaction.to;
  if (!recipient) {
    return null;
  }

  const request = fetchTransport(chainId);

  // Independent: a gas-peg failure must not cost us the address verdict, which
  // is the point of the Snap, and vice versa.
  const [facts, usdPerGas] = await Promise.all([
    readAddressFacts(request, chainId, recipient).catch(
      (): AddressFacts | null => null,
    ),
    readUsdPerGas(request, chainId).catch((): number | null => null),
  ]);

  const verdict = verdictFor(facts);
  const content = insightPanel(
    verdict,
    recipient,
    networkName(chainId),
    feeNotesFor(transaction, usdPerGas),
  );

  // `critical` asks MetaMask to raise a modal before the user can confirm,
  // rather than a panel they may never expand. Documented as Flask-only.
  return isCritical(verdict)
    ? { content, severity: SeverityLevel.Critical }
    : { content };
};
