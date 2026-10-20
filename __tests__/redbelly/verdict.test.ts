import {
  blocksSigning,
  isCritical,
  verdictFor,
} from '@/utils/redbelly/verdict';

describe('verdictFor', () => {
  it('reports a permissioned account as registered', () => {
    expect(verdictFor({ hasCode: false, isAllowed: true })).toBe('REGISTERED');
  });

  it('reports an unpermissioned account as not registered', () => {
    expect(verdictFor({ hasCode: false, isAllowed: false })).toBe(
      'NOT_REGISTERED'
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

  it('does not escalate a contract, or every token transfer would warn', () => {
    expect(isCritical('CONTRACT')).toBe(false);
  });

  it('does not escalate an unavailable lookup, or a flaky node would warn', () => {
    expect(isCritical('UNKNOWN')).toBe(false);
  });

  it('does not escalate a registered recipient', () => {
    expect(isCritical('REGISTERED')).toBe(false);
  });
});

describe('blocksSigning', () => {
  // US12 / FR7: the capability the Snap did not have. A Snap can annotate a
  // confirmation but never hold it; the fork waits for "I understand the
  // risks" before signing.
  it('holds signing to a confirmed unregistered recipient', () => {
    expect(blocksSigning('NOT_REGISTERED')).toBe(true);
  });

  it('allows signing when the check could not run', () => {
    // Redbelly exposes a single public RPC endpoint with no failover. Holding
    // here would make a node outage indistinguishable from a bricked wallet,
    // so UNKNOWN warns loudly (NFR2) and lets the user proceed.
    expect(blocksSigning('UNKNOWN')).toBe(false);
  });

  it('allows signing to a contract', () => {
    expect(blocksSigning('CONTRACT')).toBe(false);
  });

  it('allows signing to a registered recipient', () => {
    expect(blocksSigning('REGISTERED')).toBe(false);
  });

  it('holds exactly the verdicts it escalates, and no others', () => {
    // If these two ever diverge, the UI would either hold signing without
    // explaining why, or shout without asking for acknowledgement.
    const verdicts = [
      'REGISTERED',
      'NOT_REGISTERED',
      'CONTRACT',
      'UNKNOWN',
    ] as const;
    verdicts.forEach((verdict) => {
      expect(blocksSigning(verdict)).toBe(isCritical(verdict));
    });
  });
});
