import type { TemplateData } from './base'
import type { Post } from '../handlers/models/posts'
import { PostPage } from './pages/post'
import { HomePage } from './pages/home'
import { CreatePostPage } from './pages/create-post'
import { EditPostPage } from './pages/edit-post'
import type { PostFormValues } from './partials/post-form'
import type { CreatePostPageProps } from './pages/create-post'
import { ErrorPage } from './pages/error'
import { render } from './render'
import { LoginPage } from './pages/login'
import type { LoginPageProps } from './pages/login'
import { SignupPage } from './pages/signup'
import type { SignupPageProps } from './pages/signup'
import { LoginConfirmPage } from './pages/login-confirm'
import { CheckEmailPage } from './pages/check-email'
import { EmailChangeConfirmPage } from './pages/email-change-confirm'
import type { EmailChangeConfirmPageProps } from './pages/email-change-confirm'
import { SettingsPage } from './pages/settings'
import type { SettingsPageProps } from './pages/settings'

export { loginLinkEmail } from './emails/login-link'
export { emailChangeEmail } from './emails/email-change'

export function settingsPage(data: TemplateData = {}, formData: SettingsPageProps = {}) {
  return render(() => <SettingsPage {...formData} {...data} />)
}

export function postPage(post: Post, data: TemplateData = {}, canEdit = false) {
  return render(() => <PostPage post={post} canEdit={canEdit} {...data} />)
}

export function homePage(posts: Post[], data: TemplateData = {}) {
  return render(() => <HomePage posts={posts} {...data} />)
}

export function createPostPage(data: TemplateData = {}, formData: CreatePostPageProps = {}) {
  return render(() => <CreatePostPage {...formData} {...data} />)
}

export function editPostPage(id: number, data: TemplateData = {}, formData: PostFormValues = {}) {
  return render(() => <EditPostPage id={id} {...formData} {...data} />)
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

export function emailChangeConfirmPage(data: TemplateData = {}, formData: EmailChangeConfirmPageProps = {}) {
  return render(() => <EmailChangeConfirmPage {...formData} {...data} />)
}
