import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { SignupInput } from '../../handlers/auth'

export type SignupPageProps = TemplateData & {
  values?: Partial<SignupInput>
  errors?: Partial<Record<keyof SignupInput, string[]>>
  formErrors?: string[]
}

export function SignupPage({ values = {}, errors = {}, formErrors = [], ...templateData }: SignupPageProps) {
  return (
    <BaseTemplate title="Create account" {...templateData}>
      <h1>Create account</h1>
      <p>We will email you a link to finish signing in. No password is needed.</p>
      <form action="/signup" method="post">
        {formErrors.map(message => <p role="alert">{message}</p>)}
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" autoComplete="name" required
            value={values.name ?? ''} aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={errors.name ? 'name-errors' : undefined} />
          {errors.name && <div id="name-errors" role="alert">{errors.name.map(message => <p>{message}</p>)}</div>}
        </div>
        <div>
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required
            value={values.email ?? ''} aria-invalid={errors.email ? 'true' : undefined}
            aria-describedby={errors.email ? 'email-errors' : undefined} />
          {errors.email && <div id="email-errors" role="alert">{errors.email.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Create account and email me a link</button>
      </form>
      <p><a href="/login">Already have an account? Log in</a></p>
    </BaseTemplate>
  )
}
