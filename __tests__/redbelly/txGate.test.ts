/**
 * @jest-environment jsdom
 */
// The signing gate (US12 / FR7): when the Sign button is held, and that an
// "I understand the risks" tick belongs to one recipient only.
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { getDefaultRedbellyState, useRedbellyStore } from '@/ui/state/redbelly';
import { wallet } from '@/ui/wallet';
import {
  RedbellyTxGate,
  useRedbellyTxGate,
} from '@/ui/views/Approval/components/SignTestnetTx/useRedbellyTxGate';
import type { Verdict } from '@/utils/redbelly/verdict';

jest.mock('@/ui/wallet', () => ({
  wallet: {
    getRedbellyVerdict: jest.fn(),
  },
}));

const mockUiWallet = {
  getRedbellyIsRegistered: jest.fn(),
  getRedbellyUsdPerGas: jest.fn(),
  getRedbellyKnownAddresses: jest.fn(),
  getRedbellyPermissionContract: jest.fn(),
};
jest.mock('@/ui/utils', () => ({
  useWallet: () => mockUiWallet,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const getRedbellyVerdict = wallet.getRedbellyVerdict as jest.MockedFunction<
  typeof wallet.getRedbellyVerdict
>;

const MAINNET = 151;
const ALICE = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';
const BOB = '0xcb385cd90ca6b219798f57b4a7958897e91a9163';
const SIGNER = '0x30025e9f7b5b3b2e389ba1a1de08a006aa217fe1';
// Mainnet's permission contract, and its registration ("enable") call.
const PERMISSION = BOB;
const REGISTER = `0x33f6cfb2${'0'.repeat(64)}`;

const CHECKING = 'page.signTx.redbelly.checkingReason';
const ACKNOWLEDGE = 'page.signTx.redbelly.acknowledgeReason';
const LOOKALIKE = 'page.signTx.redbelly.lookalikeReason';
// Same first four and last four hex characters as ALICE.
const POISONED = '0xfbc7000000000000000000000000000000d0d1af';

type Props = Parameters<typeof useRedbellyTxGate>[0];

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let gate: RedbellyTxGate;
/** Every render, including those before effects run. */
let renders: RedbellyTxGate[] = [];

const Probe = (props: Props) => {
  gate = useRedbellyTxGate(props);
  renders.push(gate);
  return null;
};

/**
 * Every render of the gate for `address`, so a test can check the renders
 * before effects ran - not just the settled one `act()` leaves behind.
 *
 * @param address - The recipient.
 * @returns The renders for that recipient.
 */
const rendersFor = (address: string) =>
  renders.filter(
    (state) =>
      state.target.kind !== 'none' && state.target.recipient === address
  );

/**
 * Render the gate with `props`, or re-render it if already mounted.
 *
 * @param props - The transaction the gate is asked about.
 */
async function render(props: Props) {
  await act(async () => {
    root.render(createElement(Probe, props));
  });
}

/**
 * Build a verdict promise whose resolution the test controls.
 *
 * @returns The promise and its resolver.
 */
function deferred() {
  let resolve!: (verdict: Verdict) => void;
  const promise = new Promise<Verdict>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Let pending promises (the verdict, ahooks requests) settle. */
async function settle() {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
}

const send = (to: string | null, extra: Partial<Props> = {}): Props => ({
  chainId: MAINNET,
  to,
  data: '0x',
  from: SIGNER,
  ...extra,
});

beforeEach(() => {
  useRedbellyStore.setState(getDefaultRedbellyState());
  getRedbellyVerdict.mockReset();
  mockUiWallet.getRedbellyIsRegistered.mockReset().mockResolvedValue(true);
  mockUiWallet.getRedbellyUsdPerGas.mockReset().mockResolvedValue(null);
  mockUiWallet.getRedbellyKnownAddresses
    .mockReset()
    .mockResolvedValue({ addresses: [], complete: true });
  mockUiWallet.getRedbellyPermissionContract
    .mockReset()
    .mockResolvedValue(PERMISSION);
  root = createRoot(document.createElement('div'));
  renders = [];
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
});

describe('useRedbellyTxGate', () => {
  it('holds signing until the recipient check comes back', async () => {
    const check = deferred();
    getRedbellyVerdict.mockReturnValue(check.promise);

    await render(send(ALICE));
    expect(gate.checking).toBe(true);
    expect(gate.blockReason).toBe(CHECKING);

    await act(async () => check.resolve('REGISTERED'));
    expect(gate.verdict).toBe('REGISTERED');
    expect(gate.blockReason).toBeNull();
  });

  it('holds signing on an unregistered recipient until acknowledged', async () => {
    getRedbellyVerdict.mockResolvedValue('NOT_REGISTERED');

    await render(send(ALICE));
    await settle();
    expect(gate.needsAcknowledgement).toBe(true);
    expect(gate.acknowledged).toBe(false);
    expect(gate.blockReason).toBe(ACKNOWLEDGE);

    await act(async () => gate.setAcknowledged(true));
    expect(gate.acknowledged).toBe(true);
    expect(gate.blockReason).toBeNull();

    await act(async () => gate.setAcknowledged(false));
    expect(gate.blockReason).toBe(ACKNOWLEDGE);
  });

  it('does not carry an acknowledgement over to a new recipient', async () => {
    getRedbellyVerdict.mockResolvedValue('NOT_REGISTERED');

    await render(send(ALICE));
    await settle();
    await act(async () => gate.setAcknowledged(true));
    expect(gate.blockReason).toBeNull();

    const bob = deferred();
    getRedbellyVerdict.mockReturnValue(bob.promise);
    await render(send(BOB));
    // Alice's verdict and tick must not open the gate for Bob - in any
    // render, including the first, before an effect could reset anything.
    expect(rendersFor(BOB).length).toBeGreaterThan(0);
    for (const state of rendersFor(BOB)) {
      expect(state.acknowledged).toBe(false);
      expect(state.blockReason).not.toBeNull();
    }
    expect(gate.blockReason).toBe(CHECKING);

    await act(async () => bob.resolve('NOT_REGISTERED'));
    expect(gate.acknowledged).toBe(false);
    expect(gate.blockReason).toBe(ACKNOWLEDGE);

    // Back to Alice: the earlier tick is gone too.
    getRedbellyVerdict.mockResolvedValue('NOT_REGISTERED');
    await render(send(ALICE));
    await settle();
    expect(gate.acknowledged).toBe(false);
    expect(gate.blockReason).toBe(ACKNOWLEDGE);
  });

  it('does not carry an acknowledgement over to another chain', async () => {
    getRedbellyVerdict.mockResolvedValue('NOT_REGISTERED');

    await render(send(ALICE));
    await settle();
    await act(async () => gate.setAcknowledged(true));
    expect(gate.blockReason).toBeNull();

    const before = renders.length;
    await render(send(ALICE, { chainId: 153 }));
    for (const state of renders.slice(before)) {
      expect(state.acknowledged).toBe(false);
      expect(state.blockReason).not.toBeNull();
    }
    await settle();
    expect(gate.acknowledged).toBe(false);
    expect(gate.blockReason).toBe(ACKNOWLEDGE);
  });

  it('ignores a late verdict for a previous recipient', async () => {
    const alice = deferred();
    const bob = deferred();
    getRedbellyVerdict
      .mockReturnValueOnce(alice.promise)
      .mockReturnValueOnce(bob.promise);

    await render(send(ALICE));
    await render(send(BOB));
    await act(async () => alice.resolve('REGISTERED'));
    expect(gate.verdict).toBeNull();
    expect(gate.blockReason).toBe(CHECKING);

    await act(async () => bob.resolve('NOT_REGISTERED'));
    expect(gate.verdict).toBe('NOT_REGISTERED');
    expect(gate.blockReason).toBe(ACKNOWLEDGE);
  });

  it('does not hold signing when the check fails (UNKNOWN)', async () => {
    getRedbellyVerdict.mockResolvedValue('UNKNOWN');

    await render(send(ALICE));
    await settle();
    expect(gate.verdict).toBe('UNKNOWN');
    expect(gate.needsAcknowledgement).toBe(false);
    expect(gate.blockReason).toBeNull();
  });

  it('checks the decoded payee of a token transfer, not the token', async () => {
    getRedbellyVerdict.mockResolvedValue('NOT_REGISTERED');
    const data = `0xa9059cbb${ALICE.slice(2).padStart(64, '0')}${'1'.padStart(
      64,
      '0'
    )}`;

    await render(send(BOB, { data }));
    await settle();
    expect(getRedbellyVerdict).toHaveBeenCalledWith(MAINNET, ALICE);
    expect(gate.target).toStrictEqual({
      kind: 'token',
      recipient: ALICE,
      token: BOB,
    });
    expect(gate.blockReason).toBe(ACKNOWLEDGE);
  });

  it('reports a contract call without holding signing', async () => {
    getRedbellyVerdict.mockResolvedValue('CONTRACT');

    await render(send(BOB, { data: '0x12345678' }));
    await settle();
    expect(gate.target).toStrictEqual({ kind: 'call', recipient: BOB });
    expect(gate.verdict).toBe('CONTRACT');
    expect(gate.blockReason).toBeNull();
  });

  it('warns about an unregistered signer without holding signing', async () => {
    getRedbellyVerdict.mockResolvedValue('REGISTERED');
    mockUiWallet.getRedbellyIsRegistered.mockResolvedValue(false);

    await render(send(ALICE));
    await settle();
    expect(gate.senderRegistered).toBe(false);
    expect(gate.blockReason).toBeNull();
  });

  it('recognises an unregistered signer registering, without changing the hold', async () => {
    getRedbellyVerdict.mockResolvedValue('CONTRACT');
    mockUiWallet.getRedbellyIsRegistered.mockResolvedValue(false);

    await render(send(PERMISSION, { data: REGISTER }));
    await settle();
    expect(mockUiWallet.getRedbellyPermissionContract).toHaveBeenCalledWith(
      MAINNET
    );
    expect(gate.senderRegistered).toBe(false);
    expect(gate.isRegistration).toBe(true);
    expect(gate.blockReason).toBeNull();
  });

  it('does not treat the registration selector to another contract as registering', async () => {
    getRedbellyVerdict.mockResolvedValue('CONTRACT');
    mockUiWallet.getRedbellyIsRegistered.mockResolvedValue(false);

    await render(send(ALICE, { data: REGISTER }));
    await settle();
    expect(gate.isRegistration).toBe(false);
  });

  it('keeps the usual warning when the permission contract cannot be resolved', async () => {
    getRedbellyVerdict.mockResolvedValue('CONTRACT');
    mockUiWallet.getRedbellyIsRegistered.mockResolvedValue(false);
    mockUiWallet.getRedbellyPermissionContract.mockResolvedValue(null);

    await render(send(PERMISSION, { data: REGISTER }));
    await settle();
    expect(gate.isRegistration).toBe(false);
  });

  it('has nothing to check on contract creation', async () => {
    await render(send(null, { data: '0x6080' }));
    await settle();
    expect(gate.target).toStrictEqual({ kind: 'none' });
    expect(getRedbellyVerdict).not.toHaveBeenCalled();
    expect(gate.blockReason).toBeNull();
  });

  it('stays out of the way on other chains', async () => {
    await render(send(ALICE, { chainId: 1 }));
    await settle();
    expect(gate.isRedbelly).toBe(false);
    expect(getRedbellyVerdict).not.toHaveBeenCalled();
    expect(gate.blockReason).toBeNull();
  });

  describe('familiarity', () => {
    it('notes a first-time payee without holding signing', async () => {
      getRedbellyVerdict.mockResolvedValue('REGISTERED');

      await render(send(ALICE));
      await settle();
      expect(mockUiWallet.getRedbellyKnownAddresses).toHaveBeenCalledWith(
        SIGNER
      );
      expect(gate.familiarity).toEqual({ kind: 'new' });
      expect(gate.blockReason).toBeNull();
    });

    it('knows a payee the user has paid before', async () => {
      getRedbellyVerdict.mockResolvedValue('REGISTERED');
      mockUiWallet.getRedbellyKnownAddresses.mockResolvedValue({
        addresses: [ALICE],
        complete: true,
      });

      await render(send(ALICE));
      await settle();
      expect(gate.familiarity).toEqual({ kind: 'known' });
      expect(gate.blockReason).toBeNull();
    });

    it('holds signing on a lookalike, even of a registered address', async () => {
      getRedbellyVerdict.mockResolvedValue('REGISTERED');
      mockUiWallet.getRedbellyKnownAddresses.mockResolvedValue({
        addresses: [ALICE],
        complete: true,
      });

      await render(send(POISONED));
      await settle();
      expect(gate.familiarity).toEqual({
        kind: 'lookalike',
        similarTo: ALICE,
      });
      expect(gate.needsAcknowledgement).toBe(true);
      expect(gate.blockReason).toBe(LOOKALIKE);

      await act(async () => gate.setAcknowledged(true));
      expect(gate.blockReason).toBeNull();
    });

    it('waits for the known addresses before allowing signing', async () => {
      getRedbellyVerdict.mockResolvedValue('REGISTERED');
      let resolveKnown!: (known: {
        addresses: string[];
        complete: boolean;
      }) => void;
      mockUiWallet.getRedbellyKnownAddresses.mockReturnValue(
        new Promise((res) => {
          resolveKnown = res;
        })
      );

      await render(send(POISONED));
      await settle();
      expect(gate.verdict).toBe('REGISTERED');
      expect(gate.blockReason).toBe(CHECKING);

      await act(async () =>
        resolveKnown({ addresses: [ALICE], complete: true })
      );
      expect(gate.blockReason).toBe(LOOKALIKE);
    });

    it('does not hold signing when the list cannot be read', async () => {
      getRedbellyVerdict.mockResolvedValue('REGISTERED');
      mockUiWallet.getRedbellyKnownAddresses.mockRejectedValue(
        new Error('boom')
      );

      await render(send(ALICE));
      await settle();
      expect(gate.familiarity).toEqual({ kind: 'new' });
      // Not "first time": the history behind that claim was not read.
      expect(gate.historyComplete).toBe(false);
      expect(gate.blockReason).toBeNull();
    });

    it('says when the history was incomplete', async () => {
      getRedbellyVerdict.mockResolvedValue('REGISTERED');
      mockUiWallet.getRedbellyKnownAddresses.mockResolvedValue({
        addresses: [],
        complete: false,
      });

      await render(send(ALICE));
      await settle();
      expect(gate.historyComplete).toBe(false);
      expect(gate.blockReason).toBeNull();
    });

    it('says nothing about a contract call', async () => {
      getRedbellyVerdict.mockResolvedValue('CONTRACT');

      await render(send(BOB, { data: '0x12345678' }));
      await settle();
      expect(gate.familiarity).toBeNull();
    });
  });
});
