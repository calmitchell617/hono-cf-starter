import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import { PostForm } from '../partials/post-form'
import type { PostFormValues } from '../partials/post-form'

type EditPostPageProps = TemplateData & PostFormValues & {
  id: number
}

export function EditPostPage({ id, postValues, postFieldErrors, postFormErrors, ...templateData }: EditPostPageProps) {
  return (
    <BaseTemplate title="Edit post" {...templateData}>
      <h1>Edit post</h1>
      <PostForm action={`/posts/${id}/edit`} submitLabel="Save changes"
        postValues={postValues} postFieldErrors={postFieldErrors} postFormErrors={postFormErrors} />
      <p><a href={`/posts/${id}`}>Cancel</a></p>
    </BaseTemplate>
  )
}
