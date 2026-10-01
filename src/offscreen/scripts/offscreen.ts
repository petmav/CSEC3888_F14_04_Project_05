// Must stay the first import: installs the Redbelly-only network guard
// before any other module can open a connection.
import '@/utils/redbelly/networkGuard';
import { initBitBox02 } from './bitbox02';
import { initImKey } from './imkey';
import initLattice from './lattice';
import { initLedger } from './ledger';
import { initOneKey } from './onekey';
import { initTrezor } from './trezor';

initImKey();
initOneKey();
initTrezor();
initBitBox02();
initLattice();
initLedger();

const keepServiceWorkerAlive = () => {
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'ping' });
  }, 5 * 1000);
};

keepServiceWorkerAlive();
