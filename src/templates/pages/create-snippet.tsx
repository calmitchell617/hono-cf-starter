import { BaseTemplate } from '../base'
import type { TemplateData } from '../base'
import { SnippetForm } from '../partials/snippet-form'
import type { SnippetFormValues } from '../partials/snippet-form'

export type CreateSnippetPageProps = TemplateData & SnippetFormValues

export function CreateSnippetPage({ values, errors, formErrors, ...templateData }: CreateSnippetPageProps) {
  return (
    <BaseTemplate title="Create snippet" {...templateData}>
      <h1>Create snippet</h1>
      <SnippetForm action="/snippets/create" submitLabel="Create snippet"
        values={values} errors={errors} formErrors={formErrors} />
    </BaseTemplate>
  )
}
