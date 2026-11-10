import { z } from 'zod'
import { ErrRecordNotFound } from './errors'

export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid token')

export const authenticationScope = 'authentication'
export const emailChangeScope = 'email-change'

export type Token = {
  token: string
  hash: string
  user_id: number
  expires_at: number
  scope: string
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function create(db: D1Database, userId: number, lifetimeSeconds: number, scope: string): Promise<[Token, null] | [null, Error]> {
  try {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
    const hash = await hashToken(token)
    const now = Date.now()
    const expires_at = now + lifetimeSeconds * 1000
    await db.batch([
      db.prepare('DELETE FROM tokens WHERE expires_at <= ?').bind(now),
      db.prepare('INSERT INTO tokens (hash, user_id, expires_at, scope) VALUES (?, ?, ?, ?)')
        .bind(hash, userId, expires_at, scope),
    ])
    return [{ token, hash, user_id: userId, expires_at, scope }, null]
  } catch (e) {
    return [null, e instanceof Error ? e : new Error(String(e))]
  }
}

export async function consume(db: D1Database, scope: string, token: string): Promise<[number, null] | [null, Error]> {
  try {
    const hash = await hashToken(token)
    const consumed = await db.prepare(`
      DELETE FROM tokens WHERE hash = ? AND scope = ? AND expires_at > ?
      RETURNING user_id
    `).bind(hash, scope, Date.now()).first<{ user_id: number }>()
    if (consumed === null) return [null, ErrRecordNotFound]
    return [consumed.user_id, null]
  } catch (e) {
    return [null, e instanceof Error ? e : new Error(String(e))]
  }
}

export async function remove(db: D1Database, scope: string, token: string): Promise<Error | null> {
  try {
    const hash = await hashToken(token)
    await db.prepare('DELETE FROM tokens WHERE hash = ? AND scope = ?').bind(hash, scope).run()
    return null
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e))
  }
}
