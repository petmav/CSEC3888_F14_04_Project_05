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

/**
 * Addresses an account has paid, from its explorer history - for the
 * address-poisoning check, which treats them as known.
 *
 * Only transactions the account itself signed count. The explorer's token
 * list cannot say who signed: a scammer's zero-value
 * `transferFrom(victim, lookalike, 0)` appears there as a transfer *from*
 * the victim, and trusting it would make the lookalike "known". So a token
 * payee counts only if its transaction is also in the account's own
 * transaction list (which records the signer) and moved a non-zero amount.
 *
 * @param self - The account.
 * @param native - Rows of the explorer's `txlist`.
 * @param tokens - Rows of the explorer's `tokentx`.
 * @returns Lowercased payees.
 */
export function explorerPayees(
  self: string,
  native: Record<string, string>[],
  tokens: Record<string, string>[]
): string[] {
  const me = self.toLowerCase();
  const lower = (value?: string) => (value || '').toLowerCase();
  const signed = new Set<string>();
  const payees = new Set<string>();

  native
    .filter((row) => lower(row.from) === me)
    .forEach((row) => {
      signed.add(lower(row.hash));
      if (row.to) {
        payees.add(lower(row.to));
      }
    });

  tokens
    .filter(
      (row) =>
        signed.has(lower(row.hash)) &&
        lower(row.from) === me &&
        !!row.to &&
        /[1-9]/u.test(row.value || '')
    )
    .forEach((row) => payees.add(lower(row.to)));

  return [...payees];
}
