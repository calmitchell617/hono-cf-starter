import { loginLinkEmail } from '../templates'

export async function sendLoginLink(email: SendEmail, from: string, to: string, url: string, lifetimeSeconds: number): Promise<Error | null> {
  const useMinutes = lifetimeSeconds % 60 === 0
  const duration = useMinutes ? lifetimeSeconds / 60 : lifetimeSeconds
  const unit = useMinutes ? 'minute' : 'second'
  const expiresIn = `${duration} ${unit}${duration === 1 ? '' : 's'}`
  const [html, renderErr] = loginLinkEmail(url, expiresIn)
  if (renderErr !== null) return renderErr

  try {
    await email.send({
      from: { email: from, name: 'Hono Cloudflare Starter' },
      to,
      subject: 'Your Hono Cloudflare Starter login link',
      html,
      text: `Log in to Hono Cloudflare Starter:\n\n${url}\n\nThis link expires in ${expiresIn} and can only be used once.\nIf you did not request this email, you can ignore it.`,
    })
    return null
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e))
  }
}
