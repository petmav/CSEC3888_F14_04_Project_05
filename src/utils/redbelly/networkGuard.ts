/**
 * Network guard for the Redbelly-only build (NFR: no third-party data flow).
 *
 * Rabby talks to its own and DeBank's servers from dozens of places - config
 * lists, scam checks, history, analytics, gas accounts, perps. Gating each
 * call site would miss the next one added upstream, so the guard sits under
 * all of them instead: `fetch`, `XMLHttpRequest` and `sendBeacon` refuse
 * these hosts in the extension's own contexts. Callers see an ordinary
 * network error, which every one of them already has to handle.
 *
 * Installed by importing this module first in each extension entry point
 * (background, UI, offscreen). Never imported by the content scripts, which
 * run inside web pages.
 *
 * One request is let through: the currency rate list, which the display
 * currency setting needs and which carries nothing about the user.
 */

import { REDBELLY_ONLY } from '@/constant/redbelly';

const BLOCKED_HOSTS = [
  /(^|\.)debank\.com$/,
  /(^|\.)rabby\.io$/,
  /(^|\.)hyperliquid\.xyz$/,
  /(^|\.)google-analytics\.com$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)sentry\.io$/,
];

const ALLOWED = [
  (url: URL) =>
    url.hostname === 'api.rabby.io' &&
    url.pathname === '/v1/currency/exchange_list',
];

/**
 * Whether the guard refuses a request.
 *
 * @param input - The request URL.
 * @returns True if the request must not be sent.
 */
export function isBlockedRequest(input: string | URL): boolean {
  let url: URL;
  try {
    url = new URL(String(input), 'https://invalid.local/');
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return false;
  }
  if (ALLOWED.some((allow) => allow(url))) {
    return false;
  }
  return BLOCKED_HOSTS.some((host) => host.test(url.hostname));
}

const blockedError = (url: string) =>
  new TypeError(`Blocked by the Redbelly-only network guard: ${url}`);

/** Where a blocked XHR is pointed: an unsafe port fails immediately. */
const UNREACHABLE = 'http://0.0.0.0:0/redbelly-blocked';

let installed = false;

/** Install the guard in the current context. Idempotent. */
export function installNetworkGuard() {
  if (!REDBELLY_ONLY || installed) {
    return;
  }
  installed = true;
  const scope = globalThis as typeof globalThis & {
    XMLHttpRequest?: typeof XMLHttpRequest;
  };

  if (typeof scope.fetch === 'function') {
    const originalFetch = scope.fetch.bind(scope);
    scope.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : input.url;
      if (isBlockedRequest(url)) {
        return Promise.reject(blockedError(url));
      }
      return originalFetch(input, init);
    };
  }

  if (scope.XMLHttpRequest) {
    const originalOpen = scope.XMLHttpRequest.prototype.open;
    scope.XMLHttpRequest.prototype.open = function open(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      const target = isBlockedRequest(url) ? UNREACHABLE : url;
      return (originalOpen as (...args: unknown[]) => void).call(
        this,
        method,
        target,
        ...rest
      );
    } as typeof originalOpen;
  }

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) =>
      isBlockedRequest(url) ? false : originalBeacon(url, data);
  }
}

installNetworkGuard();
