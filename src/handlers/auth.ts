import { Hono } from 'hono'
import { z } from 'zod'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../env'
import * as users from './models/users'
import * as tokens from './models/tokens'
import { ErrRecordNotFound } from './models/errors'
import * as templates from '../templates'
import * as helpers from './helpers'
import * as errors from './errors'
import { sendLoginLink } from '../mailer/login-link'
import { auth, loginBodyLimit, preventCaching } from '../middleware'

const app = new Hono<AppEnv>()

async function emailLoginLink(c: Context<AppEnv>, user: users.User): Promise<Response> {
  const lifetimeSeconds = c.env.LOGIN_TOKEN_LIFETIME_SECONDS
  const [created, tokenErr] = await tokens.create(c.env.MY_DB, user, lifetimeSeconds, tokens.authenticationScope)
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)

  const url = new URL('/login/confirm', c.env.APP_URL)
  url.searchParams.set('token', created.token)
  const sendErr = await sendLoginLink(c.env.EMAIL, c.env.EMAIL_FROM, user.email, url.toString(), lifetimeSeconds)
  if (sendErr !== null) {
    const removeErr = await tokens.remove(c.env.MY_DB, tokens.authenticationScope, created.token)
    if (removeErr !== null) console.error(removeErr)
    return errors.serverErrorResponse(c, sendErr)
  }
  return c.redirect('/login/check-email', 303)
}

app.get('/login', preventCaching, ...auth(), async c => {
  const [page, err] = templates.loginPage(await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})


const loginInputSchema = z.object({ email: users.emailSchema })
export type LoginInput = z.infer<typeof loginInputSchema>

app.post('/login', preventCaching, loginBodyLimit, ...auth(), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = loginInputSchema.safeParse(form)
  if (!result.success) {
    const formData = helpers.formValidationData(form, result.error)
    const [page, err] = templates.loginPage(await helpers.newTemplateData(c), {
      loginValues: formData.values, loginErrors: formData.errors, loginFormErrors: formData.formErrors,
    })
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }

  const input = result.data
  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: `email:${input.email}` })
  if (!success) return errors.rateLimitResponse(c)

  const [user, err] = await users.getByEmail(c.env.MY_DB, input.email)
  if (err === ErrRecordNotFound) {
    await c.var.session.update(previous => ({ ...previous, flash: 'No account found with that email address. Please create an account below.' }))
    return c.redirect(`/signup?email=${encodeURIComponent(input.email)}`, 303)
  }
  if (err !== null) return errors.serverErrorResponse(c, err)
  return emailLoginLink(c, user)
})

app.get('/signup', preventCaching, ...auth(), async c => {
  const [page, err] = templates.signupPage(await helpers.newTemplateData(c), { signupValues: { email: c.req.query('email') ?? '' } })
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

const signupInputSchema = loginInputSchema.extend({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use 100 characters or fewer'),
})
export type SignupInput = z.infer<typeof signupInputSchema>

app.post('/signup', preventCaching, loginBodyLimit, ...auth(), async c => {
  const form = await c.req.parseBody({ all: true })
  const result = signupInputSchema.safeParse(form)
  if (!result.success) {
    const formData = helpers.formValidationData(form, result.error)
    const [page, err] = templates.signupPage(await helpers.newTemplateData(c), {
      signupValues: formData.values, signupErrors: formData.errors, signupFormErrors: formData.formErrors,
    })
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const input = result.data
  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: `email:${input.email}` })
  if (!success) return errors.rateLimitResponse(c)

  const [user, err] = await users.insert(c.env.MY_DB, input)
  if (err !== null) return errors.serverErrorResponse(c, err)
  return emailLoginLink(c, user)
})

app.get('/login/check-email', preventCaching, ...auth(), async c => {
  const [page, err] = templates.checkEmailPage(await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

const loginTokenInputSchema = z.object({ token: tokens.tokenSchema })

app.get('/login/confirm', preventCaching, ...auth(), async c => {
  const input = loginTokenInputSchema.safeParse(c.req.query())
  if (!input.success) return errors.invalidLoginLinkErrorResponse(c)

  const [user, err] = await users.getForToken(c.env.MY_DB, tokens.authenticationScope, input.data.token)
  if (err === ErrRecordNotFound) return errors.invalidLoginLinkErrorResponse(c)
  if (err !== null) return errors.serverErrorResponse(c, err)

  const [page, renderErr] = templates.loginConfirmPage(input.data.token, user.email, await helpers.newTemplateData(c))
  if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
  return c.html(page)
})

app.post('/login/confirm', preventCaching, loginBodyLimit, ...auth(), async c => {
  const input = loginTokenInputSchema.safeParse(await c.req.parseBody())
  if (!input.success) return errors.invalidLoginLinkErrorResponse(c)

  const [, tokenErr] = await users.getForToken(c.env.MY_DB, tokens.authenticationScope, input.data.token)
  if (tokenErr === ErrRecordNotFound) return errors.invalidLoginLinkErrorResponse(c)
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)

  // Clear an existing session before creating the authenticated session, so the
  // package generates a fresh ID. Leave the token usable for the redirected POST.
  if (getCookie(c, 'sid') && await c.var.session.get() !== null) {
    c.var.session.delete()
    return c.redirect(`/login/confirm?token=${input.data.token}`, 303)
  }

  const [userId, consumeErr] = await tokens.consume(c.env.MY_DB, tokens.authenticationScope, input.data.token)
  if (consumeErr === ErrRecordNotFound) return errors.invalidLoginLinkErrorResponse(c)
  if (consumeErr !== null) return errors.serverErrorResponse(c, consumeErr)

  await c.var.session.update({ userId })
  return c.redirect('/', 303)
})

app.post('/logout', preventCaching, loginBodyLimit, ...auth(), async c => {
  await c.var.session.get()
  c.var.session.delete()
  return c.redirect('/', 303)
})

export default app
