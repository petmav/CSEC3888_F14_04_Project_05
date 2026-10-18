/**
 * Why a gas estimate failed on Redbelly.
 *
 * The node estimates gas by executing the transaction. When that execution
 * fails, the transaction would fail on chain too and still be charged; when
 * the node cannot be reached, nothing is known about the transaction at all.
 * The signing screen refuses both, with a different message: restart the
 * transaction, or retry once the network answers.
 */

export type EstimateFailure = 'reverted' | 'unavailable';

/** Errors meaning no answer came back from the node. */
const UNAVAILABLE_ERRORS = new Set([
  'HttpRequestError',
  'TimeoutError',
  'WebSocketRequestError',
  'SocketClosedError',
]);

/** viem errors for a node that executed the transaction and refused it. */
const REVERTED_ERRORS = new Set([
  'ExecutionRevertedError',
  'InsufficientFundsError',
  'IntrinsicGasTooHighError',
  'IntrinsicGasTooLowError',
  'NonceTooHighError',
  'NonceTooLowError',
  'NonceMaxValueError',
  'TransactionTypeNotSupportedError',
  'TipAboveFeeCapError',
  'FeeCapTooHighError',
  'FeeCapTooLowError',
]);

/**
 * JSON-RPC error codes a node returns when it executed the transaction and
 * refused it: -32000 (Geth's generic execution error, e.g. Redbelly's
 * "invalid opcode"), 3 (execution reverted, with revert data) and -32015
 * (VM execution error).
 */
const REVERTED_CODES = new Set([-32000, 3, -32015]);

/** The error and the errors it wraps, outermost first. */
function causes(error: unknown): any[] {
  const chain: any[] = [];
  let current: any = error;
  while (current && typeof current === 'object' && chain.length < 10) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

/**
 * Classify a failed gas estimate.
 *
 * Anything not recognised as a refusal by the node counts as `unavailable`:
 * its message asks the user to retry, which suits an unknown failure.
 *
 * @param error - The error thrown by the estimate.
 * @returns `reverted` if the node executed and refused the transaction,
 *   otherwise `unavailable`.
 */
export function classifyEstimateFailure(error: unknown): EstimateFailure {
  const chain = causes(error);
  if (chain.some((item) => UNAVAILABLE_ERRORS.has(item?.name))) {
    return 'unavailable';
  }
  if (
    chain.some(
      (item) =>
        REVERTED_ERRORS.has(item?.name) || REVERTED_CODES.has(item?.code)
    )
  ) {
    return 'reverted';
  }
  return 'unavailable';
}

/**
 * The classification, carried in `data`: only `message`, `code` and `data`
 * of a background error reach the UI.
 */
export type RedbellyEstimateErrorData = { redbellyEstimate: EstimateFailure };

/**
 * Rethrowable error for a failed Redbelly estimate, carrying its class.
 *
 * @param error - The original error.
 * @returns An Error with the original message and the classification.
 */
export function redbellyEstimateError(
  error: unknown
): Error & { data: RedbellyEstimateErrorData } {
  const message =
    (error as any)?.shortMessage ||
    (error as any)?.message ||
    'Gas estimate failed';
  return Object.assign(new Error(message), {
    data: { redbellyEstimate: classifyEstimateFailure(error) },
  });
}

/**
 * The classification of an error received from the background, or null if
 * it carries none (another chain, or an error from elsewhere).
 *
 * @param error - The error as received by the UI.
 * @returns The classification, or null.
 */
export function estimateFailureOf(error: unknown): EstimateFailure | null {
  const value = (error as any)?.data?.redbellyEstimate;
  return value === 'reverted' || value === 'unavailable' ? value : null;
}
