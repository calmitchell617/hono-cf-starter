import type { User } from '../../handlers/models/users'

export function Nav({ currentUser }: { currentUser: User }) {
  return (
    <nav aria-label="Main">
      Hono Cloudflare Starter
      {' '}<a href="/">Home</a>
      {!currentUser.isAnonymous() && <>{' '}<a href="/posts/create">Create post</a></>}
      {' '}
      {!currentUser.isAnonymous() ? (
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
