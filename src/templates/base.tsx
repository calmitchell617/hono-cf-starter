import type { Child } from 'hono/jsx'
import { Nav } from './partials/nav'

export type TemplateData = {
  isAuthenticated?: boolean
  userId?: number | null
  flash?: string
}

type BaseTemplateProps = TemplateData & {
  title: string
  children: Child
}

export function BaseTemplate({ title, children, isAuthenticated = false, flash }: BaseTemplateProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href="/nav.css" />
      </head>
      <body>
        <Nav isAuthenticated={isAuthenticated} />
        <main>
          {flash && <p role="status">{flash}</p>}
          {children}
        </main>
      </body>
    </html>
  )
}
