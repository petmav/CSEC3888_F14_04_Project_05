import { create } from 'zustand';

export type DesktopAddAddressState = {
  visible: boolean;
  importType: string;
  state?: Record<string, any>;
};

export type DesktopProfileState = {
  activeTab: string;
  addAddress: DesktopAddAddressState;
};

type DesktopProfileActions = {
  setActiveTab: (activeTab: string) => void;
  setAddAddress: (addAddress: DesktopAddAddressState) => void;
};

export type DesktopProfileStore = DesktopProfileState & DesktopProfileActions;

export const useDesktopProfileStore = create<DesktopProfileStore>()((set) => ({
  activeTab: 'tokens',
  addAddress: {
    visible: false,
    importType: '',
  },
  setActiveTab(activeTab) {
    set({ activeTab });
  },
  setAddAddress(addAddress) {
    set({ addAddress });
  },
}));
