import { getUpdateContent } from 'changeLogs/index';
import { REDBELLY_ONLY } from '@/constant/redbelly';
import { create } from 'zustand';

import { wallet } from '@/ui/wallet';

export type AppVersionState = {
  firstNotice: boolean;
  updateContent: string;
  version: string;
  isNewUser?: boolean;
};

type AppVersionActions = {
  checkIfFirstLoginAsync: (locale?: string) => Promise<void>;
  afterFirstLogin: () => void;
};

export type AppVersionStore = AppVersionState & AppVersionActions;

const initialState: AppVersionState = {
  firstNotice: false,
  updateContent: '',
  version: '',
  isNewUser: true,
};

export const useAppVersionStore = create<AppVersionStore>()((set) => ({
  ...initialState,

  async checkIfFirstLoginAsync(locale = 'en') {
    const firstOpen = await wallet.getIsFirstOpen();
    const isNewUser = await wallet.getIsNewUser();
    let updateContent = await getUpdateContent();

    const version = process.env.release || '0';
    const versionMd = `${version.replace(/\./g, '')}.md`;
    const path = locale !== 'en' ? `${locale}/${versionMd}` : versionMd;

    // Redbelly-only: the bundled changelogs are Rabby's release notes.
    // (Rabby also ships none for 0.94.8, hence "Cannot find module".)
    if (REDBELLY_ONLY) {
      set({ isNewUser, version, updateContent: '' });
      return;
    }
    try {
      // https://webpack.js.org/api/module-methods/#magic-comments
      const data = await import(
        /* webpackInclude: /\.md$/ */
        /* webpackMode: "lazy" */
        /* webpackPrefetch: true */
        /* webpackPreload: true */
        `changeLogs/${path}`
      );
      if (data.default && typeof data.default === 'string') {
        updateContent = data.default;
      }
    } catch (error) {
      console.error('Changelog loading error', error);
    }

    set({
      isNewUser,
      version,
      updateContent,
      ...(firstOpen &&
        updateContent && {
          firstNotice: firstOpen,
        }),
    });
  },

  afterFirstLogin() {
    void wallet.updateIsFirstOpen();
    set({ firstNotice: false });
  },
}));
