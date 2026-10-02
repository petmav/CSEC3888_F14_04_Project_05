import type { EthereumRequest } from './reader';

/** Pause before the single retry of a failed call. */
export const RPC_RETRY_DELAY = 400;

/**
 * A JSON-RPC transport for one endpoint.
 *
 * Redbelly has one public endpoint per network and no fallback, so a
 * momentary blip would otherwise show "Could not verify". A call is retried
 * once on a transport failure or an overloaded node (HTTP 429 or 5xx). A
 * JSON-RPC error is an answer, and is not retried.
 *
 * @param url - The endpoint.
 * @param retryDelay - Milliseconds before the retry.
 * @returns A request function.
 */
export function jsonRpcTransport(
  url: string,
  retryDelay = RPC_RETRY_DELAY
): EthereumRequest {
  let nextId = 0;

  return async ({ method, params }) => {
    nextId += 1;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: nextId,
      method,
      params: params ?? [],
    });
    const post = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

    let response: Response;
    try {
      response = await post();
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      response = await post();
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    const payload = (await response.json()) as {
      result?: unknown;
      error?: { message?: string };
    };

    if (payload.error) {
      throw new Error(`RPC error: ${payload.error.message ?? 'unknown'}`);
    }

    return payload.result;
  };
}
