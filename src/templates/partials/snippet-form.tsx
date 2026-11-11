import type { SnippetInput } from '../../handlers/snippets'

export type SnippetFormValues = {
  snippetValues?: Partial<SnippetInput>
  snippetFieldErrors?: Partial<Record<keyof SnippetInput, string[]>>
  snippetFormErrors?: string[]
}

type SnippetFormProps = SnippetFormValues & {
  action: string
  submitLabel: string
}

export function SnippetForm({ action, submitLabel, snippetValues = {}, snippetFieldErrors = {}, snippetFormErrors = [] }: SnippetFormProps) {
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
          aria-invalid={snippetFieldErrors.title ? 'true' : undefined}
          aria-describedby={snippetFieldErrors.title ? 'title-errors' : undefined}
        />
        {snippetFieldErrors.title && (
          <div id="title-errors" role="alert">
            {snippetFieldErrors.title.map(message => <p>{message}</p>)}
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
          aria-invalid={snippetFieldErrors.content ? 'true' : undefined}
          aria-describedby={snippetFieldErrors.content ? 'content-errors' : undefined}
        >{snippetValues.content ?? ''}</textarea>
        {snippetFieldErrors.content && (
          <div id="content-errors" role="alert">
            {snippetFieldErrors.content.map(message => <p>{message}</p>)}
          </div>
        )}
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  )
}
