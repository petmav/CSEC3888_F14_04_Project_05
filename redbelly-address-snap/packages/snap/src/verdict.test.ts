import { describe, expect, it } from '@jest/globals';

import { isCritical, verdictFor } from './verdict';

describe('verdictFor', () => {
  it('reports a permissioned account as registered', () => {
    expect(verdictFor({ hasCode: false, isAllowed: true })).toBe('REGISTERED');
  });

  it('reports an unpermissioned account as not registered', () => {
    expect(verdictFor({ hasCode: false, isAllowed: false })).toBe(
      'NOT_REGISTERED',
    );
  });

  it('reports a contract as a contract rather than a warning', () => {
    // Contracts never complete identity verification, so isAllowed is false
    // for every legitimately deployed contract. Verified live against
    // Multicall3 (0xcA11...6CA11), which has 3,808 bytes of code on both
    // Redbelly networks and returns isAllowed == false. Surfacing that as a
    // warning would fire a false alarm on every ERC-20 transfer.
    expect(verdictFor({ hasCode: true, isAllowed: false })).toBe('CONTRACT');
  });

  it('reports a contract as a contract even if it is somehow permissioned', () => {
    expect(verdictFor({ hasCode: true, isAllowed: true })).toBe('CONTRACT');
  });

  it('reports an unavailable lookup as unknown, never as a pass', () => {
    expect(verdictFor(null)).toBe('UNKNOWN');
  });
});

describe('isCritical', () => {
  it('escalates only an unregistered recipient', () => {
    expect(isCritical('NOT_REGISTERED')).toBe(true);
  });

  it('does not escalate a contract, or every token transfer would raise a modal', () => {
    expect(isCritical('CONTRACT')).toBe(false);
  });

  it('does not escalate an unavailable lookup, or a flaky node would raise modals', () => {
    expect(isCritical('UNKNOWN')).toBe(false);
  });

  it('does not escalate a registered recipient', () => {
    expect(isCritical('REGISTERED')).toBe(false);
  });
});
