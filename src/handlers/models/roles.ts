import { ErrRecordNotFound } from './errors'

export async function promoteToAdmin(db: D1Database, email: string, actorId: number): Promise<[number, null] | [null, Error]> {
  try {
    const result = await db.prepare(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT users.id, roles.id FROM users CROSS JOIN roles
      WHERE users.email = ? AND roles.name = 'admin'
        AND EXISTS (
          SELECT 1 FROM user_roles
          JOIN role_permissions ON role_permissions.role_id = user_roles.role_id
          JOIN permissions ON permissions.id = role_permissions.permission_id
          WHERE user_roles.user_id = ? AND permissions.code = 'users:promote'
        )
      ON CONFLICT (user_id, role_id) DO UPDATE SET role_id = excluded.role_id
      RETURNING user_id
    `).bind(email, actorId).first<{ user_id: number }>()
    if (result === null) return [null, ErrRecordNotFound]
    return [result.user_id, null]
  } catch (e) {
    return [null, e instanceof Error ? e : new Error(String(e))]
  }
}
