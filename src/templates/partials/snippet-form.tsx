import type { SnippetInput } from '../../handlers/snippets'

export type SnippetFormValues = {
  values?: Partial<SnippetInput>
  errors?: Partial<Record<keyof SnippetInput, string[]>>
  formErrors?: string[]
}

type SnippetFormProps = SnippetFormValues & {
  action: string
  submitLabel: string
}

export function SnippetForm({ action, submitLabel, values = {}, errors = {}, formErrors = [] }: SnippetFormProps) {
  return (
    <form action={action} method="post">
      {formErrors.map(message => <p role="alert">{message}</p>)}
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          value={values.title ?? ''}
          aria-invalid={errors.title ? 'true' : undefined}
          aria-describedby={errors.title ? 'title-errors' : undefined}
        />
        {errors.title && (
          <div id="title-errors" role="alert">
            {errors.title.map(message => <p>{message}</p>)}
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
          aria-invalid={errors.content ? 'true' : undefined}
          aria-describedby={errors.content ? 'content-errors' : undefined}
        >{values.content ?? ''}</textarea>
        {errors.content && (
          <div id="content-errors" role="alert">
            {errors.content.map(message => <p>{message}</p>)}
          </div>
        )}
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  )
}
