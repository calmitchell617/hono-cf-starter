import { toError } from './lib'

export type EmailContent = {
  subject: string
  text: string
  html: string
}

export type EmailTemplate<Data> = (data: Data) => [EmailContent, null] | [null, Error]

export function createMailer(email: SendEmail, from: string) {
  return {
    async send<Data>(to: string, template: EmailTemplate<Data>, data: Data): Promise<Error | null> {
      const [content, renderErr] = template(data)
      if (renderErr !== null) return renderErr

      try {
        await email.send({
          from: { email: from, name: 'Hono Cloudflare Starter' },
          to,
          ...content,
        })
        return null
      } catch (e) {
        return toError(e)
      }
    },
  }
}
