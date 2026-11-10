import type { Snippet } from '../../handlers/models/snippets'
import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

type HomePageProps = TemplateData & {
  snippets: Snippet[]
}

export function HomePage({ snippets, ...templateData }: HomePageProps) {
  return (
    <BaseTemplate title="Home" {...templateData}>
      <h1>Snippets</h1>
      {snippets.length === 0 ? (
        <p>No snippets yet.</p>
      ) : (
        <ul>
          {snippets.map((snippet) => (
            <li key={snippet.id}>
              <a href={`/snippets/${snippet.id}`}>{snippet.title}</a>
              {' '}#{snippet.id}
            </li>
          ))}
        </ul>
      )}
    </BaseTemplate>
  )
}
