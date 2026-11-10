import { emailChangeEmail } from '../templates'

export async function sendEmailChange(email: SendEmail, from: string, to: string, url: string, token: string, lifetimeSeconds: number): Promise<Error | null> {
  const expiresIn = `${lifetimeSeconds} seconds`
  const [html, renderErr] = emailChangeEmail(url, token, expiresIn)
  if (renderErr !== null) return renderErr

  try {
    await email.send({
      from: { email: from, name: 'Hono Cloudflare Starter' },
      to,
      subject: 'Your email change token',
      html,
      text: `Change your email address:\n\n${url}\n\nYour token: ${token}\nEnter your new email address and this token on the form.\n\nThis token expires in ${expiresIn} and can only be used once.\nIf you did not request this change, you can ignore this email.`,
    })
    return null
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e))
  }
}
