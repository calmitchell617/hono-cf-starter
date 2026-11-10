import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { SettingsInput, AdminInput } from '../../handlers/settings'
import { anonymousUser } from '../../handlers/models/users'
import { hasPermission } from '../../handlers/models/permissions'

export type SettingsPageProps = TemplateData & {
  values?: Partial<SettingsInput>
  errors?: Partial<Record<keyof SettingsInput, string[]>>
  formErrors?: string[]
  adminValues?: Partial<AdminInput>
  adminErrors?: Partial<Record<keyof AdminInput, string[]>>
  adminFormErrors?: string[]
}

export function SettingsPage({ currentUser = anonymousUser, values = currentUser, errors = {}, formErrors = [],
  adminValues = {}, adminErrors = {}, adminFormErrors = [], ...templateData }: SettingsPageProps) {
  return (
    <BaseTemplate title="Settings" {...templateData} currentUser={currentUser}>
      <h1>Settings</h1>
      <form action="/settings" method="post">
        {formErrors.map(message => <p role="alert">{message}</p>)}
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" autoComplete="name" required
            value={values.name ?? ''} aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={errors.name ? 'name-errors' : undefined} />
          {errors.name && <div id="name-errors" role="alert">{errors.name.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Save changes</button>
      </form>
      <section aria-labelledby="email-heading">
        <h2 id="email-heading">Email address</h2>
        <p>Current email address: {currentUser.email}</p>
        <p>We’ll email a token to your current address so you can change your email.</p>
        <form action="/settings/email" method="post">
          <button type="submit">Change email address</button>
        </form>
      </section>
      {hasPermission(currentUser.permissions, 'users:promote') && <section aria-labelledby="admins-heading">
        <h2 id="admins-heading">Administrators</h2>
        <p>Admins can edit any snippet and promote other users to admin.</p>
        <form action="/settings/admins" method="post">
          {adminFormErrors.map(message => <p role="alert">{message}</p>)}
          <label htmlFor="admin-email">Existing user's email address</label>
          <input id="admin-email" name="email" type="email" required
            value={adminValues.email ?? ''} aria-invalid={adminErrors.email ? 'true' : undefined}
            aria-describedby={adminErrors.email ? 'admin-email-errors' : undefined} />
          {adminErrors.email && <div id="admin-email-errors" role="alert">{adminErrors.email.map(message => <p>{message}</p>)}</div>}
          <button type="submit">Promote to admin</button>
        </form>
      </section>}
    </BaseTemplate>
  )
}
