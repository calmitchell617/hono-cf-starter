import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

export function LoginConfirmPage({ loginConfirmValues, email, ...templateData }: TemplateData & { loginConfirmValues: { token: string }; email: string }) {
  return (
    <BaseTemplate title="Logging in" {...templateData}>
      <h1>Logging in</h1>
      <p>Signing in as {email}.</p>
      <form id="login-confirm" action="/login/confirm" method="post">
        <input type="hidden" name="token" value={loginConfirmValues.token} />
        <button type="submit">Log in</button>
      </form>
      <noscript><p>JavaScript is disabled. Click Log in to continue.</p></noscript>
      <script src="/login-confirm.js" defer></script>
    </BaseTemplate>
  )
}
