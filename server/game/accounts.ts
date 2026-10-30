// Lightweight accounts: a username + password (and a one-time recovery code) that map to a player's
// secret key, so a nation can be reached from any device. Passwords are hashed with scrypt.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { GameError } from './military'

export interface Account { user: string; salt: string; hash: string; rsalt: string; rhash: string; token: string; created: number }

const hash = (secret: string, salt: string) => scryptSync(secret, salt, 32).toString('hex')
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
const norm = (u: string) => u.trim().toLowerCase()

/** XXXX-XXXX-XXXX, no ambiguous characters. */
function recoveryCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = randomBytes(12)
  return Array.from(b, x => A[x % A.length]).join('').replace(/(.{4})(?=.)/g, '$1-')
}

export function claim(accounts: Record<string, Account>, token: string, user: string, pass: string, tick: number) {
  user = user.trim()
  if (!/^[\w.-]{3,24}$/.test(user)) throw new GameError('Username: 3–24 letters, numbers, dots, dashes or underscores.')
  if (pass.length < 8) throw new GameError('Password: at least 8 characters.')
  const existing = Object.values(accounts).find(a => a.token === token)
  const key = norm(user)
  if (accounts[key] && accounts[key].token !== token) throw new GameError('That username is taken.')
  if (existing && norm(existing.user) !== key) delete accounts[norm(existing.user)]
  const code = recoveryCode()
  const salt = randomBytes(16).toString('hex'), rsalt = randomBytes(16).toString('hex')
  accounts[key] = { user, salt, hash: hash(pass, salt), rsalt, rhash: hash(code, rsalt), token, created: tick }
  return code
}

/** Password or recovery code → the player's secret key. */
export function login(accounts: Record<string, Account>, user: string, secret: string) {
  const a = accounts[norm(user)]
  const s = secret.trim()
  if (a && (same(hash(s, a.salt), a.hash) || same(hash(s.toUpperCase(), a.rsalt), a.rhash))) return a.token
  throw new GameError('Wrong username or password.')
}

export const accountOf = (accounts: Record<string, Account>, token: string | null) =>
  token ? Object.values(accounts).find(a => a.token === token)?.user ?? null : null
