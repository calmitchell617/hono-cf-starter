import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { LoginInput } from '../../handlers/models/users'

export type LoginPageProps = TemplateData & {
  values?: Partial<LoginInput>
  errors?: Partial<Record<keyof LoginInput, string[]>>
  formErrors?: string[]
}

export function LoginPage({ values = {}, errors = {}, formErrors = [], ...templateData }: LoginPageProps) {
  return (
    <BaseTemplate title="Log in" {...templateData}>
      <h1>Log in</h1>
      <p>Enter your email address and we will send you a login link.</p>
      <form action="/login/link" method="post">
        {formErrors.map(message => <p role="alert">{message}</p>)}
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          value={values.email ?? ''} aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'email-errors' : undefined} />
        {errors.email && <div id="email-errors" role="alert">{errors.email.map(message => <p>{message}</p>)}</div>}
        <button type="submit">Email me a login link</button>
      </form>
      <p><a href="/signup">Create an account</a></p>
    </BaseTemplate>
  )
}
