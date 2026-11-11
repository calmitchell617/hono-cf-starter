import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import type { SignupInput } from '../../handlers/auth'

export type SignupPageProps = TemplateData & {
  signupValues?: Partial<SignupInput>
  signupErrors?: Partial<Record<keyof SignupInput, string[]>>
  signupFormErrors?: string[]
}

export function SignupPage({ signupValues = {}, signupErrors = {}, signupFormErrors = [], ...templateData }: SignupPageProps) {
  return (
    <BaseTemplate title="Create account" {...templateData}>
      <h1>Create account</h1>
      <p>We will email you a link to finish signing in. No password is needed.</p>
      <form action="/signup" method="post">
        {signupFormErrors.map(message => <p role="alert">{message}</p>)}
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" autoComplete="name" required
            value={signupValues.name ?? ''} aria-invalid={signupErrors.name ? 'true' : undefined}
            aria-describedby={signupErrors.name ? 'name-errors' : undefined} />
          {signupErrors.name && <div id="name-errors" role="alert">{signupErrors.name.map(message => <p>{message}</p>)}</div>}
        </div>
        <div>
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required
            value={signupValues.email ?? ''} aria-invalid={signupErrors.email ? 'true' : undefined}
            aria-describedby={signupErrors.email ? 'email-errors' : undefined} />
          {signupErrors.email && <div id="email-errors" role="alert">{signupErrors.email.map(message => <p>{message}</p>)}</div>}
        </div>
        <button type="submit">Create account and email me a link</button>
      </form>
      <p><a href="/login">Already have an account? Log in</a></p>
    </BaseTemplate>
  )
}
