import {
  isRedbellyChainId,
  isRedbellyServerId,
  redbellyNetworkName,
  redbellyRpcUrl,
  REDBELLY_MAINNET_CHAIN_ID,
  REDBELLY_TESTNET_CHAIN_ID,
} from '@/constant/redbelly';
import {
  clearRedbellyContractCache,
  readAddressFacts,
  readBalance,
  readGasPrice,
  readIsAllowed,
  readUsdPerGas,
  resolvePermissionContract,
} from '@/utils/redbelly/reader';
import type { EthereumRequest } from '@/utils/redbelly/reader';

/**
 * Calldata the proven `check_address.py` implementation produces. Asserting
 * against these literals is what keeps the TypeScript port honest.
 */
const REGISTRY_CALLDATA =
  '0x04433bbc' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '000000000000000000000000000000000000000000000000000000000000000a' +
  '7065726d697373696f6e00000000000000000000000000000000000000000000';

const MAINNET = REDBELLY_MAINNET_CHAIN_ID;

/** Live-observed registry response: the mainnet permission contract. */
const PERMISSION_WORD =
  '0x000000000000000000000000cb385cd90ca6b219798f57b4a7958897e91a9163';
const PERMISSION_ADDRESS = '0xcb385cd90ca6b219798f57b4a7958897e91a9163';

const TRUE_WORD =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const FALSE_WORD =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/** A live-verified permissioned account. */
const REGISTERED = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';

const REGISTRY = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5';

type Call = { method: string; params?: unknown[] };

/**
 * Build a fake provider that records calls and replies from a lookup table.
 *
 * @param replies - Maps a method (optionally `eth_call:<to>`) to its response.
 * @returns The fake request function and the recorded calls.
 */
function fakeProvider(
  replies: Record<string, unknown>
): { request: EthereumRequest; calls: Call[] } {
  const calls: Call[] = [];
  const request: EthereumRequest = async (args) => {
    calls.push(args);
    const [first] = (args.params ?? []) as { to?: string }[];
    const key =
      args.method === 'eth_call' ? `eth_call:${first?.to ?? ''}` : args.method;
    if (!(key in replies)) {
      throw new Error(`Unexpected call: ${key}`);
    }
    return replies[key];
  };
  return { request, calls };
}

/**
 * Pull the call object out of a recorded `eth_call`.
 *
 * @param call - A recorded provider call.
 * @returns The `{ to, data }` argument.
 */
function callArgument(call: Call | undefined): { to?: string; data?: string } {
  const [first] = (call?.params ?? []) as { to?: string; data?: string }[];
  if (!first) {
    throw new Error('Expected a call with parameters');
  }
  return first;
}

const workingProvider = (code: string, allowed: string) =>
  fakeProvider({
    [`eth_call:${REGISTRY}`]: PERMISSION_WORD,
    [`eth_call:${PERMISSION_ADDRESS}`]: allowed,
    eth_getCode: code,
  });

/**
 * Find the recorded `eth_call` aimed at the permission contract.
 *
 * @param calls - Every recorded provider call.
 * @returns The permission call, if one was made.
 */
function permissionCallIn(calls: Call[]): Call | undefined {
  return calls.find(
    (call) =>
      call.method === 'eth_call' && callArgument(call).to === PERMISSION_ADDRESS
  );
}

// The resolved-contract cache is module state, so it has to be cleared
// between all tests, not just one group's.
beforeEach(() => {
  clearRedbellyContractCache();
});

describe('isRedbellyChainId', () => {
  it('accepts both Redbelly networks', () => {
    expect(isRedbellyChainId(151)).toBe(true);
    expect(isRedbellyChainId(153)).toBe(true);
  });

  it('accepts the string forms Rabby threads around', () => {
    expect(isRedbellyChainId('151')).toBe(true);
  });

  it('rejects other EVM chains so the wallet stays silent on them (FR4)', () => {
    expect(isRedbellyChainId(1)).toBe(false);
    expect(isRedbellyChainId(152)).toBe(false);
    expect(isRedbellyChainId(56)).toBe(false);
  });

  it('rejects absent chain ids rather than coercing them to zero', () => {
    expect(isRedbellyChainId(undefined)).toBe(false);
    expect(isRedbellyChainId(null)).toBe(false);
    expect(isRedbellyChainId('')).toBe(false);
  });
});

describe('isRedbellyServerId', () => {
  it('accepts both Redbelly server ids', () => {
    expect(isRedbellyServerId('custom_151')).toBe(true);
    expect(isRedbellyServerId('custom_153')).toBe(true);
  });

  it('rejects DeBank chain ids and other custom networks', () => {
    expect(isRedbellyServerId('eth')).toBe(false);
    expect(isRedbellyServerId('custom_1')).toBe(false);
    expect(isRedbellyServerId(undefined)).toBe(false);
  });
});

describe('redbellyRpcUrl', () => {
  // The wallet's own provider is not guaranteed to be on the chain a
  // transaction targets - observed live returning chain 1 while confirming a
  // transaction on Redbelly Testnet. The endpoint is chosen from the chain id
  // the caller passes, never from ambient state.
  it('maps each Redbelly chain to its endpoint', () => {
    expect(redbellyRpcUrl(REDBELLY_MAINNET_CHAIN_ID)).toBe(
      'https://governors.mainnet.redbelly.network'
    );
    expect(redbellyRpcUrl(REDBELLY_TESTNET_CHAIN_ID)).toBe(
      'https://governors.testnet.redbelly.network'
    );
  });

  it('refuses to guess an endpoint for an unknown chain', () => {
    expect(() => redbellyRpcUrl(1)).toThrow('No Redbelly RPC endpoint');
  });
});

describe('redbellyNetworkName', () => {
  it('names the Redbelly networks', () => {
    expect(redbellyNetworkName(151)).toBe('Redbelly Mainnet');
    expect(redbellyNetworkName(153)).toBe('Redbelly Testnet');
  });
});

describe('resolvePermissionContract', () => {
  it('encodes the registry lookup exactly as check_address.py does', async () => {
    const { request, calls } = workingProvider('0x', TRUE_WORD);
    await resolvePermissionContract(request, MAINNET);

    expect(callArgument(calls[0]).data).toBe(REGISTRY_CALLDATA);
  });

  it('resolves the mainnet permission contract', async () => {
    const { request } = workingProvider('0x', TRUE_WORD);
    expect(await resolvePermissionContract(request, MAINNET)).toBe(
      PERMISSION_ADDRESS
    );
  });

  it('caches per chain so the registry is queried once (NFR4)', async () => {
    const { request, calls } = workingProvider('0x', TRUE_WORD);
    await resolvePermissionContract(request, MAINNET);
    await resolvePermissionContract(request, MAINNET);
    expect(calls).toHaveLength(1);
  });

  it('does not reuse one chain resolution for the other network', async () => {
    const { request, calls } = workingProvider('0x', TRUE_WORD);
    await resolvePermissionContract(request, REDBELLY_MAINNET_CHAIN_ID);
    await resolvePermissionContract(request, REDBELLY_TESTNET_CHAIN_ID);
    // The permission contract may be a different deployment on each network,
    // so the cache key has to include the chain.
    expect(calls).toHaveLength(2);
  });
});

describe('readAddressFacts', () => {
  it('encodes the isAllowed call for the recipient', async () => {
    const { request, calls } = workingProvider('0x', TRUE_WORD);
    await readAddressFacts(request, MAINNET, REGISTERED);

    const permissionCall = permissionCallIn(calls);
    expect(callArgument(permissionCall).data).toBe(
      `0xbabcc539000000000000000000000000${REGISTERED.slice(2)}`
    );
  });

  it('reads a permissioned account', async () => {
    const { request } = workingProvider('0x', TRUE_WORD);
    expect(await readAddressFacts(request, MAINNET, REGISTERED)).toStrictEqual({
      hasCode: false,
      isAllowed: true,
    });
  });

  it('reads an unpermissioned account', async () => {
    const { request } = workingProvider('0x', FALSE_WORD);
    expect(await readAddressFacts(request, MAINNET, REGISTERED)).toStrictEqual({
      hasCode: false,
      isAllowed: false,
    });
  });

  it('detects deployed bytecode', async () => {
    const { request } = workingProvider('0x6080604052', FALSE_WORD);
    const facts = await readAddressFacts(request, MAINNET, REGISTERED);
    expect(facts.hasCode).toBe(true);
  });

  it('propagates provider failures instead of guessing', async () => {
    const request: EthereumRequest = async () => {
      throw new Error('node unreachable');
    };
    await expect(
      readAddressFacts(request, MAINNET, REGISTERED)
    ).rejects.toThrow('node unreachable');
  });

  it('rejects an empty isAllowed answer rather than reading it as not registered', async () => {
    const { request } = workingProvider('0x', '0x');
    await expect(
      readAddressFacts(request, MAINNET, REGISTERED)
    ).rejects.toThrow('Unexpected isAllowed result');
    await expect(readIsAllowed(request, MAINNET, REGISTERED)).rejects.toThrow(
      'Unexpected isAllowed result'
    );
  });

  it('rejects a malformed eth_call response rather than reading it as false', async () => {
    const { request } = workingProvider('0x', (undefined as unknown) as string);
    await expect(
      readAddressFacts(request, MAINNET, REGISTERED)
    ).rejects.toThrow('Unexpected eth_call result');
  });
});

describe('readIsAllowed', () => {
  // FR5 / US9: asked about the user's own account, where bytecode is not the
  // question - an unregistered sender is rejected by the node with -32603.
  it('reports a registered account', async () => {
    const { request } = workingProvider('0x', TRUE_WORD);
    expect(await readIsAllowed(request, MAINNET, REGISTERED)).toBe(true);
  });

  it('reports an unregistered account', async () => {
    const { request } = workingProvider('0x', FALSE_WORD);
    expect(await readIsAllowed(request, MAINNET, REGISTERED)).toBe(false);
  });

  it('never calls eth_getCode, unlike the recipient check', async () => {
    const { request, calls } = workingProvider('0x', TRUE_WORD);
    await readIsAllowed(request, MAINNET, REGISTERED);
    expect(calls.some((call) => call.method === 'eth_getCode')).toBe(false);
  });
});

describe('readBalance', () => {
  it('reads a balance straight from the node (FR2)', async () => {
    const { request } = fakeProvider({
      eth_getBalance: '0x2e37b1e60e4b2cd12',
    });
    expect(await readBalance(request, REGISTERED)).toBe(
      BigInt('0x2e37b1e60e4b2cd12')
    );
  });

  it('rejects a malformed response rather than reporting zero', async () => {
    // The entire point of US8: a displayed zero must never be a failed read.
    const { request } = fakeProvider({ eth_getBalance: null });
    await expect(readBalance(request, REGISTERED)).rejects.toThrow(
      'Unexpected eth_getBalance result'
    );
  });
});

describe('readUsdPerGas', () => {
  /**
   * The exact response the live testnet gasfees contract returns for
   * `getBaseGasFee()`: (10000, "USD", 6) => US$0.01 per 21,000-gas
   * transaction. Captured 2026-08-13.
   */
  const BASE_GAS_FEE_RESULT =
    '0x' +
    '0000000000000000000000000000000000000000000000000000000000002710' +
    '0000000000000000000000000000000000000000000000000000000000000060' +
    '0000000000000000000000000000000000000000000000000000000000000006' +
    '0000000000000000000000000000000000000000000000000000000000000003' +
    '5553440000000000000000000000000000000000000000000000000000000000';

  const GAS_FEE_ADDRESS = '0x292cc6d79e95b2848579735c24b70215179d4a33';
  const GAS_FEE_WORD = `0x000000000000000000000000${GAS_FEE_ADDRESS.slice(2)}`;

  const gasFeeProvider = (result: string) =>
    fakeProvider({
      [`eth_call:${REGISTRY}`]: GAS_FEE_WORD,
      [`eth_call:${GAS_FEE_ADDRESS}`]: result,
    });

  it('derives the per-gas dollar price from the base transaction price', async () => {
    const { request } = gasFeeProvider(BASE_GAS_FEE_RESULT);
    // 10000 / 10^6 = US$0.01 for 21,000 gas.
    expect(await readUsdPerGas(request, MAINNET)).toBeCloseTo(0.01 / 21000, 12);
  });

  it('prices a simple transfer at exactly one cent', async () => {
    const { request } = gasFeeProvider(BASE_GAS_FEE_RESULT);
    const perGas = await readUsdPerGas(request, MAINNET);
    expect(21000 * perGas).toBeCloseTo(0.01, 9);
  });

  it('refuses a currency it does not understand rather than assuming dollars', async () => {
    const inAud = BASE_GAS_FEE_RESULT.replace(
      '5553440000',
      '4155440000' // "AUD"
    );
    const { request } = gasFeeProvider(inAud);
    await expect(readUsdPerGas(request, MAINNET)).rejects.toThrow(
      'Unexpected gas fee currency: AUD'
    );
  });

  it('rejects a truncated response', async () => {
    const { request } = gasFeeProvider('0x2710');
    await expect(readUsdPerGas(request, MAINNET)).rejects.toThrow(
      'Unexpected getBaseGasFee result'
    );
  });
});

describe('readGasPrice', () => {
  it('reads eth_gasPrice as wei', async () => {
    const request: EthereumRequest = jest.fn().mockResolvedValue('0x3b9aca00');
    await expect(readGasPrice(request)).resolves.toBe(1000000000n);
    expect(request).toHaveBeenCalledWith({
      method: 'eth_gasPrice',
      params: [],
    });
  });

  it.each([[undefined], ['0x'], ['not hex'], [12]])(
    'rejects a malformed answer (%p) rather than reporting a price',
    async (bad) => {
      const request: EthereumRequest = jest.fn().mockResolvedValue(bad);
      await expect(readGasPrice(request)).rejects.toThrow(
        'Unexpected eth_gasPrice result'
      );
    }
  );
});
