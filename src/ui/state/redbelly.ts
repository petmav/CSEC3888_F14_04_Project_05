import { create } from 'zustand';

import { isRedbellyChainId } from '@/constant/redbelly';
import type { Verdict } from '@/utils/redbelly/verdict';
import { wallet } from '@/ui/wallet';

/**
 * Transient UI state for the Redbelly recipient check.
 *
 * Plain Zustand rather than `createRabbyStore`: this is per-transaction state
 * that must never be persisted or synchronised across windows, which is the
 * case `skills/rabby-create-store/SKILL.md` calls out for plain Zustand. It
 * mirrors the shape of `state/securityEngine.ts`, including `resetCurrentTx`.
 *
 * Caching a verdict across transactions would be actively wrong: an address
 * can be registered between two confirmations, and a stale `NOT_REGISTERED`
 * would block a legitimate send (US12).
 */

export type RedbellyRecipientCheck = {
  chainId: number | null;
  address: string | null;
  /** `null` until a check has completed for the current recipient. */
  verdict: Verdict | null;
  loading: boolean;
};

export type RedbellyState = {
  currentTx: {
    recipient: RedbellyRecipientCheck;
  };
};

type RedbellyActions = {
  checkRecipient: (chainId?: number | null, address?: string | null) => void;
  resetCurrentTx: () => void;
};

export type RedbellyStore = RedbellyState & RedbellyActions;

export function getDefaultRedbellyState(): RedbellyState {
  return {
    currentTx: {
      recipient: {
        chainId: null,
        address: null,
        verdict: null,
        loading: false,
      },
    },
  };
}

/**
 * Guards against a slow reply for a previous recipient landing after a faster
 * reply for the current one. Incremented on every check.
 */
let requestToken = 0;

export const useRedbellyStore = create<RedbellyStore>((set, get) => ({
  ...getDefaultRedbellyState(),

  checkRecipient(chainId, address) {
    const { recipient } = get().currentTx;

    // FR4: say nothing at all on non-Redbelly chains, and on transactions with
    // no recipient (contract creation).
    if (!isRedbellyChainId(chainId) || !address) {
      if (recipient.verdict !== null || recipient.loading) {
        set({ ...getDefaultRedbellyState() });
      }
      return;
    }

    const targetChainId = Number(chainId);
    const sameTarget =
      recipient.chainId === targetChainId &&
      recipient.address?.toLowerCase() === address.toLowerCase();

    // Already answered or in flight for this exact recipient.
    if (sameTarget && (recipient.loading || recipient.verdict !== null)) {
      return;
    }

    requestToken += 1;
    const token = requestToken;

    set({
      currentTx: {
        recipient: {
          chainId: targetChainId,
          address,
          verdict: null,
          loading: true,
        },
      },
    });

    wallet
      .getRedbellyVerdict(targetChainId, address)
      .then((verdict) => {
        if (token !== requestToken) {
          return;
        }
        set({
          currentTx: {
            recipient: {
              chainId: targetChainId,
              address,
              verdict,
              loading: false,
            },
          },
        });
      })
      .catch((error) => {
        if (token !== requestToken) {
          return;
        }
        // The background service already degrades failures to UNKNOWN, so
        // reaching here means the message channel itself failed. Report it the
        // same way rather than leaving the panel spinning (NFR2).
        console.error('[redbelly] recipient check failed', error);
        set({
          currentTx: {
            recipient: {
              chainId: targetChainId,
              address,
              verdict: 'UNKNOWN',
              loading: false,
            },
          },
        });
      });
  },

  resetCurrentTx() {
    requestToken += 1;
    set({ ...getDefaultRedbellyState() });
  },
}));
