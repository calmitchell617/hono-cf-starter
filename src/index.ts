import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import snippets from './handlers/snippets'
import home from './handlers/home'
import * as errors from './handlers/errors'
import { standardMiddleware, auth } from './middleware'
import type { AppEnv } from './env'
import authRoutes from './handlers/auth'
import settings from './handlers/settings'

const app = new Hono<AppEnv>()

app.use('*', ...standardMiddleware)

app.get('/ping', (c) => c.text('OK'))

app.notFound((c) => errors.notFoundResponse(c))
app.onError((err, c) => {
  if (err instanceof HTTPException && err.status === 403) {
    return errors.forbiddenResponse(c)
  }
  if (err instanceof HTTPException && err.status === 400) {
    return errors.clientErrorResponse(c, err)
  }

  return errors.serverErrorResponse(c, err)
})

const dynamic = new Hono<AppEnv>()
dynamic.route('/', home)
dynamic.route('/', authRoutes)
dynamic.route('/snippets', snippets)
dynamic.route('/settings', settings)
dynamic.all('*', ...auth(), c => errors.notFoundResponse(c))

app.route('/', dynamic)

export default app
