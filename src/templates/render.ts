import type { JSX } from 'hono/jsx/jsx-runtime'

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
    if (!(error instanceof Error)) {
      const message = String(error)
      const wrappedError = new Error(message)
      return [null, wrappedError]
    }

    return [null, error]
  }
}
