import { Hono } from 'hono'
import { z } from 'zod'
import * as templates from '../templates'
import * as postsModel from './models/posts'
import { ErrEditConflict, ErrRecordNotFound } from './models/errors'
import * as helpers from './helpers'
import * as errors from './errors'
import type { AppEnv } from '../env'
import { auth } from '../middleware'
import * as permissionsModel from './models/permissions'
import * as users from './models/users'

const app = new Hono<AppEnv>()

app.get('/create', ...auth({ requireAuthenticated: true, requirePermission: 'posts:create' }), async (c) => {
  const [page, renderErr] = templates.createPostPage(await helpers.newTemplateData(c))
  if (renderErr !== null) {
    return errors.serverErrorResponse(c, renderErr)
  }

  return c.html(page)
})

app.get('/:id', ...auth({ requireAuthenticated: true, requirePermission: 'posts:view', loadAllPermissions: true }), async (c) => {
  const [id, idErr] = helpers.readIDParam(c.req)
  if (idErr !== null) {
    return errors.clientErrorResponse(c, idErr)
  }

  const [post, err] = await postsModel.getByID(c.env.MY_DB, id)
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
  const canEdit = permissionsModel.hasPermission(c.var.user.permissions, 'posts:edit') && (
    post.user_id === user.id || user.roles.includes('admin')
  )
  const [page, renderErr] = templates.postPage(post, await helpers.newTemplateData(c), canEdit)
  if (renderErr !== null) {
    return errors.serverErrorResponse(c, renderErr)
  }

  return c.html(page)
})

const postInputSchema = z.object({
  title: z.string().max(100, 'Use 100 characters or fewer').refine(value => value.trim() !== '', 'must not be empty'),
  content: z.string().refine(value => value.trim() !== '', 'must not be empty'),
})

export type PostInput = z.infer<typeof postInputSchema>

app.post('/create', ...auth({ requireAuthenticated: true, requirePermission: 'posts:create' }), async (c) => {
  const form = await c.req.parseBody({ all: true })
  const result = postInputSchema.safeParse(form)
  if (!result.success) {
    const [page, err] = await helpers.renderWithValidationErrors(c, form, result, 'post', templates.createPostPage)
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const input = result.data
  const [post, err] = await postsModel.insert(c.env.MY_DB, input, c.var.user.id)
  if (err !== null) {
    return errors.serverErrorResponse(c, err)
  }

  return c.redirect(`/posts/${post.id}`, 303)
})

app.get('/:id/edit', ...auth({ requireAuthenticated: true, requirePermission: 'posts:edit' }), async (c) => {
  const [id, idErr] = helpers.readIDParam(c.req)
  if (idErr !== null) return errors.clientErrorResponse(c, idErr)

  const [post, err] = await postsModel.getByID(c.env.MY_DB, id)
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
  if (post.user_id !== user.id && !user.roles.includes('admin')) {
    return errors.notFoundResponse(c)
  }

  const [page, renderErr] = templates.editPostPage(post.id, await helpers.newTemplateData(c), { postValues: post })
  if (renderErr !== null) return errors.serverErrorResponse(c, renderErr)
  return c.html(page)
})

app.post('/:id/edit', ...auth({ requireAuthenticated: true, requirePermission: 'posts:edit' }), async (c) => {
  const form = await c.req.parseBody({ all: true })
  const result = postInputSchema.safeParse(form)
  if (!result.success) {
    const [page, err] = await helpers.renderWithValidationErrors(c, form, result, 'post', templates.editPostPage.bind(null, Number(c.req.param('id'))))
    if (err !== null) return errors.serverErrorResponse(c, err)
    return c.html(page, 400)
  }
  const [id, idErr] = helpers.readIDParam(c.req)
  if (idErr !== null) return errors.clientErrorResponse(c, idErr)

  const [post, err] = await postsModel.getByID(c.env.MY_DB, id)
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
  if (post.user_id !== user.id && !user.roles.includes('admin')) {
    return errors.notFoundResponse(c)
  }
  const [updatedPost, updateErr] = await postsModel.update(c.env.MY_DB, post, result.data)
  if (updateErr !== null) {
    switch (updateErr) {
      case ErrEditConflict:
        return errors.editConflictResponse(c)
      default:
        return errors.serverErrorResponse(c, updateErr)
    }
  }
  return c.redirect(`/posts/${updatedPost.id}`, 303)
})

export default app
