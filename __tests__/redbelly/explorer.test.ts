import { explorerPayees, explorerRows } from '@/utils/redbelly/explorer';

describe('explorerRows', () => {
  const row = { hash: '0xabc', value: '1' };

  it('returns the rows of a list', () => {
    expect(
      explorerRows({ status: '1', message: 'OK', result: [row] })
    ).toStrictEqual([row]);
  });

  it('treats an empty account as an empty list, in either API flavour', () => {
    // Routescan
    expect(
      explorerRows({ status: '1', message: 'OK', result: [] })
    ).toStrictEqual([]);
    // Etherscan
    expect(
      explorerRows({
        status: '0',
        message: 'No transactions found',
        result: [],
      })
    ).toStrictEqual([]);
  });

  it('throws on an error reported in the body, not "no activity"', () => {
    expect(() =>
      explorerRows({
        status: '0',
        message: 'NOTOK',
        result: 'Max rate limit reached',
      })
    ).toThrow('Max rate limit reached');
    expect(() =>
      explorerRows({
        status: '0',
        message: 'NOTOK',
        result: 'Invalid querystring request',
      })
    ).toThrow('Invalid querystring request');
  });

  it('throws on a body that is not a list at all', () => {
    expect(() => explorerRows({})).toThrow('unexpected response');
    expect(() => explorerRows({ message: 'Bad gateway' })).toThrow(
      'Bad gateway'
    );
  });
});

describe('explorerPayees', () => {
  const SELF = '0xb80e7a43f8a162ced2dd367a1d41f9b28cd0e7aa';
  const ALICE = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';
  const TOKEN = '0x8201c02d4ab2214471e8c3ad6475c8b0cd9f2d06';
  const POISON = '0xfbc7000000000000000000000000000000d0d1af';
  const SCAMMER = '0x1111111111111111111111111111111111111111';

  it('counts what the account sent and signed', () => {
    const native = [
      { hash: '0x1', from: SELF.toUpperCase(), to: ALICE, value: '5' },
      { hash: '0x2', from: SELF, to: TOKEN, value: '0' },
    ];
    const tokens = [{ hash: '0x2', from: SELF, to: ALICE, value: '100' }];
    expect(explorerPayees(SELF, native, tokens).sort()).toEqual(
      [ALICE, TOKEN].sort()
    );
  });

  it('ignores incoming transfers', () => {
    const native = [{ hash: '0x1', from: POISON, to: SELF, value: '1' }];
    const tokens = [{ hash: '0x2', from: POISON, to: SELF, value: '1' }];
    expect(explorerPayees(SELF, native, tokens)).toEqual([]);
  });

  it('ignores a zero-value transferFrom someone else signed', () => {
    // The scammer's transaction: not in the account's txlist, zero value.
    const native = [{ hash: '0x9', from: SCAMMER, to: TOKEN, value: '0' }];
    const tokens = [{ hash: '0x9', from: SELF, to: POISON, value: '0' }];
    expect(explorerPayees(SELF, native, tokens)).toEqual([]);
  });

  it('ignores a token row it cannot tie to a signed transaction', () => {
    const tokens = [{ hash: '0x7', from: SELF, to: POISON, value: '100' }];
    expect(explorerPayees(SELF, [], tokens)).toEqual([]);
  });

  it('ignores a zero-value token row even in a signed transaction', () => {
    const native = [{ hash: '0x3', from: SELF, to: TOKEN, value: '0' }];
    const tokens = [{ hash: '0x3', from: SELF, to: POISON, value: '0' }];
    expect(explorerPayees(SELF, native, tokens)).toEqual([TOKEN]);
  });
});
