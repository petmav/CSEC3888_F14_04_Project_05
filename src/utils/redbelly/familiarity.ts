/**
 * Has the user dealt with this address before? A local stand-in for the
 * phishing checks the Redbelly-only build gives up: Rabby's own rules query
 * its servers, but "you have never paid this address" and "this address
 * imitates one you have" need nothing but the wallet's own data.
 *
 * Address poisoning is the attack the second check is for: a scammer sends
 * a dust transfer from an address that shares the first and last characters
 * of one the user pays often, hoping the user copies it out of their history
 * next time. Wallets shorten addresses to exactly those characters, so the
 * two look identical at a glance.
 *
 * Pure and synchronous (NFR5).
 */

/** Hex characters compared at each end, after `0x`. */
export const LOOKALIKE_CHARS = 4;

export type Familiarity =
  /** The user's own account, a contact, or an address paid before. */
  | { kind: 'known' }
  /** Never seen; worth saying, not worth blocking. */
  | { kind: 'new' }
  /** Not seen, but shares both ends with `similarTo`, which was. */
  | { kind: 'lookalike'; similarTo: string };

const normalise = (address: string) => address.trim().toLowerCase();

const ends = (address: string) => {
  const hex = normalise(address).replace(/^0x/u, '');
  return `${hex.slice(0, LOOKALIKE_CHARS)}:${hex.slice(-LOOKALIKE_CHARS)}`;
};

/**
 * Classify `recipient` against the addresses the user already knows.
 *
 * @param recipient - The address being paid or approved.
 * @param known - The user's accounts, contacts and past payees.
 * @returns Whether the address is known, new, or imitates a known one.
 */
export function recipientFamiliarity(
  recipient: string,
  known: Iterable<string>
): Familiarity {
  const target = normalise(recipient);
  const targetEnds = ends(target);
  let similarTo: string | null = null;
  for (const address of known) {
    const candidate = normalise(address);
    if (candidate === target) {
      return { kind: 'known' };
    }
    if (similarTo === null && ends(candidate) === targetEnds) {
      similarTo = candidate;
    }
  }
  return similarTo ? { kind: 'lookalike', similarTo } : { kind: 'new' };
}
