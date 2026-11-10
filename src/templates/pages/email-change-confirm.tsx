import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { EmailChangeInput } from '../../handlers/settings'

export type EmailChangeConfirmPageProps = TemplateData & {
  values?: Partial<EmailChangeInput>
  errors?: Partial<Record<keyof EmailChangeInput, string[]>>
  formErrors?: string[]
}

export function EmailChangeConfirmPage({ values = {}, errors = {}, formErrors = [], ...templateData }: EmailChangeConfirmPageProps) {
  return (
    <BaseTemplate title="Change email address" {...templateData}>
      <h1>Change email address</h1>
      <p>Enter your new email address and the token we sent to your current email address.</p>
      <form action="/settings/email/confirm" method="post">
        {formErrors.map(message => <p role="alert">{message}</p>)}
        <div>
          <label htmlFor="new-email">New email address</label>
          <input id="new-email" name="email" type="email" autoComplete="email" required
            value={values.email ?? ''} aria-invalid={errors.email ? 'true' : undefined}
            aria-describedby={errors.email ? 'new-email-errors' : undefined} />
          {errors.email && <div id="new-email-errors" role="alert">{errors.email.map(message => <p>{message}</p>)}</div>}
        </div>
        <div>
          <label htmlFor="email-token">Token from your email</label>
          <input id="email-token" name="token" autoComplete="one-time-code" required
            value={values.token ?? ''} aria-invalid={errors.token ? 'true' : undefined}
            aria-describedby={errors.token ? 'email-token-errors' : undefined} />
          {errors.token && <div id="email-token-errors" role="alert">{errors.token.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Change email address</button>
      </form>
    </BaseTemplate>
  )
}
