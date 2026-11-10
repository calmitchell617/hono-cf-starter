import type { Child } from 'hono/jsx'
import { Nav } from './partials/nav'
import type { User } from '../handlers/models/users'
import { anonymousUser } from '../handlers/models/users'

export type TemplateData = {
  flash?: string
  currentUser?: User
}

type BaseTemplateProps = TemplateData & {
  title: string
  children: Child
  showNav?: boolean
}

export function BaseTemplate({ title, children, currentUser = anonymousUser, flash, showNav = true }: BaseTemplateProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href="/nav.css" />
      </head>
      <body>
        {showNav && <Nav currentUser={currentUser} />}
        <main>
          {flash && <p role="status">{flash}</p>}
          {children}
        </main>
      </body>
    </html>
  )
}
