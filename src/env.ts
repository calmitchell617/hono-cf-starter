import type { SessionEnv } from '@hono/session'
import type { SessionValues } from './middleware'
import type { User } from './handlers/models/users'

export type AppEnv = SessionEnv<SessionValues> & {
  Bindings: CloudflareBindings
  Variables: { user: User }
}

