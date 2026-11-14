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
import * as userRoles from './models/userRoles'
import * as tokens from './models/tokens'
import { sendEmailChange } from '../mailer/email-change'
import type { EmailChangeConfirmPageProps } from '../templates/pages/email-change-confirm'

const app = new Hono<AppEnv>()

app.get('/', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), async c => {
  const [page, err] = templates.settingsPage(await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

const changeNameInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use 100 characters or fewer'),
})
export type ChangeNameInput = z.infer<typeof changeNameInputSchema>

app.post('/change-name', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = changeNameInputSchema.safeParse(form)
  if (!result.success) {
    const formErrors = helpers.getValidationErrors(form, result.error)
    const [page, err] = templates.settingsPage(await helpers.newTemplateData(c), {
      nameValues: formErrors.values, nameFieldErrors: formErrors.fieldErrors, nameFormErrors: formErrors.formErrors,
    })
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

const changeAdminsInputSchema = z.object({ email: users.emailSchema })
export type ChangeAdminsInput = z.infer<typeof changeAdminsInputSchema>

app.post('/change-admins', ...auth({ requireAuthenticated: true, requirePermission: 'users:promote' }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = changeAdminsInputSchema.safeParse(form)
  if (!result.success) {
    const formErrors = helpers.getValidationErrors(form, result.error)
    const [page, err] = templates.settingsPage(await helpers.newTemplateData(c), {
      adminValues: formErrors.values, adminFieldErrors: formErrors.fieldErrors, adminFormErrors: formErrors.formErrors,
    })
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const { email } = result.data
  const [user, userErr] = await users.getByEmail(c.env.MY_DB, email)
  if (userErr === ErrRecordNotFound) {
    const [page, renderErr] = templates.settingsPage(await helpers.newTemplateData(c), {
      adminValues: { email }, adminFieldErrors: { email: ['No account found with that email address.'] },
    })
    if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
    return c.html(page, 400)
  }
  if (userErr !== null) return errors.serverErrorResponse(c, userErr)
  const err = await userRoles.insert(c.env.MY_DB, user.id, 'admin')
  if (err !== null) return errors.serverErrorResponse(c, err)
  await c.var.session.update(previous => ({ ...previous, flash: `${email} is now an admin.` }))
  return c.redirect('/settings', 303)
})

async function renderEmailChange(c: Context, formData: EmailChangeConfirmPageProps = {}, status: ContentfulStatusCode = 200) {
  const [page, err] = templates.emailChangeConfirmPage(await helpers.newTemplateData(c), formData)
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page, status)
}

const changeEmailInputSchema = z.object({ email: users.emailSchema })
export type ChangeEmailInput = z.infer<typeof changeEmailInputSchema>

app.post('/change-email', ...auth({ requireAuthenticated: true, loadAllPermissions: true }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = changeEmailInputSchema.safeParse(form)
  const renderInvalid = async (formErrors: { values?: Record<string, string>; fieldErrors?: { email?: string[] }; formErrors?: string[] }) => {
    const [page, err] = templates.settingsPage(await helpers.newTemplateData(c), {
      emailValues: formErrors.values, emailFieldErrors: formErrors.fieldErrors, emailFormErrors: formErrors.formErrors,
    })
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  if (!result.success) return renderInvalid(helpers.getValidationErrors(form, result.error))
  const { email } = result.data
  if (email === c.var.user.email) return renderInvalid({ values: { email }, fieldErrors: { email: ['Enter a different email address.'] } })
  const [existing, lookupErr] = await users.getByEmail(c.env.MY_DB, email)
  if (lookupErr !== null && lookupErr !== ErrRecordNotFound) return errors.serverErrorResponse(c, lookupErr)
  if (existing !== null) return renderInvalid({ values: { email }, fieldErrors: { email: ['An account already uses that email address.'] } })

  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: `email:${c.var.user.email}` })
  if (!success) return errors.rateLimitResponse(c)

  const lifetimeSeconds = c.env.LOGIN_TOKEN_LIFETIME_SECONDS
  const [created, tokenErr] = await tokens.createEmailChange(c.env.MY_DB, c.var.user, email, lifetimeSeconds)
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)
  const url = new URL('/settings/email/confirm', c.env.APP_URL)
  url.searchParams.set('email', email)
  url.searchParams.set('token', created.currentCode)
  let sendErr = await sendEmailChange(c.env.EMAIL, c.env.EMAIL_FROM, c.var.user.email, url.toString(), created.currentCode, lifetimeSeconds)
  if (sendErr === null) {
    url.searchParams.delete('token')
    url.searchParams.set('newToken', created.newCode)
    sendErr = await sendEmailChange(c.env.EMAIL, c.env.EMAIL_FROM, email, url.toString(), created.newCode, lifetimeSeconds)
  }
  if (sendErr !== null) {
    const removeErr = await tokens.remove(c.env.MY_DB, tokens.emailChangeScope, created.token)
    if (removeErr !== null) console.error(removeErr)
    return errors.serverErrorResponse(c, sendErr)
  }
  await c.var.session.update(previous => ({ ...previous, flash: 'We sent a code to each email address. Enter both codes below to confirm the change.' }))
  const query = new URLSearchParams({ email })
  return c.redirect(`/settings/email/confirm?${query}`, 303)
})

app.get('/email/confirm', ...auth({ requireAuthenticated: true }), c => {
  return renderEmailChange(c, { emailChangeConfirmValues: { email: c.req.query('email') ?? '', token: c.req.query('token') ?? '', newToken: c.req.query('newToken') ?? '' } })
})

const confirmEmailChangeInputSchema = z.object({
  email: users.emailSchema,
  token: tokens.tokenSchema,
  newToken: tokens.tokenSchema,
})
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeInputSchema>

app.post('/email/confirm', ...auth({ requireAuthenticated: true }), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = confirmEmailChangeInputSchema.safeParse(form)
  if (!result.success) {
    const formErrors = helpers.getValidationErrors(form, result.error)
    return renderEmailChange(c, {
      emailChangeConfirmValues: formErrors.values, emailChangeConfirmFieldErrors: formErrors.fieldErrors, emailChangeConfirmFormErrors: formErrors.formErrors,
    }, 400)
  }
  const { email, token, newToken } = result.data
  const invalidEmail = (message: string) => renderEmailChange(c, {
    emailChangeConfirmValues: { email, token, newToken }, emailChangeConfirmFieldErrors: { email: [message] },
  }, 400)
  if (email === c.var.user.email) return invalidEmail('Enter a different email address.')
  const [existing, lookupErr] = await users.getByEmail(c.env.MY_DB, email)
  if (lookupErr !== null && lookupErr !== ErrRecordNotFound) return errors.serverErrorResponse(c, lookupErr)
  if (existing !== null) return invalidEmail('An account already uses that email address.')

  const invalidToken = () => renderEmailChange(c, {
    emailChangeConfirmValues: { email, token, newToken }, emailChangeConfirmFormErrors: ['These codes are invalid, expired, or already used. Request new codes from settings.'],
  }, 400)
  const combinedToken = tokens.emailChangeToken(email, token, newToken)
  const [tokenUser, tokenErr] = await users.getForToken(c.env.MY_DB, tokens.emailChangeScope, combinedToken)
  if (tokenErr === ErrRecordNotFound) return invalidToken()
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)
  if (tokenUser.id !== c.var.user.id) return invalidToken()

  const [, consumeErr] = await tokens.consume(c.env.MY_DB, tokens.emailChangeScope, combinedToken)
  if (consumeErr === ErrRecordNotFound) return invalidToken()
  if (consumeErr !== null) return errors.serverErrorResponse(c, consumeErr)

  const user = new users.User({ ...tokenUser, email, auth_version: tokenUser.auth_version + 1 })
  const [, err] = await users.updateUser(c.env.MY_DB, user)
  if (err === ErrEditConflict) return errors.editConflictResponse(c)
  if (err !== null) return errors.serverErrorResponse(c, err)
  await c.var.session.update(previous => ({ ...previous, flash: 'Email address updated.' }))
  return c.redirect('/settings', 303)
})

export default app
