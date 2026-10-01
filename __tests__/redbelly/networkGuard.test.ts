import { isBlockedRequest } from '@/utils/redbelly/networkGuard';

describe('isBlockedRequest', () => {
  it.each([
    'https://api.rabby.io/v1/user/history_all_list?id=0xabc',
    'https://api.rabby.io/v1/engine/origin/is_scam',
    'https://static.debank.com/supported_chains.json',
    'https://matomo.debank.com/matomo.php',
    'https://api.hyperliquid.xyz/info',
    'https://www.google-analytics.com/mp/collect',
    'https://o123.ingest.sentry.io/api/1/envelope/',
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
