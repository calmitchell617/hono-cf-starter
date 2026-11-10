import { Hono } from 'hono'
import * as templates from '../templates'
import * as snippetQueries from './models/snippets'
import * as errors from './errors'
import type { AppEnv } from '../env'
import { newTemplateData } from './helpers'
import { auth } from '../middleware'

const app = new Hono<AppEnv>()

app.get('/', ...auth(), async (c) => {
  const [snippets, err] = await snippetQueries.getLatest(c.env.MY_DB)
  if (err !== null) {
    return errors.serverErrorResponse(c, err)
  }

  const [page, renderErr] = templates.homePage(snippets, await newTemplateData(c))
  if (renderErr !== null) {
    return errors.serverErrorResponse(c, renderErr)
  }

  return c.html(page)
})

export default app
