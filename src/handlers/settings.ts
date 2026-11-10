import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../env'
import { auth } from '../middleware'
import * as users from './models/users'
import { ErrEditConflict, ErrRecordNotFound } from './models/errors'
import * as templates from '../templates'
import * as helpers from './helpers'
import * as errors from './errors'
import * as roles from './models/roles'
import type { SettingsPageProps } from '../templates/pages/settings'
import { hasPermission } from './models/permissions'

const app = new Hono<AppEnv>()

async function renderSettings(c: Context, props: SettingsPageProps = {}, status: ContentfulStatusCode = 200) {
  const user = c.var.user
  const [page, renderErr] = templates.settingsPage({ values: user, ...props,
    canPromoteUsers: hasPermission(user.permissions, 'users:promote'),
  }, await helpers.newTemplateData(c))
  if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
  return c.html(page, status)
}

app.get('/', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), c => renderSettings(c))

app.post('/', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), zValidator('form', users.settingsInputSchema,
  (result, c: Context) => helpers.formValidationHook((props, data) => templates.settingsPage({
    ...props, canPromoteUsers: hasPermission(c.var.user.permissions, 'users:promote'),
  }, data))(result, c),
), async c => {
  const [, err] = await users.updateName(c.env.MY_DB, c.var.user, c.req.valid('form'))
  if (err !== null) {
    switch (err) {
      case ErrEditConflict:
        return errors.editConflictResponse(c)
      default:
        return errors.serverErrorResponse(c, err)
    }
  }

  await c.var.session.update(previous => ({ ...previous, flash: 'Name updated.' }))
  return c.redirect('/settings', 303)
})

app.post('/admins', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote' }), zValidator('form', users.loginInputSchema, (result, c: Context) => {
  if (!result.success) {
    const { fieldErrors, formErrors } = z.flattenError(result.error)
    return renderSettings(c, {
      adminValues: helpers.stringFormValues(result.data),
      adminErrors: fieldErrors,
      adminFormErrors: formErrors,
    }, 400)
  }
}), async c => {
  const { email } = c.req.valid('form')
  const [, err] = await roles.promoteToAdmin(c.env.MY_DB, email, c.var.user.id)
  if (err === ErrRecordNotFound) {
    return renderSettings(c, { adminValues: { email }, adminErrors: { email: ['No account found with that email address.'] } }, 400)
  }
  if (err !== null) return errors.serverErrorResponse(c, err)
  await c.var.session.update(previous => ({ ...previous, flash: `${email} is now an admin.` }))
  return c.redirect('/settings', 303)
})

export default app
