import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import { PostForm } from '../partials/post-form'
import type { PostFormValues } from '../partials/post-form'

export type CreatePostPageProps = TemplateData & PostFormValues

export function CreatePostPage({ postValues, postFieldErrors, postFormErrors, ...templateData }: CreatePostPageProps) {
  return (
    <BaseTemplate title="Create post" {...templateData}>
      <h1>Create post</h1>
      <PostForm action="/posts/create" submitLabel="Create post"
        postValues={postValues} postFieldErrors={postFieldErrors} postFormErrors={postFormErrors} />
    </BaseTemplate>
  )
}
