import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../env'
import * as users from './models/users'
import * as tokens from './models/tokens'
import { ErrRecordNotFound } from './models/errors'
import * as templates from '../templates'
import * as helpers from './helpers'
import * as errors from './errors'
import { sendLoginLink } from '../mailer/login-link'
import { authMiddleware } from '../middleware'

const app = new Hono<AppEnv>()

function invalidLoginLink(c: Context<AppEnv>): Response {
  return errors.clientErrorResponse(c, new Error('This login link is invalid, expired, or has already been used. Request a new link to log in.'))
}

async function emailLoginLink(c: Context<AppEnv>, user: users.User): Promise<Response> {
  const lifetimeSeconds = c.env.LOGIN_TOKEN_LIFETIME_SECONDS
  const [created, tokenErr] = await tokens.create(c.env.MY_DB, user.id, lifetimeSeconds, tokens.authenticationScope)
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

app.get('/login', ...authMiddleware, async c => {
  const [page, err] = templates.loginPage({}, await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

app.get('/signup', ...authMiddleware, async c => {
  const [page, err] = templates.signupPage({ values: { email: c.req.query('email') ?? '' } }, await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

app.get('/login/check-email', ...authMiddleware, async c => {
  const [page, err] = templates.checkEmailPage(await helpers.newTemplateData(c))
  if (err !== null) return errors.serverErrorResponse(c, err)
  return c.html(page)
})

app.post('/login/link', ...authMiddleware, zValidator('form', users.loginInputSchema, helpers.formValidationHook(templates.loginPage)), async c => {
  const input = c.req.valid('form')
  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: `email:${input.email}` })
  if (!success) return errors.rateLimitResponse(c)

  const [user, err] = await users.getByEmail(c.env.MY_DB, input.email)
  if (err === ErrRecordNotFound) return c.redirect(`/signup?email=${encodeURIComponent(input.email)}`, 303)
  if (err !== null) return errors.serverErrorResponse(c, err)
  return emailLoginLink(c, user)
})

app.post('/signup', ...authMiddleware, zValidator('form', users.signupInputSchema, helpers.formValidationHook(templates.signupPage)), async c => {
  const input = c.req.valid('form')
  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: `email:${input.email}` })
  if (!success) return errors.rateLimitResponse(c)

  const [user, err] = await users.insert(c.env.MY_DB, input)
  if (err !== null) return errors.serverErrorResponse(c, err)
  return emailLoginLink(c, user)
})

app.get('/login/confirm', ...authMiddleware, async c => {
  const input = tokens.tokenInputSchema.safeParse(c.req.query())
  if (!input.success) return invalidLoginLink(c)

  const [user, err] = await users.getForToken(c.env.MY_DB, tokens.authenticationScope, input.data.token)
  if (err === ErrRecordNotFound) return invalidLoginLink(c)
  if (err !== null) return errors.serverErrorResponse(c, err)

  const [page, renderErr] = templates.loginConfirmPage(input.data.token, user.email, await helpers.newTemplateData(c))
  if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
  return c.html(page)
})

app.post('/login', ...authMiddleware, async c => {
  const input = tokens.tokenInputSchema.safeParse(await c.req.parseBody())
  if (!input.success) return invalidLoginLink(c)

  const [, tokenErr] = await users.getForToken(c.env.MY_DB, tokens.authenticationScope, input.data.token)
  if (tokenErr === ErrRecordNotFound) return invalidLoginLink(c)
  if (tokenErr !== null) return errors.serverErrorResponse(c, tokenErr)

  // Clear an existing session before creating the authenticated session, so the
  // package generates a fresh ID. Leave the token usable for the redirected POST.
  if (getCookie(c, 'sid') && await c.var.session.get() !== null) {
    c.var.session.delete()
    return c.redirect(`/login/confirm?token=${input.data.token}`, 303)
  }

  const [userId, consumeErr] = await tokens.consume(c.env.MY_DB, tokens.authenticationScope, input.data.token)
  if (consumeErr === ErrRecordNotFound) return invalidLoginLink(c)
  if (consumeErr !== null) return errors.serverErrorResponse(c, consumeErr)

  await c.var.session.update({ userId })
  return c.redirect('/', 303)
})

app.post('/logout', ...authMiddleware, async c => {
  await c.var.session.get()
  c.var.session.delete()
  return c.redirect('/', 303)
})

export default app
