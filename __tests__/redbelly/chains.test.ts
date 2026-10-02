import {
  builtinRedbellyNetwork,
  REDBELLY_MAINNET,
  REDBELLY_NETWORKS,
  REDBELLY_TESTNET,
} from '@/constant/redbelly-chains';
import {
  isRedbellyServerId,
  REDBELLY_MAINNET_ENUM,
  REDBELLY_MAINNET_SERVER_ID,
  REDBELLY_TESTNET_ENUM,
  REDBELLY_TESTNET_SERVER_ID,
} from '@/constant/redbelly';
import { createTestnetChain } from '@/background/service/customTestnet';

// createTestnetChain is a pure function, but its module pulls in the whole
// custom-network service. Stub the parts that need a browser or ESM-only deps.
jest.mock('@/background/utils/ipfs', () => ({}));
jest.mock('@/background/service/redbelly', () => ({}));

describe('Redbelly built-in networks', () => {
  it('uses the real Redbelly chain ids, Mainnet first', () => {
    expect(REDBELLY_NETWORKS.map((item) => item.id)).toEqual([151, 153]);
  });

  it('points each network at its own public endpoint and explorer', () => {
    expect(REDBELLY_MAINNET.rpcUrl).toBe(
      'https://governors.mainnet.redbelly.network'
    );
    expect(REDBELLY_TESTNET.rpcUrl).toBe(
      'https://governors.testnet.redbelly.network'
    );
    expect(REDBELLY_MAINNET.scanLink).toBe(
      'https://redbelly.routescan.io/tx/_s_'
    );
    expect(REDBELLY_TESTNET.scanLink).toBe(
      'https://redbelly.testnet.routescan.io/tx/_s_'
    );
  });

  it('denominates both networks in RBNT', () => {
    REDBELLY_NETWORKS.forEach((item) => {
      expect(item.nativeTokenSymbol).toBe('RBNT');
    });
  });

  it('derives the same ids Rabby derives for a custom network', () => {
    // The constants are used to recognise Redbelly all over the UI; if they
    // drifted from what createTestnetChain produces, nothing would match.
    const mainnet = createTestnetChain({ ...REDBELLY_MAINNET });
    const testnet = createTestnetChain({ ...REDBELLY_TESTNET });
    expect(mainnet.serverId).toBe(REDBELLY_MAINNET_SERVER_ID);
    expect(testnet.serverId).toBe(REDBELLY_TESTNET_SERVER_ID);
    expect(mainnet.enum).toBe(REDBELLY_MAINNET_ENUM);
    expect(testnet.enum).toBe(REDBELLY_TESTNET_ENUM);
    expect(mainnet.hex).toBe('0x97');
    expect(testnet.hex).toBe('0x99');
    expect(isRedbellyServerId(mainnet.serverId)).toBe(true);
    expect(isRedbellyServerId(testnet.serverId)).toBe(true);
  });

  it('runs on the RPC-only path, never through DeBank', () => {
    // isTestnet is Rabby's flag for "custom network": the signing screen,
    // balances and gas all come from the node. On the DeBank path Redbelly's
    // signing screen fails with "No gas level available".
    REDBELLY_NETWORKS.forEach((item) => {
      const chain = createTestnetChain({ ...item });
      expect(chain.isTestnet).toBe(true);
      expect(chain.eip['1559']).toBe(false);
      expect(chain.nativeTokenDecimals).toBe(18);
    });
  });

  it('recognises built-ins by id, numeric or string', () => {
    expect(builtinRedbellyNetwork(151)).toBe(REDBELLY_MAINNET);
    expect(builtinRedbellyNetwork('153')).toBe(REDBELLY_TESTNET);
    expect(builtinRedbellyNetwork(1)).toBeUndefined();
  });
});
