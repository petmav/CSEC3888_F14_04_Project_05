import { recipientFamiliarity } from '@/utils/redbelly/familiarity';

const ALICE = '0xfbc724445400a693dfd8c3c59cb2d0f0de52d1af';
const BOB = '0xcb385cd90ca6b219798f57b4a7958897e91a9163';
// Same first four and last four hex characters as ALICE.
const POISONED = '0xfbc7000000000000000000000000000000d0d1af';

describe('recipientFamiliarity', () => {
  it('knows an address it has seen, whatever its case', () => {
    expect(recipientFamiliarity(ALICE.toUpperCase(), [BOB, ALICE])).toEqual({
      kind: 'known',
    });
  });

  it('calls an unseen address new', () => {
    expect(recipientFamiliarity(BOB, [ALICE])).toEqual({ kind: 'new' });
    expect(recipientFamiliarity(BOB, [])).toEqual({ kind: 'new' });
  });

  it('flags an address that imitates a known one', () => {
    expect(recipientFamiliarity(POISONED, [BOB, ALICE])).toEqual({
      kind: 'lookalike',
      similarTo: ALICE,
    });
  });

  it('prefers an exact match over a lookalike', () => {
    expect(recipientFamiliarity(ALICE, [POISONED, ALICE])).toEqual({
      kind: 'known',
    });
  });

  it('needs both ends to match', () => {
    const sameStart = '0xfbc7111111111111111111111111111111111111';
    const sameEnd = '0x111111111111111111111111111111111111d1af';
    expect(recipientFamiliarity(sameStart, [ALICE])).toEqual({ kind: 'new' });
    expect(recipientFamiliarity(sameEnd, [ALICE])).toEqual({ kind: 'new' });
  });
});
