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
