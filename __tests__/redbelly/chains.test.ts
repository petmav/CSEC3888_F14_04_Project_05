import {
  REDBELLY_MAINNET,
  REDBELLY_TESTNET,
  withRedbellyChains,
} from '@/constant/redbelly-chains';
import {
  REDBELLY_MAINNET_CHAIN_ID,
  REDBELLY_TESTNET_CHAIN_ID,
} from '@/constant/redbelly';
import type { Chain } from '@debank/common';

const ETHEREUM = ({
  id: 1,
  serverId: 'eth',
  name: 'Ethereum',
} as unknown) as Chain;

const BSC = ({
  id: 56,
  serverId: 'bsc',
  name: 'BNB Chain',
} as unknown) as Chain;

describe('Redbelly chain definitions', () => {
  it('uses the real Redbelly chain ids', () => {
    expect(REDBELLY_MAINNET.id).toBe(151);
    expect(REDBELLY_TESTNET.id).toBe(153);
  });

  it('encodes the chain id as hex for the provider', () => {
    expect(REDBELLY_MAINNET.hex).toBe('0x97');
    expect(REDBELLY_TESTNET.hex).toBe('0x99');
  });

  it('gives the two networks distinct identities', () => {
    // A shared serverId or enum would make findChain() return whichever came
    // first, silently sending mainnet traffic to testnet or the reverse.
    expect(REDBELLY_MAINNET.serverId).not.toBe(REDBELLY_TESTNET.serverId);
    expect(REDBELLY_MAINNET.enum).not.toBe(REDBELLY_TESTNET.enum);
    expect(REDBELLY_MAINNET.nativeTokenAddress).not.toBe(
      REDBELLY_TESTNET.nativeTokenAddress
    );
  });

  it('denominates both networks in RBNT with 18 decimals', () => {
    [REDBELLY_MAINNET, REDBELLY_TESTNET].forEach((chain) => {
      expect(chain.nativeTokenSymbol).toBe('RBNT');
      expect(chain.nativeTokenDecimals).toBe(18);
    });
  });

  it('takes the full signing UI path rather than the custom-network one', () => {
    // isTestnet gates off the full recipient panel in Actions/Send.tsx. Both
    // Redbelly networks need that panel, so neither is flagged as a testnet;
    // the testnet-ness is carried by the chain name.
    expect(REDBELLY_MAINNET.isTestnet).toBe(false);
    expect(REDBELLY_TESTNET.isTestnet).toBe(false);
    expect(REDBELLY_TESTNET.name).toContain('Testnet');
  });

  it('estimates gas locally, since DeBank cannot pre-execute Redbelly', () => {
    expect(REDBELLY_MAINNET.needEstimateGas).toBe(true);
  });

  it('builds explorer links with the placeholder Rabby substitutes', () => {
    expect(REDBELLY_MAINNET.scanLink).toContain('_s_');
  });
});

describe('withRedbellyChains', () => {
  it('adds both Redbelly networks to a DeBank chain list', () => {
    const result = withRedbellyChains([ETHEREUM, BSC]);
    const ids = result.map((chain) => chain.id);
    expect(ids).toContain(REDBELLY_MAINNET_CHAIN_ID);
    expect(ids).toContain(REDBELLY_TESTNET_CHAIN_ID);
  });

  it('keeps every DeBank chain', () => {
    // "Redbelly first-class, keep other chains": adding Redbelly must not cost
    // the user any existing network.
    const result = withRedbellyChains([ETHEREUM, BSC]);
    expect(result).toContain(ETHEREUM);
    expect(result).toContain(BSC);
    expect(result).toHaveLength(4);
  });

  it('survives the hourly DeBank sync replacing the whole list', () => {
    // syncChain.ts replaces mainnetList wholesale from
    // static.debank.com/supported_chains.json every 55 minutes. This is the
    // regression that would otherwise make Redbelly vanish after an hour.
    const afterSync = withRedbellyChains([ETHEREUM, BSC]);
    const afterSecondSync = withRedbellyChains(afterSync);
    expect(afterSecondSync.filter((chain) => chain.id === 151)).toHaveLength(1);
    expect(afterSecondSync).toHaveLength(4);
  });

  it('is idempotent, so repeated writes do not duplicate entries', () => {
    const once = withRedbellyChains([ETHEREUM]);
    const twice = withRedbellyChains(once);
    expect(twice).toStrictEqual(once);
  });

  it('replaces rather than duplicates if DeBank ever lists Redbelly itself', () => {
    const debankRedbelly = ({
      id: 151,
      serverId: 'rbnt',
      name: 'Redbelly (DeBank)',
    } as unknown) as Chain;
    const result = withRedbellyChains([debankRedbelly, ETHEREUM]);
    expect(result.filter((chain) => chain.id === 151)).toHaveLength(1);
    // Ours wins: the DeBank entry would route Redbelly reads back through an
    // API that does not index it.
    expect(result.find((chain) => chain.id === 151)).toBe(REDBELLY_MAINNET);
  });

  it('puts Redbelly first, so it leads the chain selector', () => {
    const result = withRedbellyChains([ETHEREUM, BSC]);
    expect(result[0]).toBe(REDBELLY_MAINNET);
    expect(result[1]).toBe(REDBELLY_TESTNET);
  });

  it('tolerates an empty or absent list', () => {
    expect(withRedbellyChains([])).toHaveLength(2);
    expect(withRedbellyChains((undefined as unknown) as Chain[])).toHaveLength(
      2
    );
  });
});
