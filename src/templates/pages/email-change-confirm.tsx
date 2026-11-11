import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { ConfirmEmailChangeInput } from '../../handlers/settings'

export type EmailChangeConfirmPageProps = TemplateData & {
  values?: Partial<ConfirmEmailChangeInput>
  errors?: Partial<Record<keyof ConfirmEmailChangeInput, string[]>>
  formErrors?: string[]
}

export function EmailChangeConfirmPage({ currentUser, values = {}, errors = {}, formErrors = [], ...templateData }: EmailChangeConfirmPageProps) {
  return (
    <BaseTemplate title="Change email address" {...templateData} currentUser={currentUser}>
      <h1>Change email address</h1>
      <p>Fill out the form below to change your email address from {currentUser?.email} to {values.email}.</p>
      <form action="/settings/email/confirm" method="post">
        {formErrors.map(message => <p role="alert">{message}</p>)}
        <input name="email" type="hidden" value={values.email ?? ''} />
        {errors.email && <div id="new-email-errors" role="alert">{errors.email.map(message => <p>{message}</p>)}<a href="/settings">Return to settings to change the email address.</a></div>}
        <div>
          <label htmlFor="email-token">Code sent to {currentUser?.email}</label>
          <input id="email-token" name="token" autoComplete="one-time-code" required
            value={values.token ?? ''} aria-invalid={errors.token ? 'true' : undefined}
            aria-describedby={errors.token ? 'email-token-errors' : undefined} />
          {errors.token && <div id="email-token-errors" role="alert">{errors.token.map(message => <p>{message}</p>)}</div>}
        </div>
        <div>
          <label htmlFor="new-email-token">Code sent to {values.email}</label>
          <input id="new-email-token" name="newToken" autoComplete="one-time-code" required
            value={values.newToken ?? ''} aria-invalid={errors.newToken ? 'true' : undefined}
            aria-describedby={errors.newToken ? 'new-email-token-errors' : undefined} />
          {errors.newToken && <div id="new-email-token-errors" role="alert">{errors.newToken.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Change email address</button>
      </form>
    </BaseTemplate>
  )
}
