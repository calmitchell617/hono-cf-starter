import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../../src/env'
import { auth } from '../../src/middleware'

const app = new Hono<AppEnv>()

function userResponse(c: Context<AppEnv>) {
  const user = c.var.user
  // JSON does not serialize Sets, so expose their entries as arrays in this test fixture.
  return c.json({ ...user, permissions: [...user.permissions], roles: [...user.roles] })
}

app.get('/authenticated', ...auth({ requireAuthenticated: true }), userResponse)
app.get('/authenticated-all', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), userResponse)
app.get('/authorized', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote' }), userResponse)
app.get('/authorized-all', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote', loadAllPermissions: true }), userResponse)
app.get('/public', ...auth(), userResponse)
app.get('/public-list', ...auth({ requireAuthenticated: false, requirePermission: 'posts:list', loadAllPermissions: true }), userResponse)
app.get('/public-admin', ...auth({ requirePermission: 'users:promote' }), userResponse)

export default app
