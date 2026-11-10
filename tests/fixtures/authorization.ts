import { Hono } from 'hono'
import type { AppEnv } from '../../src/env'
import { auth } from '../../src/middleware'

const app = new Hono<AppEnv>()

app.get('/authenticated', ...auth({ requireAuthenticated: true }), c => c.json(c.var.user))
app.get('/authenticated-all', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), c => c.json(c.var.user))
app.get('/authorized', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote' }), c => c.json(c.var.user))
app.get('/authorized-all', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote', loadAllPermissions: true }), c => c.json(c.var.user))
app.get('/public', ...auth(), c => c.json(c.var.user))
app.get('/public-list', ...auth({ requireAuthenticated: false, requirePermission: 'snippets:list', loadAllPermissions: true }), c => c.json(c.var.user))
app.get('/public-admin', ...auth({ requirePermission: 'users:promote' }), c => c.json(c.var.user))

export default app
