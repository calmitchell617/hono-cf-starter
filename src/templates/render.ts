import type { JSX } from 'hono/jsx/jsx-runtime'
import { toError } from '../lib'

export function render(
  createPage: () => JSX.Element,
): [string, null] | [null, Error] {
  try {
    const page = createPage()

    if (page instanceof Promise) {
      return [null, new Error('Page must render synchronously')]
    }

    const markup = page.toString()

    if (typeof markup !== 'string') {
      return [null, new Error('Page must render synchronously')]
    }

    return [`<!doctype html>${markup}`, null]
  } catch (error) {
    return [null, toError(error)]
  }
}
