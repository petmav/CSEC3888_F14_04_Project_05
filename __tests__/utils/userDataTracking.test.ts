/**
 * @jest-environment jsdom
 */
// These tests cover Rabby's own behaviour, which the Redbelly-only build
// switches off (see REDBELLY_ONLY in src/constant/redbelly.ts). Run them with
// the flag off so that code path stays tested for when it is turned back on.
jest.mock('@/constant/redbelly', () => ({
  ...jest.requireActual('@/constant/redbelly'),
  REDBELLY_ONLY: false,
}));

import browser from 'webextension-polyfill';
import eventBus from '@/eventBus';
import { BROADCAST_TO_UI_EVENTS } from '@/utils/broadcastToUI';
import {
  resetUserDataTrackingCache,
  shouldReportUserBehaviorData,
} from '@/utils/user-data-tracking';

jest.mock('webextension-polyfill', () => ({
  storage: {
    local: {
      get: jest.fn(),
    },
  },
}));

const mockStorageGet = browser.storage.local.get as jest.Mock;

describe('shouldReportUserBehaviorData', () => {
  beforeEach(() => {
    mockStorageGet.mockReset();
    resetUserDataTrackingCache();
  });

  test('returns false when preference is not created yet', async () => {
    mockStorageGet.mockResolvedValue({});

    await expect(shouldReportUserBehaviorData()).resolves.toBe(false);
  });

  test('returns false when user opted out', async () => {
    mockStorageGet.mockResolvedValue({
      preference: {
        userDataTrackingOptOut: true,
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(false);
  });

  test('returns true when user did not opt out', async () => {
    mockStorageGet.mockResolvedValue({
      preference: {
        userDataTrackingOptOut: false,
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(true);
  });

  test('uses cached value after first storage read', async () => {
    mockStorageGet.mockResolvedValue({
      preference: {
        userDataTrackingOptOut: false,
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(true);
    await expect(shouldReportUserBehaviorData()).resolves.toBe(true);
    expect(mockStorageGet).toHaveBeenCalledTimes(1);
  });

  test('updates cache from UI storeChanged event', async () => {
    mockStorageGet.mockResolvedValue({
      preference: {
        userDataTrackingOptOut: true,
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(false);

    eventBus.emit(BROADCAST_TO_UI_EVENTS.storeChanged, {
      bgStoreName: 'preference',
      changedKey: 'userDataTrackingOptOut',
      changedKeys: ['userDataTrackingOptOut'],
      partials: {
        userDataTrackingOptOut: false,
      },
      origin: 'background-1',
      revision: 1,
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(true);
    expect(mockStorageGet).toHaveBeenCalledTimes(1);
  });

  test('updates cache from background broadcast event', async () => {
    mockStorageGet.mockResolvedValue({
      preference: {
        userDataTrackingOptOut: false,
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(true);

    eventBus.emit('broadcastToUI', {
      method: BROADCAST_TO_UI_EVENTS.storeChanged,
      params: {
        bgStoreName: 'preference',
        changedKey: 'userDataTrackingOptOut',
        changedKeys: ['userDataTrackingOptOut'],
        partials: {
          userDataTrackingOptOut: true,
        },
        origin: 'background-1',
        revision: 2,
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(false);
    expect(mockStorageGet).toHaveBeenCalledTimes(1);
  });

  test('treats missing field on existing preference as an old user', async () => {
    mockStorageGet.mockResolvedValue({
      preference: {
        currentVersion: '0.93.92',
      },
    });

    await expect(shouldReportUserBehaviorData()).resolves.toBe(true);
  });

  test('returns false when storage access fails', async () => {
    mockStorageGet.mockRejectedValue(new Error('storage unavailable'));

    await expect(shouldReportUserBehaviorData()).resolves.toBe(false);
  });
});
