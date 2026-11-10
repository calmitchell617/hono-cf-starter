import type { HonoRequest } from 'hono/request'
import type { Context } from 'hono'
import { z } from 'zod'
import { serverErrorResponse } from './errors'
import type { TemplateData } from '../templates/base'
import type { AppEnv } from '../env'
import { getCookie } from 'hono/cookie'
import type { SessionValues } from '../middleware'

export async function newTemplateData<E extends AppEnv>(c: Context<E>): Promise<TemplateData> {
  const session = getCookie(c, 'sid') ? await c.var.session.get() : null
  const flash = session?.flash
  if (flash !== undefined) {
    await c.var.session.update((previous: SessionValues | null) => {
      const { flash, ...data } = previous ?? {}
      return data
    })
  }
  return {
    isAuthenticated: !c.var.user.isAnonymous(),
    userId: c.var.user.isAnonymous() ? null : c.var.user.id,
    flash,
  }
}

type FormTemplate = (props: {
  values: Record<string, string>
  errors: Partial<Record<string, string[]>>
  formErrors: string[]
}, data: TemplateData) => [string, null] | [null, Error]

export function formValidationHook(renderForm: FormTemplate) {
  return async (
    result: { success: true } | {
      success: false
      error: z.core.$ZodError
      data: Record<string, unknown>
    },
    c: Context,
  ): Promise<Response | void> => {
    if (!result.success) {
      const { fieldErrors, formErrors } = z.flattenError(result.error)
      const [page, renderErr] = renderForm({
        values: stringFormValues(result.data),
        errors: fieldErrors,
        formErrors,
      }, await newTemplateData(c))
      if (renderErr !== null) {
        return serverErrorResponse(c, renderErr)
      }

      return c.html(page, 400)
    }
  }
}

export function stringFormValues(input: Record<string, unknown>): Record<string, string> {
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
