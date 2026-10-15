import { useDesktopProfileStore } from '@/ui/state/desktopProfile';

describe('desktop profile store', () => {
  beforeEach(() => {
    useDesktopProfileStore.setState({
      activeTab: 'tokens',
      addAddress: {
        visible: false,
        importType: '',
      },
    });
  });

  test('uses the existing desktop profile defaults', () => {
    expect(useDesktopProfileStore.getState()).toMatchObject({
      activeTab: 'tokens',
      addAddress: {
        visible: false,
        importType: '',
      },
    });
  });

  test('updates desktop-only state through domain actions', () => {
    const store = useDesktopProfileStore.getState();

    store.setActiveTab('transactions');
    store.setAddAddress({
      visible: true,
      importType: 'import-key-or-seed',
      state: { source: 'desktop' },
    });

    expect(useDesktopProfileStore.getState()).toMatchObject({
      activeTab: 'transactions',
      addAddress: {
        visible: true,
        importType: 'import-key-or-seed',
        state: { source: 'desktop' },
      },
    });
  });
});
