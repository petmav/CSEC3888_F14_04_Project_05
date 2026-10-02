import { explorerRows } from '@/utils/redbelly/explorer';

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
