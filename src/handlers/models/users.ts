import { toError } from '../../lib'
import { z } from 'zod'
import { ErrEditConflict, ErrRecordNotFound } from './errors'
import type { Permission, PermissionChecks } from './permissions'
import { hashToken } from './tokens'

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Enter a valid email address' }).max(254, 'Use 254 characters or fewer'))

type UserRow = {
  id: number
  name: string
  email: string
  created_at: number
  version: number
  auth_version: number
}

export class User {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly created_at: number
  readonly version: number
  readonly auth_version: number

  constructor(user: UserRow, readonly permissions: PermissionChecks = {}, readonly roles: readonly string[] = []) {
    this.id = user.id
    this.name = user.name
    this.email = user.email
    this.created_at = user.created_at
    this.version = user.version
    this.auth_version = user.auth_version
  }

  isAnonymous(): boolean {
    return this === anonymousUser
  }
}

export const anonymousUser = Object.freeze(new User(
  { id: 0, name: '', email: '', created_at: 0, version: 0, auth_version: 0 },
  Object.freeze({ 'posts:list': true }),
))

export async function getByID(db: D1Database, id: number): Promise<[User, null] | [null, Error]> {
  try {
    const user = await db.prepare('SELECT id, name, email, created_at, version, auth_version FROM users WHERE id = ?')
      .bind(id).first<UserRow>()
    if (user === null) return [null, ErrRecordNotFound]
    return [new User(user), null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function getByIDWithPermissions(db: D1Database, id: number, codes?: readonly Permission[]): Promise<[User, null] | [null, Error]> {
  try {
    const filter = codes === undefined ? '' : 'AND permissions.code IN (SELECT value FROM json_each(?))'
    const params = codes === undefined ? [id] : [JSON.stringify(codes), id]
    const { results } = await db.prepare(`
      SELECT DISTINCT users.id, users.name, users.email, users.created_at, users.version, users.auth_version,
        permissions.code
      FROM users
      LEFT JOIN user_roles ON user_roles.user_id = users.id
      LEFT JOIN role_permissions ON role_permissions.role_code = user_roles.role_code
      LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
        ${filter}
      WHERE users.id = ?
    `).bind(...params).all<UserRow & { code: Permission | null }>()
    if (results.length === 0) return [null, ErrRecordNotFound]
    const granted = new Set(results.flatMap(row => row.code === null ? [] : [row.code]))
    const permissions = Object.fromEntries((codes ?? [...granted]).map(code => [code, granted.has(code)]))
    return [new User(results[0], permissions), null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function getByIDWithRoles(db: D1Database, id: number): Promise<[User, null] | [null, Error]> {
  try {
    const { results } = await db.prepare(`
      SELECT users.id, users.name, users.email, users.created_at, users.version, users.auth_version, user_roles.role_code AS role
      FROM users
      LEFT JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.id = ?
      ORDER BY user_roles.role_code
    `).bind(id).all<UserRow & { role: string | null }>()
    if (results.length === 0) return [null, ErrRecordNotFound]
    const roles = results.flatMap(row => row.role === null ? [] : [row.role])
    return [new User(results[0], {}, roles), null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function updateUser(db: D1Database, user: User): Promise<[User, null] | [null, Error]> {
  try {
    const updatedUser = await db.prepare(`
      UPDATE users SET name = ?, email = ?, auth_version = ?, version = version + 1
      WHERE id = ? AND version = ?
      RETURNING id, name, email, created_at, version, auth_version
    `).bind(user.name, user.email, user.auth_version, user.id, user.version).first<UserRow>()
    if (updatedUser === null) return [null, ErrEditConflict]
    return [new User(updatedUser), null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function getByEmail(db: D1Database, email: string): Promise<[User, null] | [null, Error]> {
  try {
    const user = await db.prepare('SELECT id, name, email, created_at, version, auth_version FROM users WHERE email = ?')
      .bind(email).first<UserRow>()
    if (user === null) return [null, ErrRecordNotFound]
    return [new User(user), null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function getForToken(db: D1Database, scope: string, token: string): Promise<[User, null] | [null, Error]> {
  try {
    const hash = await hashToken(token)
    const user = await db.prepare(`
      SELECT users.id, users.name, users.email, users.created_at, users.version, users.auth_version
      FROM users
      JOIN tokens ON tokens.user_id = users.id
      WHERE tokens.hash = ? AND tokens.scope = ? AND tokens.expires_at > ?
        AND tokens.auth_version = users.auth_version
    `).bind(hash, scope, Date.now()).first<UserRow>()
    if (user === null) return [null, ErrRecordNotFound]
    return [new User(user), null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function insert(db: D1Database, input: Pick<User, 'name' | 'email'>): Promise<[User, null] | [null, Error]> {
  try {
    const results = await db.batch<UserRow>([db.prepare(`
      INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO NOTHING
      RETURNING id, name, email, created_at, version, auth_version
    `).bind(input.name, input.email, Date.now()), db.prepare(`
      INSERT INTO user_roles (user_id, role_code)
      SELECT users.id, 'public' FROM users
      WHERE users.email = ?
        AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = users.id)
    `).bind(input.email)])
    const user = results[0].results[0] ?? null
    // A repeated signup must never change an existing account's name.
    if (user === null) return getByEmail(db, input.email)
    return [new User(user), null]
  } catch (e) {
    return [null, toError(e)]
  }
}
