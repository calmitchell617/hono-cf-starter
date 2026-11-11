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
import { EmailChangeEmail } from './emails/email-change'
import { EmailChangeConfirmPage } from './pages/email-change-confirm'
import type { EmailChangeConfirmPageProps } from './pages/email-change-confirm'
import { SettingsPage } from './pages/settings'
import type { SettingsPageProps } from './pages/settings'

export function settingsPage(data: TemplateData = {}, formData: SettingsPageProps = {}) {
  return render(() => <SettingsPage {...formData} {...data} />)
}

export function snippetPage(snippet: Snippet, data: TemplateData = {}, canEdit = false) {
  return render(() => <SnippetPage snippet={snippet} canEdit={canEdit} {...data} />)
}

export function homePage(snippets: Snippet[], data: TemplateData = {}) {
  return render(() => <HomePage snippets={snippets} {...data} />)
}

export function createSnippetPage(data: TemplateData = {}, formData: CreateSnippetPageProps = {}) {
  return render(() => <CreateSnippetPage {...formData} {...data} />)
}

export function editSnippetPage(id: number, data: TemplateData = {}, formData: SnippetFormValues = {}) {
  return render(() => <EditSnippetPage id={id} {...formData} {...data} />)
}

export function errorPage(status: number, title: string, message: string, data: TemplateData = {}) {
  return render(() => <ErrorPage status={status} title={title} message={message} {...data} />)
}

export function loginPage(data: TemplateData = {}, formData: LoginPageProps = {}) {
  return render(() => <LoginPage {...formData} {...data} />)
}

export function signupPage(data: TemplateData = {}, formData: SignupPageProps = {}) {
  return render(() => <SignupPage {...formData} {...data} />)
}

export function loginConfirmPage(token: string, email: string, data: TemplateData = {}) {
  return render(() => <LoginConfirmPage loginConfirmValues={{ token }} email={email} {...data} />)
}

export function checkEmailPage(data: TemplateData = {}) {
  return render(() => <CheckEmailPage {...data} />)
}

export function loginLinkEmail(url: string, expiresIn: string) {
  return render(() => <LoginLinkEmail url={url} expiresIn={expiresIn} />)
}

export function emailChangeEmail(url: string, token: string, expiresIn: string) {
  return render(() => <EmailChangeEmail url={url} token={token} expiresIn={expiresIn} />)
}

export function emailChangeConfirmPage(data: TemplateData = {}, formData: EmailChangeConfirmPageProps = {}) {
  return render(() => <EmailChangeConfirmPage {...formData} {...data} />)
}
