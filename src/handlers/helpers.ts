import { toError, getValidationErrors, keepStringValues } from '../lib'
import type { HonoRequest } from 'hono/request'
import type { Context } from 'hono'
import type { z } from 'zod'
import type { TemplateData } from '../templates/base'
import type { AppEnv } from '../env'
import { popSessionString } from '../middleware'

export async function newTemplateData<E extends AppEnv>(c: Context<E>): Promise<TemplateData> {
  return {
    currentUser: c.var.user,
    flash: await popSessionString(c, 'flash'),
  }
}

type ValidationFormData<Name extends string> = {
  [Key in keyof ReturnType<typeof getValidationErrors> as `${Name}${Capitalize<Key>}`]: ReturnType<typeof getValidationErrors>[Key]
}

export type ValidationErrors = {
  fieldErrors?: Record<string, string[] | undefined>
  formErrors?: string[]
}

export async function renderWithValidationErrors<E extends AppEnv, Name extends string>(
  c: Context<E>,
  form: Record<string, unknown>,
  result: { success: false; error: z.core.$ZodError } | ValidationErrors,
  formName: Name,
  renderPage: (data: TemplateData, formData: ValidationFormData<Name>) => [string, null] | [null, Error],
): Promise<[string, null] | [null, Error]> {
  try {
    const { values, fieldErrors = {}, formErrors = [] } = 'error' in result
      ? getValidationErrors(form, result.error)
      : { values: keepStringValues(form), ...result }
    const formData = {
      [`${formName}Values`]: values,
      [`${formName}FieldErrors`]: fieldErrors,
      [`${formName}FormErrors`]: formErrors,
    } as ValidationFormData<Name>
    return renderPage(await newTemplateData(c), formData)
  } catch (e) {
    return [null, toError(e)]
  }
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
