import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

type ErrorPageProps = TemplateData & {
  status: number
  title: string
  message: string
}

export function ErrorPage({ status, title, message, ...templateData }: ErrorPageProps) {
  return (
    <BaseTemplate title={title} {...templateData} showNav={status !== 404}>
      <h1>{status} - {title}</h1>
      <p>{message}</p>
      {status === 404 &&
        <form action="/" method="get">
          <button type="submit">Home</button>
        </form>
      }
    </BaseTemplate>
  )
}
