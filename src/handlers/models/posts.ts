import { toError } from '../../lib'
import { ErrEditConflict, ErrRecordNotFound } from './errors'

export type Post = {
  title: string
  content: string
  id: number
  user_id: number
  version: number
}

export async function getLatest(
  db: D1Database,
): Promise<[Post[], null] | [null, Error]> {
  try {
    const result = await db
      .prepare('SELECT id, title, content, user_id, version FROM posts ORDER BY id DESC limit 10')
      .all<Post>()

    return [result.results, null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function getByID(
  db: D1Database,
  id: number,
): Promise<[Post, null] | [null, Error]> {
  try {
    if (!Number.isInteger(id) || id < 1) {
      throw ErrRecordNotFound
    }

    const post = await db
      .prepare('SELECT id, title, content, user_id, version FROM posts WHERE id = ?')
      .bind(id)
      .first<Post>()

    if (post === null) {
      throw ErrRecordNotFound
    }

    return [post, null]

  } catch (e) {
    return [null, toError(e)]
  }
}

export async function insert(
  db: D1Database,
  post: Pick<Post, 'title' | 'content'>,
  userId: number,
): Promise<[Post, null] | [null, Error]> {
  try {
    const insertedPost = await db
      .prepare('INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?) RETURNING id, title, content, user_id, version')
      .bind(post.title, post.content, userId)
      .first<Post>()

    return [insertedPost!, null]
  } catch (e) {
    return [null, toError(e)]
  }
}

export async function update(
  db: D1Database,
  post: Post,
  input: Pick<Post, 'title' | 'content'>,
): Promise<[Post, null] | [null, Error]> {
  try {
    const updatedPost = await db.prepare(`
      UPDATE posts SET title = ?, content = ?, version = version + 1
      WHERE id = ? AND version = ?
      RETURNING id, title, content, user_id, version
    `).bind(input.title, input.content, post.id, post.version).first<Post>()
    if (updatedPost === null) return [null, ErrEditConflict]
    return [updatedPost, null]
  } catch (e) {
    return [null, toError(e)]
  }
}
