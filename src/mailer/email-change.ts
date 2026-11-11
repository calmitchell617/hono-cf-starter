import { emailChangeEmail } from '../templates'

export async function sendEmailChange(email: SendEmail, from: string, to: string, url: string, token: string, lifetimeSeconds: number): Promise<Error | null> {
  const expiresIn = `${lifetimeSeconds} seconds`
  const [html, renderErr] = emailChangeEmail(url, token, expiresIn)
  if (renderErr !== null) return renderErr

  try {
    await email.send({
      from: { email: from, name: 'Hono Cloudflare Starter' },
      to,
      subject: 'Your email change code',
      html,
      text: `Change your email address:\n\n${url}\n\nYour code: ${token}\nEnter this code and the code sent to your other email address on the confirmation form. Both are required to change your email address.\n\nThis code expires in ${expiresIn} and can only be used once.\nIf you did not request this change, you can ignore this email.`,
    })
    return null
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e))
  }
}
