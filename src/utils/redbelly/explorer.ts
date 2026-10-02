/**
 * Reading Redbelly's block explorer (Routescan), which answers in the
 * Etherscan API format.
 */

export type ExplorerResponse = {
  status?: string;
  message?: string;
  result?: Record<string, string>[] | string;
};

/**
 * The rows of an explorer list response.
 *
 * Etherscan-style APIs report errors in the body, not the HTTP status: a rate
 * limit or a bad request comes back as HTTP 200 with `status: "0"` and the
 * error text as a string `result`. A list - empty or not - is rows; anything
 * else is thrown, so the History page says the explorer did not answer
 * instead of "No activity yet". (Routescan answers an empty account with
 * `status: "1"` and `[]`; Etherscan with `status: "0"`, "No transactions
 * found" and `[]`. Both are lists.)
 *
 * @param payload - The parsed response body.
 * @returns The rows.
 * @throws If the explorer reported an error.
 */
export function explorerRows(
  payload: ExplorerResponse
): Record<string, string>[] {
  if (Array.isArray(payload.result)) {
    return payload.result;
  }
  const detail =
    typeof payload.result === 'string' ? payload.result : payload.message;
  throw new Error(`Explorer error: ${detail || 'unexpected response'}`);
}
