import { ErrEditConflict, ErrRecordNotFound } from './errors'

export type Snippet = {
  title: string
  content: string
  id: number
  user_id: number
  version: number
}

export async function getLatest(
  db: D1Database,
): Promise<[Snippet[], null] | [null, Error]> {
  try {
    const result = await db
      .prepare('SELECT id, title, content, user_id, version FROM snippets ORDER BY id DESC limit 10')
      .all<Snippet>()

    return [result.results, null]
  } catch (e) {
    const err: Error = e instanceof Error ? e : new Error(String(e))
    return [null, err]
  }
}

export async function getByID(
  db: D1Database,
  id: number,
): Promise<[Snippet, null] | [null, Error]> {
  try {
    if (!Number.isInteger(id) || id < 1) {
      throw ErrRecordNotFound
    }

    const snippet = await db
      .prepare('SELECT id, title, content, user_id, version FROM snippets WHERE id = ?')
      .bind(id)
      .first<Snippet>()

    if (snippet === null) {
      throw ErrRecordNotFound
    }

    return [snippet, null]

  } catch (e) {
    const err: Error = e instanceof Error ? e : new Error(String(e))
    return [null, err]
  }
}

export async function insert(
  db: D1Database,
  snippet: Pick<Snippet, 'title' | 'content'>,
  userId: number,
): Promise<[Snippet, null] | [null, Error]> {
  try {
    const insertedSnippet = await db
      .prepare('INSERT INTO snippets (title, content, user_id) VALUES (?, ?, ?) RETURNING id, title, content, user_id, version')
      .bind(snippet.title, snippet.content, userId)
      .first<Snippet>()

    if (insertedSnippet === null) {
      throw new Error('models: insert returned no snippet')
    }

    return [insertedSnippet, null]
  } catch (e) {
    const err: Error = e instanceof Error ? e : new Error(String(e))
    return [null, err]
  }
}

export async function update(
  db: D1Database,
  snippet: Snippet,
  input: Pick<Snippet, 'title' | 'content'>,
): Promise<[Snippet, null] | [null, Error]> {
  try {
    const updatedSnippet = await db.prepare(`
      UPDATE snippets SET title = ?, content = ?, version = version + 1
      WHERE id = ? AND version = ?
      RETURNING id, title, content, user_id, version
    `).bind(input.title, input.content, snippet.id, snippet.version).first<Snippet>()
    if (updatedSnippet === null) return [null, ErrEditConflict]
    return [updatedSnippet, null]
  } catch (e) {
    return [null, e instanceof Error ? e : new Error(String(e))]
  }
}
