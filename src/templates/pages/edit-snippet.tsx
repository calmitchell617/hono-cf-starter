import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import { SnippetForm } from '../partials/snippet-form'
import type { SnippetFormValues } from '../partials/snippet-form'

type EditSnippetPageProps = TemplateData & SnippetFormValues & {
  id: number
}

export function EditSnippetPage({ id, snippetValues, snippetFieldErrors, snippetFormErrors, ...templateData }: EditSnippetPageProps) {
  return (
    <BaseTemplate title="Edit snippet" {...templateData}>
      <h1>Edit snippet</h1>
      <SnippetForm action={`/snippets/${id}/edit`} submitLabel="Save changes"
        snippetValues={snippetValues} snippetFieldErrors={snippetFieldErrors} snippetFormErrors={snippetFormErrors} />
      <p><a href={`/snippets/${id}`}>Cancel</a></p>
    </BaseTemplate>
  )
}
