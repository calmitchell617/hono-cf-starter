export function EmailChangeEmail({ url, token, expiresIn }: { url: string; token: string; expiresIn: string }) {
  return (
    <html lang="en">
      <body>
        <h1>Change your email address</h1>
        <p>Your code: <code>{token}</code></p>
        <p><a href={url}>Confirm your email change</a></p>
        <p>Enter this code and the code sent to your other email address on the confirmation form. Both are required to change your email address. This code expires in {expiresIn} and can only be used once.</p>
        <p>If you did not request this change, you can ignore this email.</p>
      </body>
    </html>
  )
}
