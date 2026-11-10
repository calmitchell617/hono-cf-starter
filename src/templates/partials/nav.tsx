export function Nav({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <nav aria-label="Main">
      Hono Cloudflare Starter
      {' '}<a href="/">Home</a>
      {isAuthenticated && <>{' '}<a href="/snippets/create">Create snippet</a></>}
      {' '}
      {isAuthenticated ? (
        <>
          <a href="/settings">Settings</a>
          {' '}
          <form action="/logout" method="post">
            <button type="submit">Log out</button>
          </form>
        </>
      ) : (
        <>
          <a href="/login">Log in</a>
          {' '}<a href="/signup">Sign up</a>
        </>
      )}
    </nav>
  )
}
