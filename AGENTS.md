# AGENTS.MD

Hello dear agent. Thank you for helping me with my work.

## Keep things lean

Do not create or update documentation files, including READMEs, guides, plans, reports, or Markdown explanations. Explain changes and setup requirements in the conversation instead.

## Git workflow

My workflow is:
- Ask for changes
- Review the changes using git highlighting in VS Code
- Ask for more changes

When you start making changes, you should evaluate if it seems like an appropriate time to add, commit (with a reasonable description), and push the current accumulated changes. This makes it so I can review, but we have a trailing log of commits. Include all changes, even those you didn't make.

Do this when it seems like a change would be worth a git commit, and we're not still iterating on the same idea. Just use your judgement.

## Deploying

Use make deploy/local during dev. Use make deploy to deploy to prod.

## Email links

When emailing someone a link to do something (signup, change email, etc), the link should load a page which has a form that auto-submits to do the actual change. This is to avoid email clients loading the page and making unwanted changes.

## Form data

Always prefix template form data with the form's name (e.g. `loginValues`, `loginFieldErrors`, `loginFormErrors`), even on pages with only one form.

## Shared utilities and handler helpers

Put shared utilities in `src/lib.ts`; they may import external libraries but must not depend on other app modules. Keep helpers that use request context, sessions, templates, or other app modules in `src/handlers/helpers.ts`, which may import from `src/lib.ts`.

## Updating records

For update functionality, the request handler should load the required data, validate and authorize the change, construct the complete updated model object, and pass that object to the model's update function. The update function should accept the object rather than separate fields, a partial changes object, or request-specific values such as verification tokens. Apply this pattern to updates generally.

## Errors as values

I like the Golang way of returning errors along with values, however, TS only allows one return value. So, we frequently will need to do something like this.

Here we see a place where we need a try catch, because some dependency does not return errors as values:

export async function getLatest(
  db: D1Database,
): Promise<[Snippet[], null] | [null, Error]> {
  try {
    const result = await db
      .prepare('SELECT id, title, content, user_id, version FROM snippets ORDER BY id DESC limit 10')
      .all<Snippet>()

    return [result.results, null]
  } catch (e) {
    const err: Error = e instanceof Error ? e : new Error(String(e))
    return [null, err]
  }
}

We always do this at the lowest possible level in our app - we always pass errors upwards as values using tuples.

Above that, in the request handler, that error is handled like:

  const [snippets, err] = await snippetQueries.getLatest(c.env.MY_DB)
  if (err !== null) {
    return errors.serverErrorResponse(c, err)
  }
