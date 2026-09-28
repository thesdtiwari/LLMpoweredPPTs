export type IdPrefix = 'deck' | 'sld' | 'el' | 'ser';

/** Injected into operations so they stay deterministic under test. */
export type IdGenerator = (prefix: IdPrefix) => string;

export const randomId: IdGenerator = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;

export function sequentialIds(): IdGenerator {
  let n = 0;
  return (prefix) => `${prefix}_${++n}`;
}
