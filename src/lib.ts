import { z } from 'zod'

export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }

  return new Error(String(value))
}

export function keepStringValues(input: Record<string, unknown>): Record<string, string> {
  // Parsed forms can contain files or arrays; templates need strings to redisplay submitted values.
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

export function getValidationErrors(input: Record<string, unknown>, error: z.core.$ZodError) {
  const { fieldErrors, formErrors } = z.flattenError(error)
  return { values: keepStringValues(input), fieldErrors, formErrors }
}
