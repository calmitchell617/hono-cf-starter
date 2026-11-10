import type { TemplateData } from './base'
import type { Snippet } from '../handlers/models/snippets'
import { SnippetPage } from './pages/snippet'
import { HomePage } from './pages/home'
import { CreateSnippetPage } from './pages/create-snippet'
import { EditSnippetPage } from './pages/edit-snippet'
import type { SnippetFormValues } from './partials/snippet-form'
import type { CreateSnippetPageProps } from './pages/create-snippet'
import { ErrorPage } from './pages/error'
import { render } from './render'
import { LoginPage } from './pages/login'
import type { LoginPageProps } from './pages/login'
import { SignupPage } from './pages/signup'
import type { SignupPageProps } from './pages/signup'
import { LoginConfirmPage } from './pages/login-confirm'
import { CheckEmailPage } from './pages/check-email'
import { LoginLinkEmail } from './emails/login-link'
import { SettingsPage } from './pages/settings'
import type { SettingsPageProps } from './pages/settings'

export function settingsPage(props: SettingsPageProps = {}, data: TemplateData = {}) {
  return render(() => <SettingsPage {...props} {...data} />)
}

export function snippetPage(snippet: Snippet, data: TemplateData = {}, canEdit = false) {
  return render(() => <SnippetPage snippet={snippet} canEdit={canEdit} {...data} />)
}

export function homePage(snippets: Snippet[], data: TemplateData = {}) {
  return render(() => <HomePage snippets={snippets} {...data} />)
}

export function createSnippetPage(props: CreateSnippetPageProps = {}, data: TemplateData = {}) {
  return render(() => <CreateSnippetPage {...props} {...data} />)
}

export function editSnippetPage(id: number, props: SnippetFormValues = {}, data: TemplateData = {}) {
  return render(() => <EditSnippetPage id={id} {...props} {...data} />)
}

export function errorPage(status: number, title: string, message: string, data: TemplateData = {}) {
  return render(() => <ErrorPage status={status} title={title} message={message} {...data} />)
}

export function loginPage(props: LoginPageProps = {}, data: TemplateData = {}) {
  return render(() => <LoginPage {...props} {...data} />)
}

export function signupPage(props: SignupPageProps = {}, data: TemplateData = {}) {
  return render(() => <SignupPage {...props} {...data} />)
}

export function loginConfirmPage(token: string, email: string, data: TemplateData = {}) {
  return render(() => <LoginConfirmPage token={token} email={email} {...data} />)
}

export function checkEmailPage(data: TemplateData = {}) {
  return render(() => <CheckEmailPage {...data} />)
}

export function loginLinkEmail(url: string, expiresIn: string) {
  return render(() => <LoginLinkEmail url={url} expiresIn={expiresIn} />)
}
