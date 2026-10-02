/**
 * Network guard for the Redbelly-only build (NFR: no third-party data flow).
 *
 * Rabby talks to its own and DeBank's servers from dozens of places - config
 * lists, scam checks, history, analytics, gas accounts, perps. Gating each
 * call site would miss the next one added upstream, so the guard sits under
 * all of them instead: `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`
 * and `EventSource` refuse these hosts in the extension's own contexts, and
 * `<img>`/`<source>` elements do not load from them (a logo from DeBank's
 * CDN still tells it the user's IP address). Callers see an ordinary network
 * error, which every one of them already has to handle.
 *
 * This is monkey-patching, not enforcement: code that captured `fetch`
 * before the guard ran would get past it, which is why it must be the first
 * import. Images reaching the page another way - `innerHTML`, CSS `url()`,
 * SVG `<image>`, `setAttributeNS` - are not covered.
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
  if (!['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) {
    return false;
  }
  if (ALLOWED.some((allow) => allow(url))) {
    return false;
  }
  return BLOCKED_HOSTS.some((host) => host.test(url.hostname));
}

const blockedError = (url: string) =>
  new TypeError(`Blocked by the Redbelly-only network guard: ${url}`);

/** Debug-level, so a blocked call is traceable without cluttering errors. */
const logBlocked = (url: string) =>
  console.debug('[redbelly] network guard blocked', url);

/**
 * Where a blocked XHR, WebSocket or EventSource is pointed: port 0 is on the
 * Fetch standard's bad-port list, so the connection fails at once, through
 * the caller's usual error handling.
 */
const UNREACHABLE = 'http://0.0.0.0:0/redbelly-blocked';
const UNREACHABLE_WS = 'ws://0.0.0.0:0/redbelly-blocked';

/**
 * What a blocked image loads instead: an empty data URL, which fails to
 * decode without a network request. The image fires `error`, so the UI's
 * own fallbacks (placeholder token and chain icons) take over.
 */
export const BLOCKED_IMAGE = 'data:,';

/**
 * Whether an `<img>`/`<source>` `srcset` names a blocked host anywhere.
 *
 * @param srcset - The attribute value.
 * @returns True if any candidate URL is blocked.
 */
export function isBlockedSrcset(srcset: string): boolean {
  return srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/u)[0])
    .some((url) => !!url && isBlockedRequest(url));
}

/**
 * The value to actually set for an image attribute.
 *
 * @param name - The attribute name.
 * @param value - The value asked for.
 * @returns `value`, or a failing stand-in if it would load a blocked host.
 */
export function guardImageAttribute(name: string, value: string): string {
  const attribute = name.toLowerCase();
  if (attribute === 'src' && isBlockedRequest(value)) {
    logBlocked(value);
    return BLOCKED_IMAGE;
  }
  if (attribute === 'srcset' && isBlockedSrcset(value)) {
    logBlocked(value);
    return '';
  }
  return value;
}

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
        logBlocked(url);
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
      const blocked = isBlockedRequest(url);
      if (blocked) {
        logBlocked(String(url));
      }
      const target = blocked ? UNREACHABLE : url;
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

  if (typeof scope.WebSocket === 'function') {
    const OriginalWebSocket = scope.WebSocket;
    scope.WebSocket = class GuardedWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const blocked = isBlockedRequest(url);
        if (blocked) {
          logBlocked(String(url));
        }
        super(blocked ? UNREACHABLE_WS : url, protocols);
      }
    };
  }

  if (typeof scope.EventSource === 'function') {
    const OriginalEventSource = scope.EventSource;
    scope.EventSource = class GuardedEventSource extends OriginalEventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        const blocked = isBlockedRequest(url);
        if (blocked) {
          logBlocked(String(url));
        }
        super(blocked ? UNREACHABLE : url, init);
      }
    };
  }

  installImageGuard();
}

/**
 * Stop `<img>` and `<source>` elements loading blocked hosts, whether the
 * URL arrives as a property (`img.src = ...`) or an attribute (React sets
 * `src` with `setAttribute`).
 */
function installImageGuard() {
  if (
    typeof Element === 'undefined' ||
    typeof HTMLImageElement === 'undefined'
  ) {
    return;
  }
  const isImage = (element: Element) =>
    element instanceof HTMLImageElement ||
    (typeof HTMLSourceElement !== 'undefined' &&
      element instanceof HTMLSourceElement);

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function setAttribute(
    this: Element,
    name: string,
    value: string
  ) {
    const guarded = isImage(this)
      ? guardImageAttribute(name, String(value))
      : value;
    return originalSetAttribute.call(this, name, guarded);
  };

  const prototypes = [
    HTMLImageElement.prototype,
    typeof HTMLSourceElement !== 'undefined'
      ? HTMLSourceElement.prototype
      : null,
  ];
  for (const proto of prototypes) {
    if (!proto) {
      continue;
    }
    for (const name of ['src', 'srcset']) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor?.set || !descriptor.get) {
        continue;
      }
      const { get, set } = descriptor;
      Object.defineProperty(proto, name, {
        ...descriptor,
        get,
        set(this: Element, value: string) {
          set.call(this, guardImageAttribute(name, String(value)));
        },
      });
    }
  }
}

installNetworkGuard();
