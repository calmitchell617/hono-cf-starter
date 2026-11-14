import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { ChangeNameInput, ChangeAdminsInput, ChangeEmailInput } from '../../handlers/settings'
import { anonymousUser } from '../../handlers/models/users'
import { hasPermission } from '../../handlers/models/permissions'

export type SettingsPageProps = TemplateData & {
  nameValues?: Partial<ChangeNameInput>
  nameFieldErrors?: Partial<Record<keyof ChangeNameInput, string[]>>
  nameFormErrors?: string[]
  emailValues?: Partial<ChangeEmailInput>
  emailFieldErrors?: Partial<Record<keyof ChangeEmailInput, string[]>>
  emailFormErrors?: string[]
  adminValues?: Partial<ChangeAdminsInput>
  adminFieldErrors?: Partial<Record<keyof ChangeAdminsInput, string[]>>
  adminFormErrors?: string[]
}

export function SettingsPage({ currentUser = anonymousUser, nameValues = currentUser, nameFieldErrors = {}, nameFormErrors = [],
  emailValues = {}, emailFieldErrors = {}, emailFormErrors = [],
  adminValues = {}, adminFieldErrors = {}, adminFormErrors = [], ...templateData }: SettingsPageProps) {
  return (
    <BaseTemplate title="Settings" {...templateData} currentUser={currentUser}>
      <h1>Settings</h1>
      <h2>Change name</h2>
      <form action="/settings/change-name" method="post">
        {nameFormErrors.map(message => <p role="alert">{message}</p>)}
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" autoComplete="name" required
            value={nameValues.name ?? ''} aria-invalid={nameFieldErrors.name ? 'true' : undefined}
            aria-describedby={nameFieldErrors.name ? 'name-errors' : undefined} />
          {nameFieldErrors.name && <div id="name-errors" role="alert">{nameFieldErrors.name.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Change name</button>
      </form>
      <section aria-labelledby="email-heading">
        <h2 id="email-heading">Change email address</h2>
        <p>Current email address: {currentUser.email}</p>
        <p>We’ll send a code to your current address and your new address. You’ll need both to confirm the change.</p>
        <form action="/settings/change-email" method="post">
          {emailFormErrors.map(message => <p role="alert">{message}</p>)}
          <label htmlFor="new-email">New email address</label>
          <input id="new-email" name="email" type="email" autoComplete="email" required
            value={emailValues.email ?? ''} aria-invalid={emailFieldErrors.email ? 'true' : undefined}
            aria-describedby={emailFieldErrors.email ? 'new-email-errors' : undefined} />
          {emailFieldErrors.email && <div id="new-email-errors" role="alert">{emailFieldErrors.email.map(message => <p>{message}</p>)}</div>}
          <button type="submit">Change email address</button>
        </form>
      </section>
      {hasPermission(currentUser.permissions, 'users:promote') && <section aria-labelledby="admins-heading">
        <h2 id="admins-heading">Administrators</h2>
        <p>Admins can edit any post and promote other users to admin.</p>
        <form action="/settings/change-admins" method="post">
          {adminFormErrors.map(message => <p role="alert">{message}</p>)}
          <label htmlFor="admin-email">Existing user's email address</label>
          <input id="admin-email" name="email" type="email" required
            value={adminValues.email ?? ''} aria-invalid={adminFieldErrors.email ? 'true' : undefined}
            aria-describedby={adminFieldErrors.email ? 'admin-email-errors' : undefined} />
          {adminFieldErrors.email && <div id="admin-email-errors" role="alert">{adminFieldErrors.email.map(message => <p>{message}</p>)}</div>}
          <button type="submit">Promote to admin</button>
        </form>
      </section>}
    </BaseTemplate>
  )
}
