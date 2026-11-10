import { Hono } from 'hono'
import type { AppEnv } from '../../src/env'
import { sessionStorageMiddleware, sessionMiddleware } from '../../src/middleware'

const app = new Hono<AppEnv>()
app.use('*', sessionStorageMiddleware)
app.use('*', sessionMiddleware)

app.post('/login', async c => {
  await c.var.session.update({ userId: 123 })
  return c.redirect('/read', 303)
})

app.get('/read', async c => c.json(await c.var.session.get()))

app.post('/logout', async c => {
  await c.var.session.get()
  c.var.session.delete()
  return c.redirect('/read', 303)
})

export default app
