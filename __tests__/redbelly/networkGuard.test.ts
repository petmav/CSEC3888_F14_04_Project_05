import {
  BLOCKED_IMAGE,
  guardImageAttribute,
  isBlockedRequest,
  isBlockedSrcset,
} from '@/utils/redbelly/networkGuard';

describe('isBlockedRequest', () => {
  it.each([
    'https://api.rabby.io/v1/user/history_all_list?id=0xabc',
    'https://api.rabby.io/v1/engine/origin/is_scam',
    'https://static.debank.com/supported_chains.json',
    'https://matomo.debank.com/matomo.php',
    'https://api.hyperliquid.xyz/info',
    'https://www.google-analytics.com/mp/collect',
    'https://o123.ingest.sentry.io/api/1/envelope/',
    'wss://api.hyperliquid.xyz/ws',
    'ws://api.rabby.io/socket',
  ])('blocks %s', (url) => {
    expect(isBlockedRequest(url)).toBe(true);
  });

  it.each([
    'https://governors.mainnet.redbelly.network',
    'https://governors.testnet.redbelly.network',
    'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan/api',
    'http://localhost:8765/',
    'chrome-extension://abc/popup.html',
    '/relative/path',
  ])('allows %s', (url) => {
    expect(isBlockedRequest(url)).toBe(false);
  });

  it('lets the currency rate list through, and only that path', () => {
    expect(
      isBlockedRequest('https://api.rabby.io/v1/currency/exchange_list')
    ).toBe(false);
    expect(
      isBlockedRequest('https://api.rabby.io/v1/currency/exchange_list/../x')
    ).toBe(true);
  });

  it('does not confuse lookalike hosts', () => {
    expect(isBlockedRequest('https://notrabby.io/x')).toBe(false);
    expect(isBlockedRequest('https://debank.com.evil.example/x')).toBe(false);
  });
});

describe('image guard', () => {
  const LOGO = 'https://static.debank.com/image/coin/logo_url/eth/1.png';

  it('swaps a blocked src for one that fails without a request', () => {
    expect(guardImageAttribute('src', LOGO)).toBe(BLOCKED_IMAGE);
    expect(guardImageAttribute('SRC', LOGO)).toBe(BLOCKED_IMAGE);
    expect(guardImageAttribute('src', '/images/redbelly.png')).toBe(
      '/images/redbelly.png'
    );
    expect(guardImageAttribute('alt', LOGO)).toBe(LOGO);
  });

  it('drops a srcset naming a blocked host anywhere', () => {
    expect(isBlockedSrcset(`/a.png 1x, ${LOGO} 2x`)).toBe(true);
    expect(isBlockedSrcset('/a.png 1x, /b.png 2x')).toBe(false);
    expect(guardImageAttribute('srcset', `/a.png 1x, ${LOGO} 2x`)).toBe('');
  });

  it('is installed on <img>, by property and by attribute', () => {
    const img = document.createElement('img');
    img.src = LOGO;
    expect(img.getAttribute('src')).toBe(BLOCKED_IMAGE);

    img.setAttribute('src', LOGO);
    expect(img.getAttribute('src')).toBe(BLOCKED_IMAGE);

    img.setAttribute('src', '/images/redbelly.png');
    expect(img.getAttribute('src')).toBe('/images/redbelly.png');

    // Other elements are left alone.
    const link = document.createElement('a');
    link.setAttribute('href', LOGO);
    expect(link.getAttribute('href')).toBe(LOGO);
  });
});

describe('socket guard', () => {
  it('points a blocked WebSocket at an unreachable address', () => {
    const socket = new WebSocket('wss://api.hyperliquid.xyz/ws');
    socket.onerror = () => undefined;
    expect(socket.url).toBe('ws://0.0.0.0:0/redbelly-blocked');
    expect(socket).toBeInstanceOf(WebSocket);
    socket.close();
  });
});
