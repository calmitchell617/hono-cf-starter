import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { LoginInput } from '../../handlers/auth'

export type LoginPageProps = TemplateData & {
  loginValues?: Partial<LoginInput>
  loginFieldErrors?: Partial<Record<keyof LoginInput, string[]>>
  loginFormErrors?: string[]
}

export function LoginPage({ loginValues = {}, loginFieldErrors = {}, loginFormErrors = [], ...templateData }: LoginPageProps) {
  return (
    <BaseTemplate title="Log in" {...templateData}>
      <h1>Log in</h1>
      <p>Enter your email address and we will send you a login link.</p>
      <form action="/login" method="post">
        {loginFormErrors.map(message => <p role="alert">{message}</p>)}
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          value={loginValues.email ?? ''} aria-invalid={loginFieldErrors.email ? 'true' : undefined}
          aria-describedby={loginFieldErrors.email ? 'email-errors' : undefined} />
        {loginFieldErrors.email && <div id="email-errors" role="alert">{loginFieldErrors.email.map(message => <p>{message}</p>)}</div>}
        <button type="submit">Email me a login link</button>
      </form>
      <p><a href="/signup">Create an account</a></p>
    </BaseTemplate>
  )
}
