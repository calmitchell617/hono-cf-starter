import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

export function CheckEmailPage(templateData: TemplateData) {
  return (
    <BaseTemplate title="Check your email" {...templateData}>
      <h1>Check your email</h1>
      <p>We have sent you a login link. It expires in 15 minutes and can only be used once.</p>
      <p><a href="/login">Request another link</a></p>
    </BaseTemplate>
  )
}
