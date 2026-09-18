/**
 * Minimal ABI codec for the three Redbelly calls this wallet makes.
 *
 * Ported from the Snap, which hand-rolled these rather than pulling in an ABI
 * library. Kept hand-rolled here too: the encoders are pure string functions,
 * so the whole Redbelly read path stays unit-testable with no provider and no
 * network (NFR5).
 */

/**
 * Encode a 32-byte ABI word from a number.
 *
 * @param value - The value to encode.
 * @returns 64 hex characters, no `0x` prefix.
 */
function toWord(value: number): string {
  return value.toString(16).padStart(64, '0');
}

/**
 * ABI-encode a single dynamic string argument (offset, length, padded data).
 *
 * Only ASCII registry keys are used here, so one character is one byte.
 *
 * @param value - The string to encode.
 * @returns Hex encoding of the argument, no `0x` prefix.
 */
export function encodeStringArgument(value: string): string {
  const data = [...value]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, '0');
  return toWord(32) + toWord(value.length) + padded;
}

/**
 * ABI-encode a single address argument.
 *
 * @param address - A hex address.
 * @returns 64 hex characters, no `0x` prefix.
 */
export function encodeAddressArgument(address: string): string {
  return address.toLowerCase().replace(/^0x/u, '').padStart(64, '0');
}

/**
 * Decode an address from a 32-byte ABI word.
 *
 * @param word - The returned data.
 * @returns A lowercase hex address.
 */
export function decodeAddress(word: string): string {
  const digits = word.replace(/^0x/u, '');
  if (digits.length < 40) {
    throw new Error(`Expected an address, got "${word}"`);
  }
  return `0x${digits.slice(-40)}`;
}

/**
 * Decode a boolean from a 32-byte ABI word.
 *
 * Any non-zero hex digit means true. Checking the digits directly avoids
 * `BigInt('0x')` throwing on an empty response.
 *
 * @param word - The returned data.
 * @returns The decoded boolean.
 */
export function decodeBoolean(word: string): boolean {
  const digits = word.replace(/^0x/u, '');
  return /[1-9a-f]/iu.test(digits);
}

/**
 * Decode the `(uint256, string, uint8)` returned by `getBaseGasFee`.
 *
 * @param data - The raw eth_call result.
 * @returns The fee value, its currency, and its decimal places.
 */
export function decodeBaseGasFee(
  data: string
): { value: bigint; currency: string; decimals: number } {
  const words = data.replace(/^0x/u, '');
  if (words.length < 192) {
    throw new Error(`Unexpected getBaseGasFee result: ${data}`);
  }

  const value = BigInt(`0x${words.slice(0, 64)}`);
  const stringOffset = Number(BigInt(`0x${words.slice(64, 128)}`)) * 2;
  const decimals = Number(BigInt(`0x${words.slice(128, 192)}`));

  const length = Number(
    BigInt(`0x${words.slice(stringOffset, stringOffset + 64)}`)
  );
  const bytes = words.slice(stringOffset + 64, stringOffset + 64 + length * 2);
  const currency = (bytes.match(/../gu) ?? [])
    .map((pair) => String.fromCharCode(parseInt(pair, 16)))
    .join('');

  return { value, currency, decimals };
}
