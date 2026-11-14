import type { EmailTemplate } from '../../mailer'
import { render } from '../render'

export const loginLinkEmail: EmailTemplate<{ url: string; lifetimeSeconds: number }> = ({ url, lifetimeSeconds }) => {
  const useMinutes = lifetimeSeconds % 60 === 0
  const duration = useMinutes ? lifetimeSeconds / 60 : lifetimeSeconds
  const unit = useMinutes ? 'minute' : 'second'
  const expiresIn = `${duration} ${unit}${duration === 1 ? '' : 's'}`
  const [html, renderErr] = render(() => <LoginLinkEmail url={url} expiresIn={expiresIn} />)
  if (renderErr !== null) return [null, renderErr]

  return [{
    subject: 'Your Hono Cloudflare Starter login link',
    text: `Log in to Hono Cloudflare Starter:\n\n${url}\n\nThis link expires in ${expiresIn} and can only be used once.\nIf you did not request this email, you can ignore it.`,
    html,
  }, null]
}

export function LoginLinkEmail({ url, expiresIn }: { url: string; expiresIn: string }) {
  return (
    <html lang="en">
      <body>
        <h1>Log in to Hono Cloudflare Starter</h1>
        <p><a href={url}>Log in to your account</a></p>
        <p>This link expires in {expiresIn} and can only be used once.</p>
        <p>If you did not request this email, you can ignore it.</p>
      </body>
    </html>
  )
}
