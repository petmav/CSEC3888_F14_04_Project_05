import {
  paymentTarget,
  SELECTOR_TRANSFER,
  SELECTOR_TRANSFER_FROM,
} from '@/utils/redbelly/recipient';

const TOKEN = '0x8201c02d4ab2214471e8c3ad6475c8b0cd9f2d06';
const ALICE = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';
const BOB = '0x30025e9f7b5b3b2e389ba1a1de08a006aa217fe1';

const word = (address: string) => address.slice(2).padStart(64, '0');
const amount = (units: number) => units.toString(16).padStart(64, '0');

describe('paymentTarget', () => {
  it('treats a plain send as paying `to`', () => {
    expect(paymentTarget({ to: ALICE, data: '0x' })).toStrictEqual({
      kind: 'native',
      recipient: ALICE,
    });
    expect(paymentTarget({ to: ALICE })).toStrictEqual({
      kind: 'native',
      recipient: ALICE,
    });
  });

  it('has nobody to check on contract creation', () => {
    expect(paymentTarget({ data: '0x6080' })).toStrictEqual({ kind: 'none' });
    expect(paymentTarget({ to: '', data: '0x6080' })).toStrictEqual({
      kind: 'none',
    });
  });

  it('decodes the payee of an ERC-20 transfer, not the token contract', () => {
    const data = SELECTOR_TRANSFER + word(ALICE) + amount(5);
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'token',
      recipient: ALICE,
      token: TOKEN,
    });
  });

  it('decodes the payee of transferFrom from the second argument', () => {
    const data = SELECTOR_TRANSFER_FROM + word(BOB) + word(ALICE) + amount(5);
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'token',
      recipient: ALICE,
      token: TOKEN,
    });
  });

  it('is case-insensitive on calldata and normalises the payee', () => {
    const data = (SELECTOR_TRANSFER + word(ALICE) + amount(1))
      .toUpperCase()
      .replace('0X', '0x');
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'token',
      recipient: ALICE,
      token: TOKEN,
    });
  });

  it('falls back to checking `to` when transfer calldata is truncated', () => {
    const data = SELECTOR_TRANSFER + word(ALICE).slice(0, 40);
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'native',
      recipient: TOKEN,
    });
  });

  it('refuses a dirty address word rather than truncating it', () => {
    const dirty = `ff${word(ALICE).slice(2)}`;
    const data = SELECTOR_TRANSFER + dirty + amount(1);
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'native',
      recipient: TOKEN,
    });
  });

  it('checks `to` for any other contract call', () => {
    expect(
      paymentTarget({ to: TOKEN, data: `0x095ea7b3${word(ALICE)}` })
    ).toStrictEqual({ kind: 'native', recipient: TOKEN });
  });
});
