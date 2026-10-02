import {
  paymentTarget,
  SELECTOR_APPROVE,
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

  it('decodes the payee of NFT transfers', () => {
    const cases = [
      // ERC-721 safeTransferFrom(address,address,uint256)
      `0x42842e0e${word(BOB)}${word(ALICE)}${amount(7)}`,
      // ERC-721 safeTransferFrom(address,address,uint256,bytes)
      `0xb88d4fde${word(BOB)}${word(ALICE)}${amount(7)}${amount(128)}${amount(
        0
      )}`,
      // ERC-1155 safeTransferFrom(address,address,uint256,uint256,bytes)
      `0xf242432a${word(BOB)}${word(ALICE)}${amount(7)}${amount(1)}${amount(
        160
      )}${amount(0)}`,
      // ERC-1155 safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
      `0x2eb2c2d6${word(BOB)}${word(ALICE)}${amount(160)}${amount(224)}${amount(
        288
      )}`,
    ];
    for (const data of cases) {
      expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
        kind: 'token',
        recipient: ALICE,
        token: TOKEN,
      });
    }
  });

  it('decodes the payee of ERC-677 and ERC-777 sends', () => {
    const cases = [
      // transferAndCall(address,uint256,bytes)
      `0x4000aea0${word(ALICE)}${amount(5)}${amount(96)}${amount(0)}`,
      // send(address,uint256,bytes)
      `0x9bd9bbc6${word(ALICE)}${amount(5)}${amount(96)}${amount(0)}`,
    ];
    for (const data of cases) {
      expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
        kind: 'token',
        recipient: ALICE,
        token: TOKEN,
      });
    }
  });

  it('checks the spender of a permit, not the owner', () => {
    // permit(owner, spender, value, deadline, v, r, s)
    const data = `0xd505accf${word(BOB)}${word(ALICE)}${amount(5)}${amount(
      9
    )}${amount(27)}${amount(1)}${amount(2)}`;
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'approval',
      recipient: ALICE,
      token: TOKEN,
    });
  });

  it('treats revoking an approval as a call, not a grant', () => {
    const cases = [
      SELECTOR_APPROVE + word(ALICE) + amount(0),
      // setApprovalForAll(operator, false)
      `0xa22cb465${word(ALICE)}${amount(0)}`,
      // increaseAllowance(spender, 0)
      `0x39509351${word(ALICE)}${amount(0)}`,
      // permit with a zero value
      `0xd505accf${word(BOB)}${word(ALICE)}${amount(0)}${amount(9)}${amount(
        27
      )}${amount(1)}${amount(2)}`,
    ];
    for (const data of cases) {
      expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
        kind: 'call',
        recipient: TOKEN,
      });
    }
  });

  it('checks the spender of an approval', () => {
    const cases = [
      SELECTOR_APPROVE + word(ALICE) + amount(5),
      // setApprovalForAll(address,bool)
      `0xa22cb465${word(ALICE)}${amount(1)}`,
      // increaseAllowance(address,uint256)
      `0x39509351${word(ALICE)}${amount(5)}`,
    ];
    for (const data of cases) {
      expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
        kind: 'approval',
        recipient: ALICE,
        token: TOKEN,
      });
    }
  });

  it('checks `to` as a call when transfer calldata is truncated', () => {
    const data = SELECTOR_TRANSFER + word(ALICE).slice(0, 40);
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'call',
      recipient: TOKEN,
    });
  });

  it('refuses a dirty address word rather than truncating it', () => {
    const dirty = `ff${word(ALICE).slice(2)}`;
    expect(
      paymentTarget({ to: TOKEN, data: SELECTOR_TRANSFER + dirty + amount(1) })
    ).toStrictEqual({ kind: 'call', recipient: TOKEN });
    expect(
      paymentTarget({ to: TOKEN, data: SELECTOR_APPROVE + dirty + amount(1) })
    ).toStrictEqual({ kind: 'call', recipient: TOKEN });
    // ERC-721 safeTransferFrom with a dirty payee word
    expect(
      paymentTarget({
        to: TOKEN,
        data: `0x42842e0e${word(BOB)}${dirty}${amount(7)}`,
      })
    ).toStrictEqual({ kind: 'call', recipient: TOKEN });
  });

  it('checks `to` as a call for any other contract call', () => {
    // swapExactETHForTokens(uint256,address[],address,uint256)
    const data = `0x7ff36ab5${amount(0)}${amount(128)}${word(ALICE)}${amount(
      9
    )}`;
    expect(paymentTarget({ to: TOKEN, data })).toStrictEqual({
      kind: 'call',
      recipient: TOKEN,
    });
  });

  it('does not treat object keys in the calldata as selectors', () => {
    expect(paymentTarget({ to: TOKEN, data: '__proto__' })).toStrictEqual({
      kind: 'call',
      recipient: TOKEN,
    });
  });
});
