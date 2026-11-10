import type { Snippet } from '../../handlers/models/snippets'
import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'

type SnippetPageProps = TemplateData & {
  snippet: Snippet
  canEdit: boolean
}

export function SnippetPage({ snippet, canEdit, ...templateData }: SnippetPageProps) {
  return (
    <BaseTemplate title={snippet.title} {...templateData}>
      <h1>{snippet.title}</h1>
      <p>Snippet #{snippet.id}</p>
      {canEdit && (
        <p><a href={`/snippets/${snippet.id}/edit`}>Edit snippet</a></p>
      )}
      <pre><code>{snippet.content}</code></pre>
    </BaseTemplate>
  )
}
