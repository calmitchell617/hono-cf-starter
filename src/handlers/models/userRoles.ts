export async function insert(db: D1Database, userId: number, roleCode: string): Promise<Error | null> {
  try {
    await db.prepare(`
      INSERT INTO user_roles (user_id, role_code)
      VALUES (?, ?)
      ON CONFLICT (user_id, role_code) DO NOTHING
    `).bind(userId, roleCode).run()
    return null
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e))
  }
}
