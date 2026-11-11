import type { SnippetInput } from '../../handlers/snippets'

export type SnippetFormValues = {
  snippetValues?: Partial<SnippetInput>
  snippetErrors?: Partial<Record<keyof SnippetInput, string[]>>
  snippetFormErrors?: string[]
}

type SnippetFormProps = SnippetFormValues & {
  action: string
  submitLabel: string
}

export function SnippetForm({ action, submitLabel, snippetValues = {}, snippetErrors = {}, snippetFormErrors = [] }: SnippetFormProps) {
  return (
    <form action={action} method="post">
      {snippetFormErrors.map(message => <p role="alert">{message}</p>)}
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          value={snippetValues.title ?? ''}
          aria-invalid={snippetErrors.title ? 'true' : undefined}
          aria-describedby={snippetErrors.title ? 'title-errors' : undefined}
        />
        {snippetErrors.title && (
          <div id="title-errors" role="alert">
            {snippetErrors.title.map(message => <p>{message}</p>)}
          </div>
        )}
      </div>
      <div>
        <label htmlFor="content">Content</label>
        <textarea
          id="content"
          name="content"
          rows={10}
          cols={60}
          aria-invalid={snippetErrors.content ? 'true' : undefined}
          aria-describedby={snippetErrors.content ? 'content-errors' : undefined}
        >{snippetValues.content ?? ''}</textarea>
        {snippetErrors.content && (
          <div id="content-errors" role="alert">
            {snippetErrors.content.map(message => <p>{message}</p>)}
          </div>
        )}
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  )
}
