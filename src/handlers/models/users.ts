import { toError } from '../../lib'
import { z } from 'zod'
import { ErrEditConflict, ErrRecordNotFound } from './errors'
import type { Permission } from './permissions'
import { anonymousPermissions } from './permissions'
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
  readonly permissions: ReadonlySet<Permission>
  readonly roles: ReadonlySet<string>

  constructor(user: UserRow, permissions: ReadonlySet<Permission> = new Set(), roles: ReadonlySet<string> = new Set()) {
    this.id = user.id
    this.name = user.name
    this.email = user.email
    this.created_at = user.created_at
    this.version = user.version
    this.auth_version = user.auth_version
    this.permissions = permissions
    this.roles = roles
  }

  isAnonymous(): boolean {
    return this === anonymousUser
  }
}

export const anonymousUser = Object.freeze(new User(
  { id: 0, name: '', email: '', created_at: 0, version: 0, auth_version: 0 },
  anonymousPermissions,
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

export async function getByIDWithPermissions(db: D1Database, id: number): Promise<[User, null] | [null, Error]> {
  try {
    const { results } = await db.prepare(`
      SELECT DISTINCT users.id, users.name, users.email, users.created_at, users.version, users.auth_version,
        permissions.code
      FROM users
      LEFT JOIN user_roles ON user_roles.user_id = users.id
      LEFT JOIN role_permissions ON role_permissions.role_code = user_roles.role_code
      LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE users.id = ?
    `).bind(id).all<UserRow & { code: Permission | null }>()
    if (results.length === 0) return [null, ErrRecordNotFound]
    // Skip null codes and collect granted permissions into a Set for fast membership checks.
    const permissions = new Set(results.flatMap(row => row.code === null ? [] : [row.code]))
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
    // Skip null roles and collect the role names into a Set for fast membership checks.
    const roles = new Set(results.flatMap(row => row.role === null ? [] : [row.role]))
    return [new User(results[0], new Set(), roles), null]
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

export async function insert(db: D1Database, input: { name: string; email: string }): Promise<[User, null] | [null, Error]> {
  try {
    const results = await db.batch<UserRow>([db.prepare(`
      INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO NOTHING
      RETURNING id, name, email, created_at, version, auth_version
    `).bind(input.name, input.email, Date.now()), db.prepare(`
      INSERT INTO user_roles (user_id, role_code)
      SELECT users.id, 'public' FROM users
      -- Only assign a role if the preceding statement created a user.
      WHERE users.email = ? AND changes() = 1
    `).bind(input.email)])
    const userInsertResult = results[0]
    // If the email already existed, the insert returned no rows. Load the existing user instead.
    if (userInsertResult.results.length === 0) {
      return getByEmail(db, input.email)
    }
    const user = userInsertResult.results[0]
    return [new User(user), null]
  } catch (e) {
    return [null, toError(e)]
  }
}
