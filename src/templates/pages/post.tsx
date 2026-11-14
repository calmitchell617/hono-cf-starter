import type { Post } from '../../handlers/models/posts'
import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

type PostPageProps = TemplateData & {
  post: Post
  canEdit: boolean
}

export function PostPage({ post, canEdit, ...templateData }: PostPageProps) {
  return (
    <BaseTemplate title={post.title} {...templateData}>
      <h1>{post.title}</h1>
      <p>Post #{post.id}</p>
      {canEdit && (
        <p><a href={`/posts/${post.id}/edit`}>Edit post</a></p>
      )}
      <pre><code>{post.content}</code></pre>
    </BaseTemplate>
  )
}
