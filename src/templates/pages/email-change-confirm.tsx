import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { ConfirmEmailChangeInput } from '../../handlers/settings'

export type EmailChangeConfirmPageProps = TemplateData & {
  emailChangeConfirmValues?: Partial<ConfirmEmailChangeInput>
  emailChangeConfirmErrors?: Partial<Record<keyof ConfirmEmailChangeInput, string[]>>
  emailChangeConfirmFormErrors?: string[]
}

export function EmailChangeConfirmPage({ currentUser, emailChangeConfirmValues = {}, emailChangeConfirmErrors = {}, emailChangeConfirmFormErrors = [], ...templateData }: EmailChangeConfirmPageProps) {
  return (
    <BaseTemplate title="Change email address" {...templateData} currentUser={currentUser}>
      <h1>Change email address</h1>
      <p>Fill out the form below to change your email address from {currentUser?.email} to {emailChangeConfirmValues.email}.</p>
      <form action="/settings/email/confirm" method="post">
        {emailChangeConfirmFormErrors.map(message => <p role="alert">{message}</p>)}
        <input name="email" type="hidden" value={emailChangeConfirmValues.email ?? ''} />
        {emailChangeConfirmErrors.email && <div id="new-email-errors" role="alert">{emailChangeConfirmErrors.email.map(message => <p>{message}</p>)}<a href="/settings">Return to settings to change the email address.</a></div>}
        <div>
          <label htmlFor="email-token">Code sent to {currentUser?.email}</label>
          <input id="email-token" name="token" autoComplete="one-time-code" required
            value={emailChangeConfirmValues.token ?? ''} aria-invalid={emailChangeConfirmErrors.token ? 'true' : undefined}
            aria-describedby={emailChangeConfirmErrors.token ? 'email-token-errors' : undefined} />
          {emailChangeConfirmErrors.token && <div id="email-token-errors" role="alert">{emailChangeConfirmErrors.token.map(message => <p>{message}</p>)}</div>}
        </div>
        <div>
          <label htmlFor="new-email-token">Code sent to {emailChangeConfirmValues.email}</label>
          <input id="new-email-token" name="newToken" autoComplete="one-time-code" required
            value={emailChangeConfirmValues.newToken ?? ''} aria-invalid={emailChangeConfirmErrors.newToken ? 'true' : undefined}
            aria-describedby={emailChangeConfirmErrors.newToken ? 'new-email-token-errors' : undefined} />
          {emailChangeConfirmErrors.newToken && <div id="new-email-token-errors" role="alert">{emailChangeConfirmErrors.newToken.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Change email address</button>
      </form>
    </BaseTemplate>
  )
}
