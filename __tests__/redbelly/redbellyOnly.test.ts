/**
 * @jest-environment jsdom
 */
// The Redbelly-only switches, with the flag as shipped (on). Rabby's own
// tests for the same code run with it off; these pin what it does on.
import browser from 'webextension-polyfill';
import { REDBELLY_ONLY } from '@/constant/redbelly';
import {
  resetUserDataTrackingCache,
  shouldReportUserBehaviorData,
} from '@/utils/user-data-tracking';

jest.mock('webextension-polyfill', () => ({
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
    },
  },
}));

const mockStorageGet = browser.storage.local.get as jest.Mock;

describe('Redbelly-only build', () => {
  it('ships with the flag on', () => {
    expect(REDBELLY_ONLY).toBe(true);
  });

  describe('analytics', () => {
    beforeEach(() => {
      mockStorageGet.mockReset();
      resetUserDataTrackingCache();
    });

    it('reports nothing even when the user has not opted out', async () => {
      mockStorageGet.mockResolvedValue({
        preference: { userDataTrackingOptOut: false },
      });

      await expect(shouldReportUserBehaviorData()).resolves.toBe(false);
      // Decided before the preference is even read.
      expect(mockStorageGet).not.toHaveBeenCalled();
    });
  });
});
