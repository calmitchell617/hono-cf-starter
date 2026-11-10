import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { csrf } from 'hono/csrf'
import { useSession } from '@hono/session'
import snippets from './handlers/snippets'
import home from './handlers/home'
import * as errors from './handlers/errors'
import { securityHeaders, rateLimit, sessionStorageMiddleware } from './middleware'
import type { SessionValues } from './middleware'
import type { AppEnv } from './env'
import authRoutes from './handlers/auth'
import settings from './handlers/settings'

const app = new Hono<AppEnv>()

const standard = [
  logger(message => console.log(message.replace(/\?[^ ]*/g, ''))),
  securityHeaders,
] as const
const dynamic = [
  rateLimit,
  sessionStorageMiddleware,
  useSession<SessionValues>(),
  csrf(),
] as const

app.use('*', ...standard)

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

const routes = new Hono<AppEnv>()
routes.route('/', home)
routes.route('/', authRoutes)
routes.route('/snippets', snippets)
routes.route('/settings', settings)
routes.all('*', ...dynamic, c => errors.notFoundResponse(c))

app.route('/', routes)

export default app
