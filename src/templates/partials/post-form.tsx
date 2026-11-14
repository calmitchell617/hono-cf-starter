import type { PostInput } from '../../handlers/posts'

export type PostFormValues = {
  postValues?: Partial<PostInput>
  postFieldErrors?: Partial<Record<keyof PostInput, string[]>>
  postFormErrors?: string[]
}

type PostFormProps = PostFormValues & {
  action: string
  submitLabel: string
}

export function PostForm({ action, submitLabel, postValues = {}, postFieldErrors = {}, postFormErrors = [] }: PostFormProps) {
  return (
    <form action={action} method="post">
      {postFormErrors.map(message => <p role="alert">{message}</p>)}
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          value={postValues.title ?? ''}
          aria-invalid={postFieldErrors.title ? 'true' : undefined}
          aria-describedby={postFieldErrors.title ? 'title-errors' : undefined}
        />
        {postFieldErrors.title && (
          <div id="title-errors" role="alert">
            {postFieldErrors.title.map(message => <p>{message}</p>)}
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
          aria-invalid={postFieldErrors.content ? 'true' : undefined}
          aria-describedby={postFieldErrors.content ? 'content-errors' : undefined}
        >{postValues.content ?? ''}</textarea>
        {postFieldErrors.content && (
          <div id="content-errors" role="alert">
            {postFieldErrors.content.map(message => <p>{message}</p>)}
          </div>
        )}
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  )
}
