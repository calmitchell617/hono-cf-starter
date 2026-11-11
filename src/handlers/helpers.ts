import type { HonoRequest } from 'hono/request'
import type { Context } from 'hono'
import { z } from 'zod'
import type { TemplateData } from '../templates/base'
import type { AppEnv } from '../env'
import { popSessionString } from '../middleware'

export async function newTemplateData<E extends AppEnv>(c: Context<E>): Promise<TemplateData> {
  return {
    currentUser: c.var.user,
    flash: await popSessionString(c, 'flash'),
  }
}

export function getValidationErrors(input: Record<string, unknown>, error: z.core.$ZodError) {
  const { fieldErrors, formErrors } = z.flattenError(error)
  return { values: keepStringValues(input), fieldErrors, formErrors }
}

export function keepStringValues(input: Record<string, unknown>): Record<string, string> {
  // Parsed forms can contain files or arrays; templates need strings to redisplay submitted values.
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

export function readIDParam(
  req: HonoRequest,
): [number, null] | [null, Error] {
  const id = Number(req.param('id'))

  if (!Number.isSafeInteger(id) || id < 1) {
    return [null, new Error('invalid id parameter')]
  }

  return [id, null]
}
