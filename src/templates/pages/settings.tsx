import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { SettingsInput, LoginInput } from '../../handlers/models/users'

export type SettingsPageProps = TemplateData & {
  values?: Partial<SettingsInput>
  errors?: Partial<Record<keyof SettingsInput, string[]>>
  formErrors?: string[]
  canPromoteUsers?: boolean
  adminValues?: Partial<LoginInput>
  adminErrors?: Partial<Record<keyof LoginInput, string[]>>
  adminFormErrors?: string[]
}

export function SettingsPage({ values = {}, errors = {}, formErrors = [], canPromoteUsers = false,
  adminValues = {}, adminErrors = {}, adminFormErrors = [], ...templateData }: SettingsPageProps) {
  return (
    <BaseTemplate title="Settings" {...templateData}>
      <h1>Settings</h1>
      <form action="/settings" method="post">
        {formErrors.map(message => <p role="alert">{message}</p>)}
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" autoComplete="name" required maxLength={100}
            value={values.name ?? ''} aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={errors.name ? 'name-errors' : undefined} />
          {errors.name && <div id="name-errors" role="alert">{errors.name.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Save changes</button>
      </form>
      {canPromoteUsers && <section aria-labelledby="admins-heading">
        <h2 id="admins-heading">Administrators</h2>
        <p>Admins can edit any snippet and promote other users to admin.</p>
        <form action="/settings/admins" method="post">
          {adminFormErrors.map(message => <p role="alert">{message}</p>)}
          <label htmlFor="admin-email">Existing user's email address</label>
          <input id="admin-email" name="email" type="email" required maxLength={254}
            value={adminValues.email ?? ''} aria-invalid={adminErrors.email ? 'true' : undefined}
            aria-describedby={adminErrors.email ? 'admin-email-errors' : undefined} />
          {adminErrors.email && <div id="admin-email-errors" role="alert">{adminErrors.email.map(message => <p>{message}</p>)}</div>}
          <button type="submit">Promote to admin</button>
        </form>
      </section>}
    </BaseTemplate>
  )
}
