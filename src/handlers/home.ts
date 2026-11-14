import { Hono } from 'hono'
import * as templates from '../templates'
import * as postQueries from './models/posts'
import * as errors from './errors'
import type { AppEnv } from '../env'
import { newTemplateData } from './helpers'
import { auth } from '../middleware'

const app = new Hono<AppEnv>()

app.get('/', ...auth(), async (c) => {
  const [posts, err] = await postQueries.getLatest(c.env.MY_DB)
  if (err !== null) {
    return errors.serverErrorResponse(c, err)
  }

  const [page, renderErr] = templates.homePage(posts, await newTemplateData(c))
  if (renderErr !== null) {
    return errors.serverErrorResponse(c, renderErr)
  }

  return c.html(page)
})

export default app
