import { blocksSigning, verdictFor } from '@/utils/redbelly/verdict';
import type { Verdict } from '@/utils/redbelly/verdict';

describe('blocksSigning', () => {
  it('refuses a confirmed unregistered recipient', () => {
    expect(blocksSigning('NOT_REGISTERED')).toBe(true);
    expect(
      blocksSigning(verdictFor({ hasCode: false, isAllowed: false }))
    ).toBe(true);
  });

  it.each<Verdict>(['REGISTERED', 'CONTRACT', 'UNKNOWN'])(
    'does not refuse %s',
    (verdict) => {
      expect(blocksSigning(verdict)).toBe(false);
    }
  );

  it('does not refuse when the check could not run (an outage must not brick the wallet)', () => {
    expect(blocksSigning(verdictFor(null))).toBe(false);
  });

  it('does not refuse a contract, whose isAllowed is always false', () => {
    expect(blocksSigning(verdictFor({ hasCode: true, isAllowed: false }))).toBe(
      false
    );
  });
});
