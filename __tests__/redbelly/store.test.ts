import { getDefaultRedbellyState, useRedbellyStore } from '@/ui/state/redbelly';
import { wallet } from '@/ui/wallet';
import type { Verdict } from '@/utils/redbelly/verdict';

// Hoisted above the imports by ts-jest, so the store sees the mock.
jest.mock('@/ui/wallet', () => ({
  wallet: {
    getRedbellyVerdict: jest.fn(),
    getRedbellyIsRegistered: jest.fn(),
  },
}));

const getRedbellyVerdict = wallet.getRedbellyVerdict as jest.MockedFunction<
  typeof wallet.getRedbellyVerdict
>;
const getRedbellyIsRegistered =
  wallet.getRedbellyIsRegistered as jest.MockedFunction<
    typeof wallet.getRedbellyIsRegistered
  >;

const MAINNET = 151;
const ALICE = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';
const BOB = '0xcb385cd90ca6b219798f57b4a7958897e91a9163';

/**
 * Build a promise whose resolution this test controls.
 *
 * @returns The promise and its resolver.
 */
function deferred(): {
  promise: Promise<Verdict>;
  resolve: (verdict: Verdict) => void;
} {
  let resolve!: (verdict: Verdict) => void;
  const promise = new Promise<Verdict>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const recipientOf = () => useRedbellyStore.getState().currentTx.recipient;
const senderOf = () => useRedbellyStore.getState().currentTx.sender;

beforeEach(() => {
  getRedbellyVerdict.mockReset();
  getRedbellyIsRegistered.mockReset();
  useRedbellyStore.setState(getDefaultRedbellyState());
});

describe('checkRecipient chain gating', () => {
  it('does not touch the chain on a non-Redbelly network (FR4)', () => {
    useRedbellyStore.getState().checkRecipient(1, ALICE);
    expect(getRedbellyVerdict).not.toHaveBeenCalled();
    expect(recipientOf().verdict).toBeNull();
  });

  it('does not check a transaction with no recipient', () => {
    // Contract creation. The Snap returned null here and so do we.
    useRedbellyStore.getState().checkRecipient(MAINNET, null);
    expect(getRedbellyVerdict).not.toHaveBeenCalled();
  });

  it('clears a previous verdict when moving to a non-Redbelly chain', async () => {
    getRedbellyVerdict.mockResolvedValue('REGISTERED');
    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    expect(recipientOf().verdict).toBe('REGISTERED');

    useRedbellyStore.getState().checkRecipient(1, ALICE);
    // Leaving a stale REGISTERED on screen after a chain switch would be a
    // claim about an address on a chain we never checked.
    expect(recipientOf().verdict).toBeNull();
  });
});

describe('checkRecipient results', () => {
  it('marks the check in flight, then records the verdict', async () => {
    const { promise, resolve } = deferred();
    getRedbellyVerdict.mockReturnValue(promise);

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    expect(recipientOf().loading).toBe(true);
    expect(recipientOf().verdict).toBeNull();

    resolve('NOT_REGISTERED');
    await promise;
    await Promise.resolve();

    expect(recipientOf()).toMatchObject({
      chainId: MAINNET,
      address: ALICE,
      verdict: 'NOT_REGISTERED',
      loading: false,
    });
  });

  it('reports a failed message channel as UNKNOWN, never as a pass', async () => {
    getRedbellyVerdict.mockRejectedValue(new Error('port disconnected'));

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(recipientOf().verdict).toBe('UNKNOWN');
    expect(recipientOf().loading).toBe(false);
  });

  it('checks once per recipient, not once per render (NFR4)', async () => {
    getRedbellyVerdict.mockResolvedValue('REGISTERED');

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);

    expect(getRedbellyVerdict).toHaveBeenCalledTimes(1);
  });

  it('treats the recipient address case-insensitively', async () => {
    getRedbellyVerdict.mockResolvedValue('REGISTERED');

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE.toUpperCase());

    expect(getRedbellyVerdict).toHaveBeenCalledTimes(1);
  });

  it('re-checks when the recipient changes', async () => {
    getRedbellyVerdict.mockResolvedValue('REGISTERED');

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    useRedbellyStore.getState().checkRecipient(MAINNET, BOB);

    expect(getRedbellyVerdict).toHaveBeenCalledTimes(2);
  });
});

describe('stale replies', () => {
  it('discards a slow reply for a recipient the user has moved on from', async () => {
    const first = deferred();
    const second = deferred();
    getRedbellyVerdict
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    useRedbellyStore.getState().checkRecipient(MAINNET, BOB);

    // Bob answers first, then Alice's slower reply lands.
    second.resolve('REGISTERED');
    await second.promise;
    await Promise.resolve();

    first.resolve('NOT_REGISTERED');
    await first.promise;
    await Promise.resolve();

    // Alice's answer must not overwrite Bob's, or the panel would block a send
    // to Bob using a verdict about a different address entirely.
    expect(recipientOf().address).toBe(BOB);
    expect(recipientOf().verdict).toBe('REGISTERED');
  });

  it('discards a reply that lands after the confirmation is dismissed', async () => {
    const { promise, resolve } = deferred();
    getRedbellyVerdict.mockReturnValue(promise);

    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    useRedbellyStore.getState().resetCurrentTx();

    resolve('NOT_REGISTERED');
    await promise;
    await Promise.resolve();

    expect(recipientOf()).toStrictEqual(
      getDefaultRedbellyState().currentTx.recipient
    );
  });
});

describe('resetCurrentTx', () => {
  it('clears the verdict so the next confirmation cannot inherit it', async () => {
    getRedbellyVerdict.mockResolvedValue('NOT_REGISTERED');
    useRedbellyStore.getState().checkRecipient(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    expect(recipientOf().verdict).toBe('NOT_REGISTERED');

    useRedbellyStore.getState().resetCurrentTx();

    expect(recipientOf().verdict).toBeNull();
    expect(recipientOf().address).toBeNull();
  });
});

describe('checkSender', () => {
  it('does not query an account on a non-Redbelly chain', () => {
    useRedbellyStore.getState().checkSender(1, ALICE);

    expect(getRedbellyIsRegistered).not.toHaveBeenCalled();
    expect(senderOf().completed).toBe(false);
  });

  it('shows an unregistered sender as a completed negative result', async () => {
    getRedbellyIsRegistered.mockResolvedValue(false);

    useRedbellyStore.getState().checkSender(MAINNET, ALICE);
    expect(senderOf()).toMatchObject({ loading: true, completed: false });

    await Promise.resolve();
    await Promise.resolve();
    expect(senderOf()).toMatchObject({
      chainId: MAINNET,
      address: ALICE,
      isRegistered: false,
      loading: false,
      completed: true,
    });
  });

  it('reports a failed sender check as unverified and does not retry forever', async () => {
    getRedbellyIsRegistered.mockRejectedValue(new Error('port disconnected'));

    useRedbellyStore.getState().checkSender(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(senderOf()).toMatchObject({
      isRegistered: null,
      loading: false,
      completed: true,
    });

    useRedbellyStore.getState().checkSender(MAINNET, ALICE);
    expect(getRedbellyIsRegistered).toHaveBeenCalledTimes(1);
  });

  it('keeps the recipient verdict while the sender status is updated', async () => {
    getRedbellyVerdict.mockResolvedValue('REGISTERED');
    getRedbellyIsRegistered.mockResolvedValue(false);

    useRedbellyStore.getState().checkRecipient(MAINNET, BOB);
    useRedbellyStore.getState().checkSender(MAINNET, ALICE);
    await Promise.resolve();
    await Promise.resolve();

    expect(recipientOf().verdict).toBe('REGISTERED');
    expect(senderOf().isRegistered).toBe(false);
  });
});
