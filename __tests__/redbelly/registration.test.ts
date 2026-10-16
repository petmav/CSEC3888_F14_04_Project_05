// Recognising the registration ("enable wallet") call, so the signing screen
// does not tell an unregistered account its registration will be rejected.
import { SELECTOR_REGISTER } from '@/constant/redbelly';
import { isRegistrationCall } from '@/utils/redbelly/registration';

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
