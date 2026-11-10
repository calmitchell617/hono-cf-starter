import { Hono } from 'hono'
import { z } from 'zod'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../env'
import { auth } from '../middleware'
import * as users from './models/users'
import { ErrEditConflict, ErrRecordNotFound } from './models/errors'
import * as templates from '../templates'
import * as helpers from './helpers'
import * as errors from './errors'
import * as roles from './models/roles'
import * as tokens from './models/tokens'
import { sendEmailChange } from '../mailer/email-change'
import type { EmailChangeConfirmPageProps } from '../templates/pages/email-change-confirm'

const app = new Hono<AppEnv>()

app.get('/', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), async c => {
  const [page, err] = templates.settingsPage(await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

const settingsInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use 100 characters or fewer'),
})
export type SettingsInput = z.infer<typeof settingsInputSchema>

app.post('/', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = settingsInputSchema.safeParse(form)
  if (!result.success) {
    const [page, err] = templates.settingsPage(await helpers.newTemplateData(c), helpers.formValidationData(form, result.error))
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const user = new users.User({ ...c.var.user, ...result.data })
  const [, err] = await users.updateUser(c.env.MY_DB, user)
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

const adminInputSchema = z.object({ email: users.emailSchema })
export type AdminInput = z.infer<typeof adminInputSchema>

app.post('/admins', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote' }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = adminInputSchema.safeParse(form)
  if (!result.success) {
    const props = helpers.formValidationData(form, result.error)
    const [page, err] = templates.settingsPage(await helpers.newTemplateData(c), {
      adminValues: props.values, adminErrors: props.errors, adminFormErrors: props.formErrors,
    })
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const { email } = result.data
  const [, err] = await roles.promoteToAdmin(c.env.MY_DB, email, c.var.user.id)
  if (err === ErrRecordNotFound) {
    const [page, renderErr] = templates.settingsPage(await helpers.newTemplateData(c), {
      adminValues: { email }, adminErrors: { email: ['No account found with that email address.'] },
    })
    if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
    return c.html(page, 400)
  }
  if (err !== null) return errors.serverErrorResponse(c, err)
  await c.var.session.update(previous => ({ ...previous, flash: `${email} is now an admin.` }))
  return c.redirect('/settings', 303)
})

async function renderEmailChange(c: Context, props: EmailChangeConfirmPageProps = {}, status: ContentfulStatusCode = 200) {
  const [page, err] = templates.emailChangeConfirmPage(await helpers.newTemplateData(c), props)
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page, status)
}

app.post('/email', ...auth({ requireAuthenticated: true }), async c => {
  const { email, id } = c.var.user
  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: `email:${email}` })
  if (!success) return errors.rateLimitResponse(c)

  const lifetimeSeconds = c.env.LOGIN_TOKEN_LIFETIME_SECONDS
  const [created, tokenErr] = await tokens.create(c.env.MY_DB, id, lifetimeSeconds, tokens.emailChangeScope)
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)
  const url = new URL('/settings/email/confirm', c.env.APP_URL)
  url.searchParams.set('token', created.token)
  const sendErr = await sendEmailChange(c.env.EMAIL, c.env.EMAIL_FROM, email, url.toString(), created.token, lifetimeSeconds)
  if (sendErr !== null) {
    const removeErr = await tokens.remove(c.env.MY_DB, tokens.emailChangeScope, created.token)
    if (removeErr !== null) console.error(removeErr)
    return errors.serverErrorResponse(c, sendErr)
  }
  await c.var.session.update(previous => ({ ...previous, flash: 'We emailed a token to your current email address. Enter it below with your new address.' }))
  return c.redirect('/settings/email/confirm', 303)
})

app.get('/email/confirm', ...auth({ requireAuthenticated: true }), c => {
  return renderEmailChange(c, { values: { token: c.req.query('token') ?? '' } })
})

const emailChangeInputSchema = z.object({
  email: users.emailSchema,
  token: tokens.tokenSchema,
})
export type EmailChangeInput = z.infer<typeof emailChangeInputSchema>

app.post('/email/confirm', ...auth({ requireAuthenticated: true }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = emailChangeInputSchema.safeParse(form)
  if (!result.success) return renderEmailChange(c, helpers.formValidationData(form, result.error), 400)
  const { email, token } = result.data
  const invalidEmail = (message: string) => renderEmailChange(c, {
    values: { email, token }, errors: { email: [message] },
  }, 400)
  if (email === c.var.user.email) return invalidEmail('Enter a different email address.')
  const [existing, lookupErr] = await users.getByEmail(c.env.MY_DB, email)
  if (lookupErr !== null && lookupErr !== ErrRecordNotFound) return errors.serverErrorResponse(c, lookupErr)
  if (existing !== null) return invalidEmail('An account already uses that email address.')

  const invalidToken = () => renderEmailChange(c, {
    values: { email, token }, errors: { token: ['This token is invalid, expired, or already used. Request a new token from settings.'] },
  }, 400)
  const [tokenUser, tokenErr] = await users.getForToken(c.env.MY_DB, tokens.emailChangeScope, token)
  if (tokenErr === ErrRecordNotFound) return invalidToken()
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)
  if (tokenUser.id !== c.var.user.id) return invalidToken()

  const [, consumeErr] = await tokens.consume(c.env.MY_DB, tokens.emailChangeScope, token)
  if (consumeErr === ErrRecordNotFound) return invalidToken()
  if (consumeErr !== null) return errors.serverErrorResponse(c, consumeErr)

  const user = new users.User({ ...tokenUser, email })
  const [, err] = await users.updateUser(c.env.MY_DB, user)
  if (err === ErrEditConflict) return errors.editConflictResponse(c)
  if (err !== null) return errors.serverErrorResponse(c, err)
  await c.var.session.update(previous => ({ ...previous, flash: 'Email address updated.' }))
  return c.redirect('/settings', 303)
})

export default app
