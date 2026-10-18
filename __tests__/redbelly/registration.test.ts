// Recognising the registration ("enable wallet") call, so the signing screen
// does not tell an unregistered account its registration will be rejected.
import BigNumber from 'bignumber.js';

import { SELECTOR_REGISTER } from '@/constant/redbelly';
import {
  isRegistrationCall,
  registrationGasLimit,
} from '@/utils/redbelly/registration';

const PERMISSION = '0xcb385cd90ca6b219798f57b4a7958897e91a9163';
const OTHER = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';
const CALL = `${SELECTOR_REGISTER}${'0'.repeat(64)}`;

describe('isRegistrationCall', () => {
  it('matches the registration selector sent to the permission contract', () => {
    expect(isRegistrationCall({ to: PERMISSION, data: CALL }, PERMISSION)).toBe(
      true
    );
  });

  it('ignores the case of the address and calldata', () => {
    expect(
      isRegistrationCall(
        { to: PERMISSION.toUpperCase().replace('0X', '0x'), data: CALL },
        PERMISSION.toLowerCase()
      )
    ).toBe(true);
    expect(
      isRegistrationCall(
        { to: PERMISSION, data: CALL.toUpperCase().replace('0X', '0x') },
        PERMISSION
      )
    ).toBe(true);
  });

  it('does not match the same selector sent to another contract', () => {
    expect(isRegistrationCall({ to: OTHER, data: CALL }, PERMISSION)).toBe(
      false
    );
  });

  it('does not match another call to the permission contract', () => {
    expect(
      isRegistrationCall({ to: PERMISSION, data: '0xbabcc539' }, PERMISSION)
    ).toBe(false);
    expect(isRegistrationCall({ to: PERMISSION, data: '0x' }, PERMISSION)).toBe(
      false
    );
  });

  it('does not match when the permission contract is unknown', () => {
    expect(isRegistrationCall({ to: PERMISSION, data: CALL }, null)).toBe(
      false
    );
  });

  it('does not match contract creation or missing calldata', () => {
    expect(isRegistrationCall({ to: null, data: CALL }, PERMISSION)).toBe(
      false
    );
    expect(isRegistrationCall({ to: PERMISSION, data: null }, PERMISSION)).toBe(
      false
    );
  });
});

describe('registrationGasLimit', () => {
  // Emilia's enable transaction on Mainnet, 2026-10-15.
  const ESTIMATE = 2216438;
  const PRICE = '274245823984042';
  const RABBY_LIMIT = Math.round(ESTIMATE * 1.5);
  const TARGET = Math.ceil(ESTIMATE * 1.1);
  const rbnt = (amount: string) => new BigNumber(amount).times(1e18).toFixed(0);
  const affordable = (balance: string) =>
    new BigNumber(balance)
      .div(PRICE)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toNumber();
  const fit = (
    overrides: Partial<Parameters<typeof registrationGasLimit>[0]> = {}
  ) =>
    registrationGasLimit({
      estimate: ESTIMATE,
      ceiling: RABBY_LIMIT,
      balance: rbnt('711'),
      value: '0x0',
      gasPrice: PRICE,
      ...overrides,
    });

  it('uses 1.1x the estimate when the balance covers it', () => {
    // A freshly funded account: 711 RBNT covers 1.1x (about 668.6 RBNT).
    expect(fit()).toStrictEqual({
      gasLimit: `0x${TARGET.toString(16)}`,
      lowered: false,
    });
  });

  it('lowers the limit to what the balance covers, above the estimate', () => {
    // An account that waited: 648.6 RBNT covers the fee, not 1.1x.
    const balance = rbnt('648.6022560078469');
    const result = fit({ balance });
    const limit = Number(result!.gasLimit);
    expect(result!.lowered).toBe(true);
    expect(limit).toBe(affordable(balance));
    expect(limit).toBeGreaterThanOrEqual(ESTIMATE);
    expect(limit).toBeLessThan(TARGET);
    // The lowered limit is exactly payable.
    expect(new BigNumber(limit).times(PRICE).lte(new BigNumber(balance))).toBe(
      true
    );
  });

  it('never goes below the estimate: an unaffordable fee stays refused', () => {
    // 500 RBNT does not cover even the estimate (about 607.9 RBNT); the limit
    // is left at 1.1x so the balance check refuses it.
    expect(fit({ balance: rbnt('500') })).toStrictEqual({
      gasLimit: `0x${TARGET.toString(16)}`,
      lowered: false,
    });
  });

  it('subtracts the value the transaction sends', () => {
    // Covers 1.1x on its own; with 150 RBNT sent, not even the estimate.
    const result = fit({ balance: rbnt('711'), value: rbnt('150') });
    expect(result!.lowered).toBe(false);
    expect(result!.gasLimit).toBe(`0x${TARGET.toString(16)}`);
    const withValue = fit({ balance: rbnt('711'), value: rbnt('50') });
    expect(withValue!.lowered).toBe(true);
    expect(Number(withValue!.gasLimit)).toBe(
      affordable(new BigNumber(rbnt('661')).toFixed(0))
    );
  });

  it("keeps a dApp's higher gas, but never above Rabby's limit", () => {
    const dapp = TARGET + 50000;
    expect(fit({ dappGasLimit: dapp, balance: rbnt('900') })).toStrictEqual({
      gasLimit: `0x${dapp.toString(16)}`,
      lowered: false,
    });
    expect(
      fit({ dappGasLimit: RABBY_LIMIT * 2, balance: rbnt('2000') })
    ).toStrictEqual({
      gasLimit: `0x${RABBY_LIMIT.toString(16)}`,
      lowered: false,
    });
  });

  it('accepts hex quantities', () => {
    const balance = '0x23292a1b65a8b07887'; // 648.6 RBNT
    const result = fit({
      estimate: `0x${ESTIMATE.toString(16)}`,
      balance,
      gasPrice: `0x${new BigNumber(PRICE).toString(16)}`,
    });
    expect(result!.lowered).toBe(true);
    expect(Number(result!.gasLimit)).toBe(
      affordable(new BigNumber(balance).toFixed(0))
    );
  });

  it('changes nothing when an input is unknown', () => {
    expect(fit({ balance: null })).toBeNull();
    expect(fit({ balance: '' })).toBeNull();
    expect(fit({ gasPrice: undefined })).toBeNull();
    expect(fit({ gasPrice: 0 })).toBeNull();
    expect(fit({ estimate: null })).toBeNull();
    expect(fit({ estimate: 0 })).toBeNull();
  });
});
