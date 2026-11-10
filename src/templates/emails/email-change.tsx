export function EmailChangeEmail({ url, token, expiresIn }: { url: string; token: string; expiresIn: string }) {
  return (
    <html lang="en">
      <body>
        <h1>Change your email address</h1>
        <p>Your token: <code>{token}</code></p>
        <p><a href={url}>Enter your new email address</a></p>
        <p>Use this token on the form to change your email address. It expires in {expiresIn} and can only be used once.</p>
        <p>If you did not request this change, you can ignore this email.</p>
      </body>
    </html>
  )
}
