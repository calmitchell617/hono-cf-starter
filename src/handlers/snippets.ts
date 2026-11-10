import { Hono } from 'hono'
import { z } from 'zod'
import * as templates from '../templates'
import * as snippetsModel from './models/snippets'
import { ErrEditConflict, ErrRecordNotFound } from './models/errors'
import * as helpers from './helpers'
import * as errors from './errors'
import type { AppEnv } from '../env'
import { auth } from '../middleware'
import * as permissionsModel from './models/permissions'
import * as users from './models/users'

const app = new Hono<AppEnv>()

app.get('/create', ...auth({ requireAuthenticated: true, requirePermission: 'snippets:create' }), async (c) => {
  const [page, renderErr] = templates.createSnippetPage(await helpers.newTemplateData(c))
  if (renderErr !== null) {
    return errors.serverErrorResponse(c, renderErr)
  }

  return c.html(page)
})

app.get('/:id', ...auth({ requireAuthenticated: true, requirePermission: 'snippets:view', loadAllPermissions: true }), async (c) => {
  const [id, idErr] = helpers.readIDParam(c.req)
  if (idErr !== null) {
    return errors.clientErrorResponse(c, idErr)
  }

  const [snippet, err] = await snippetsModel.getByID(c.env.MY_DB, id)
  if (err !== null) {
    switch (err) {
      case ErrRecordNotFound:
        return errors.notFoundResponse(c)
      default:
        return errors.serverErrorResponse(c, err)
    }
  }

  const [user, userErr] = await users.getByIDWithRoles(c.env.MY_DB, c.var.user.id)
  if (userErr !== null) {
    switch (userErr) {
      case ErrRecordNotFound:
        c.var.session.delete()
        c.set('user', users.anonymousUser)
        return c.redirect('/login', 303)
      default:
        return errors.serverErrorResponse(c, userErr)
    }
  }
  const canEdit = permissionsModel.hasPermission(c.var.user.permissions, 'snippets:edit') && (
    snippet.user_id === user.id || user.roles.includes('admin')
  )
  const [page, renderErr] = templates.snippetPage(snippet, await helpers.newTemplateData(c), canEdit)
  if (renderErr !== null) {
    return errors.serverErrorResponse(c, renderErr)
  }

  return c.html(page)
})

const snippetInputSchema = z.object({
  title: z.string().max(100, 'Use 100 characters or fewer').refine(value => value.trim() !== '', 'must not be empty'),
  content: z.string().refine(value => value.trim() !== '', 'must not be empty'),
})

export type SnippetInput = z.infer<typeof snippetInputSchema>

app.post('/create', ...auth({ requireAuthenticated: true, requirePermission: 'snippets:create' }), async (c) => {
  const form = await c.req.parseBody({ all: true })
  const result = snippetInputSchema.safeParse(form)
  if (!result.success) {
    const [page, err] = templates.createSnippetPage(await helpers.newTemplateData(c), helpers.formValidationData(form, result.error))
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const input = result.data
  const [snippet, err] = await snippetsModel.insert(c.env.MY_DB, input, c.var.user.id)
  if (err !== null) {
    return errors.serverErrorResponse(c, err)
  }

  return c.redirect(`/snippets/${snippet.id}`, 303)
})

app.get('/:id/edit', ...auth({ requireAuthenticated: true, requirePermission: 'snippets:edit' }), async (c) => {
  const [id, idErr] = helpers.readIDParam(c.req)
  if (idErr !== null) return errors.clientErrorResponse(c, idErr)

  const [snippet, err] = await snippetsModel.getByID(c.env.MY_DB, id)
  if (err !== null) {
    switch (err) {
      case ErrRecordNotFound:
        return errors.notFoundResponse(c)
      default:
        return errors.serverErrorResponse(c, err)
    }
  }
  const [user, userErr] = await users.getByIDWithRoles(c.env.MY_DB, c.var.user.id)
  if (userErr !== null) {
    switch (userErr) {
      case ErrRecordNotFound:
        c.var.session.delete()
        c.set('user', users.anonymousUser)
        return c.redirect('/login', 303)
      default:
        return errors.serverErrorResponse(c, userErr)
    }
  }
  if (snippet.user_id !== user.id && !user.roles.includes('admin')) {
    return errors.notFoundResponse(c)
  }

  const [page, renderErr] = templates.editSnippetPage(snippet.id, await helpers.newTemplateData(c), { values: snippet })
  if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
  return c.html(page)
})

app.post('/:id/edit', ...auth({ requireAuthenticated: true, requirePermission: 'snippets:edit' }), async (c) => {
  const form = await c.req.parseBody({ all: true })
  const result = snippetInputSchema.safeParse(form)
  if (!result.success) {
    const [page, err] = templates.editSnippetPage(Number(c.req.param('id')), await helpers.newTemplateData(c), helpers.formValidationData(form, result.error))
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const [id, idErr] = helpers.readIDParam(c.req)
  if (idErr !== null) return errors.clientErrorResponse(c, idErr)

  const [snippet, err] = await snippetsModel.getByID(c.env.MY_DB, id)
  if (err !== null) {
    switch (err) {
      case ErrRecordNotFound:
        return errors.notFoundResponse(c)
      default:
        return errors.serverErrorResponse(c, err)
    }
  }
  const [user, userErr] = await users.getByIDWithRoles(c.env.MY_DB, c.var.user.id)
  if (userErr !== null) {
    switch (userErr) {
      case ErrRecordNotFound:
        c.var.session.delete()
        c.set('user', users.anonymousUser)
        return c.redirect('/login', 303)
      default:
        return errors.serverErrorResponse(c, userErr)
    }
  }
  if (snippet.user_id !== user.id && !user.roles.includes('admin')) {
    return errors.notFoundResponse(c)
  }
  const [updatedSnippet, updateErr] = await snippetsModel.update(c.env.MY_DB, snippet, result.data)
  if (updateErr !== null) {
    switch (updateErr) {
      case ErrEditConflict:
        return errors.editConflictResponse(c)
      default:
        return errors.serverErrorResponse(c, updateErr)
    }
  }
  return c.redirect(`/snippets/${updatedSnippet.id}`, 303)
})

export default app
