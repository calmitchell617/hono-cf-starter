import type { Post } from '../../handlers/models/posts'
import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

type HomePageProps = TemplateData & {
  posts: Post[]
}

export function HomePage({ posts, ...templateData }: HomePageProps) {
  return (
    <BaseTemplate title="Home" {...templateData}>
      <h1>Posts</h1>
      {posts.length === 0 ? (
        <p>No posts yet.</p>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post.id}>
              <a href={`/posts/${post.id}`}>{post.title}</a>
              {' '}#{post.id}
            </li>
          ))}
        </ul>
      )}
    </BaseTemplate>
  )
}
