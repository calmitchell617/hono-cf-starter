import type { Context } from 'hono'
import * as templates from '../templates'
import { ContentfulStatusCode } from 'hono/utils/http-status'
import { anonymousUser } from './models/users'

function errorResponse(c: Context, status: ContentfulStatusCode, title: string, message: string): Response {
  const [page, renderErr] = templates.errorPage(status, title, message, { currentUser: c.get('user') ?? anonymousUser })
  if (renderErr !== null) {
    console.error(renderErr)
    return c.text('Internal Server Error', 500)
  }

  return c.html(page, status)
}

export function notFoundResponse(c: Context): Response {
  return errorResponse(c, 404, 'Not Found', 'The requested resource could not be found.')
}

export function clientErrorResponse(c: Context, error: Error): Response {
  return errorResponse(c, 400, 'Bad Request', error.message)
}

export function invalidLoginLinkErrorResponse(c: Context): Response {
  return errorResponse(c, 400, 'Bad Request', 'This login link is invalid, expired, or has already been used. Request a new link to log in.')
}

export function serverErrorResponse(c: Context, error: Error): Response {
  console.error(error)
  return errorResponse(c, 500, 'Internal Server Error', 'Something went wrong. Please try again later.')
}

export function forbiddenResponse(c: Context): Response {
  return errorResponse(c, 403, 'Forbidden', 'This request could not be verified. Please try again from this site.')
}

export function notPermittedResponse(c: Context): Response {
  return errorResponse(c, 403, 'Forbidden', 'You do not have permission to perform this action.')
}

export function editConflictResponse(c: Context): Response {
  return errorResponse(c, 409, 'Edit Conflict', 'This record changed while your request was being processed. Please try again.')
}

export function rateLimitResponse(c: Context, retryAfter = 60): Response {
  c.header('Retry-After', String(retryAfter))
  return errorResponse(c, 429, 'Too Many Requests', 'Too many requests. Please try again shortly.')
}
