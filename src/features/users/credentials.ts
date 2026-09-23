/**
 * Credential generators for the new-user form.
 *
 * Both use `crypto.getRandomValues` rather than `Math.random`, which is not
 * suitable for anything a user will sign in with.
 *
 * The API's rules, verified against the live endpoint:
 * - password: at least 8 characters
 * - pin: 4–8 digits, numeric only
 */

/** Characters that are easily confused when read aloud or copied by hand. */
const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'I', '5', 'S', '2', 'Z'])

const LOWER = 'abcdefghijkmnpqrstuvwxyz'.split('').filter((c) => !AMBIGUOUS.has(c))
const UPPER = 'ABCDEFGHJKLMNPQRTUVWXY'.split('').filter((c) => !AMBIGUOUS.has(c))
const DIGITS = '346789'.split('')
const SYMBOLS = '!@#$%&*?'.split('')

/** Uniformly random index, rejecting values that would bias the modulo. */
function randomIndex(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max
  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % max
}

function pick<T>(pool: T[]): T {
  return pool[randomIndex(pool.length)]
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const PASSWORD_LENGTH = 12
export const PIN_LENGTH = 6

/**
 * A 12-character password containing at least one of each character class, so
 * it satisfies stricter server-side rules if they are ever added. Ambiguous
 * glyphs are excluded because this password is read off a screen and typed by
 * someone else.
 */
export function generatePassword(length = PASSWORD_LENGTH): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  const all = [...LOWER, ...UPPER, ...DIGITS, ...SYMBOLS]
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all))
  return shuffle([...required, ...rest]).join('')
}

/** A numeric PIN. The API accepts 4–8 digits; 6 is the default. */
export function generatePin(length = PIN_LENGTH): string {
  return Array.from({ length }, () => String(randomIndex(10))).join('')
}
