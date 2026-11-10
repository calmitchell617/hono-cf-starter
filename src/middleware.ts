import { secureHeaders } from 'hono/secure-headers'
import { useSession, useSessionStorage } from '@hono/session'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env'
import { csrf } from 'hono/csrf'
import { bodyLimit } from 'hono/body-limit'
import { rateLimitResponse } from './handlers/errors'
import * as errors from './handlers/errors'
import * as permissionsModel from './handlers/models/permissions'
import * as users from './handlers/models/users'
import { ErrRecordNotFound } from './handlers/models/errors'

export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
  },
  referrerPolicy: 'no-referrer',
  xFrameOptions: 'DENY',
  strictTransportSecurity: 'max-age=15552000',
})

export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const { success } = await c.env.RATE_LIMIT.limit({
    key: `ip:${c.req.header('cf-connecting-ip') ?? 'local'}`,
  })
  if (!success) {
    c.header('Cache-Control', 'no-store')
    return rateLimitResponse(c, 10)
  }
  await next()
})

export type SessionValues = {
  userId?: number
  flash?: string
}

// KV storage pattern from Hono's session example, including background writes and the 30-day TTL:
// https://github.com/honojs/middleware/blob/main/packages/session/examples/cloudflare-kv.ts
export const sessionStorageMiddleware = useSessionStorage<SessionValues, AppEnv>((c) => ({
  delete(sid) {
    c.executionCtx.waitUntil(c.env.SESSION_KV.delete(sid))
  },
  get(sid) {
    return c.env.SESSION_KV.get<SessionValues>(sid, 'json')
  },
  set(sid, data) {
    c.executionCtx.waitUntil(
      c.env.SESSION_KV.put(sid, JSON.stringify(data), {
        expirationTtl: 2_592_000,
      }),
    )
  },
}))

const loginBodyLimit = bodyLimit({
  maxSize: 4096,
  onError: c => errors.clientErrorResponse(c, new Error('The submitted form is too large')),
})

const preventCaching = createMiddleware<AppEnv>(async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})

type AuthOptions = {
  requireAuthenticated?: boolean
  requirePermission?: permissionsModel.Permission
  loadAllPermissions?: boolean
}

export function authenticate(options: AuthOptions) {
  const permission = options.requirePermission
  let getUser: typeof users.getByID = users.getByID
  if (options.loadAllPermissions) {
    getUser = users.getByIDWithPermissions
  } else if (permission !== undefined) {
    getUser = (db, id) => users.getByIDWithPermissions(db, id, [permission])
  }

  return createMiddleware<AppEnv>(async (c, next) => {
    const session = await c.var.session.get()
    const userId = typeof session?.userId === 'number' ? session.userId : null
    c.set('user', users.anonymousUser)
    if (userId !== null) {
      c.header('Cache-Control', 'no-store')
      const [user, err] = await getUser(c.env.MY_DB, userId)
      if (err !== null) {
        switch (err) {
          case ErrRecordNotFound:
            c.var.session.delete()
            break
          default:
            return errors.serverErrorResponse(c, err)
        }
      } else {
        c.set('user', user)
      }
    }
    await next()
  })
}

export function enforceAccess(options: AuthOptions) {
  const permission = options.requirePermission
  return createMiddleware<AppEnv>(async (c, next) => {
    if (options.requireAuthenticated) {
      c.header('Cache-Control', 'no-store')
      if (c.var.user.isAnonymous()) return c.redirect('/login', 303)
    }
    if (permission !== undefined && !permissionsModel.hasPermission(c.var.user.permissions, permission)) {
      return errors.notPermittedResponse(c)
    }
    await next()
  })
}

export function auth(options: AuthOptions = {}) {
  return [
    rateLimit,
    sessionStorageMiddleware,
    useSession<SessionValues>(),
    csrf(),
    authenticate(options),
    enforceAccess(options),
  ] as const
}

export const authMiddleware = [
  rateLimit,
  loginBodyLimit,
  sessionStorageMiddleware,
  useSession<SessionValues>(),
  csrf(),
  authenticate({}),
  enforceAccess({}),
  preventCaching,
] as const
