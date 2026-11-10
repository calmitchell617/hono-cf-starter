import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

type ErrorPageProps = TemplateData & {
  status: number
  title: string
  message: string
}

export function ErrorPage({ status, title, message, ...templateData }: ErrorPageProps) {
  return (
    <BaseTemplate title={title} {...templateData}>
      <h1>{status} - {title}</h1>
      <p>{message}</p>
    </BaseTemplate>
  )
}
