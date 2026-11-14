import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

let runtime
let db
let kv
let application
let fixture
let usersModel
let postsModel
let tokensModel
let authorizationFixture
let buildDirectory
let sentEmails = []
const secret = randomBytes(32).toString('hex')
const previousSecret = process.env.AUTH_SECRET

before(async () => {
  // Hono's env adapter reads process.env when these handlers run in Node.
  process.env.AUTH_SECRET = secret
  buildDirectory = await mkdtemp(join(tmpdir(), 'hono-cloudflare-starter-kv-sessions-'))
  await Promise.all([
    build({ entryPoints: ['src/index.ts'], bundle: true, format: 'esm', outfile: join(buildDirectory, 'application.mjs') }),
    build({ entryPoints: ['tests/fixtures/sessions.ts'], bundle: true, format: 'esm', outfile: join(buildDirectory, 'fixture.mjs') }),
    build({ entryPoints: ['src/handlers/models/users.ts'], bundle: true, format: 'esm', outfile: join(buildDirectory, 'users.mjs') }),
    build({ entryPoints: ['src/handlers/models/posts.ts'], bundle: true, format: 'esm', outfile: join(buildDirectory, 'posts.mjs') }),
    build({ entryPoints: ['src/handlers/models/tokens.ts'], bundle: true, format: 'esm', outfile: join(buildDirectory, 'tokens.mjs') }),
    build({ entryPoints: ['tests/fixtures/authorization.ts'], bundle: true, format: 'esm', outfile: join(buildDirectory, 'authorization.mjs') }),
  ])
  ;({ default: application } = await import(pathToFileURL(join(buildDirectory, 'application.mjs')).href))
  ;({ default: fixture } = await import(pathToFileURL(join(buildDirectory, 'fixture.mjs')).href))
  usersModel = await import(pathToFileURL(join(buildDirectory, 'users.mjs')).href)
  postsModel = await import(pathToFileURL(join(buildDirectory, 'posts.mjs')).href)
  tokensModel = await import(pathToFileURL(join(buildDirectory, 'tokens.mjs')).href)
  ;({ default: authorizationFixture } = await import(pathToFileURL(join(buildDirectory, 'authorization.mjs')).href))
  runtime = new Miniflare({ workers: [{
    config: {
      name: 'storage',
      compatibilityDate: '2026-10-30',
      manifest: {
        mainModule: 'worker.mjs',
        modules: { 'worker.mjs': { type: 'esm', contents: await readFile(join(buildDirectory, 'fixture.mjs'), 'utf8') } },
      },
      env: {
        MY_DB: { type: 'd1', id: 'posts-test-db' },
        SESSION_KV: { type: 'kv', id: 'sessions-test-kv' },
        AUTH_SECRET: { type: 'json', value: secret },
      },
    },
  }] })
  db = await runtime.getD1Database('MY_DB', 'storage')
  kv = await runtime.getKVNamespace('SESSION_KV', 'storage')
  const migrations = new URL('../migrations/', import.meta.url)
  for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(file, migrations), 'utf8')
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)))
  }
})

beforeEach(async () => {
  sentEmails = []
  const { keys } = await kv.list()
  await Promise.all(keys.map(({ name }) => kv.delete(name)))
  await db.prepare('DELETE FROM posts').run()
  await db.prepare('DELETE FROM tokens').run()
  await db.prepare('DELETE FROM users').run()
})

after(async () => {
  await runtime?.dispose()
  if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true })
  if (previousSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = previousSecret
})

// Drain background work between test requests, as the Workers runtime does after
// returning a response. The application itself does not await KV writes.
async function request(app, path, options = {}, bindings = {}) {
  const pending = []
  const response = await app.request(`https://example.com${path}`, options, {
    AUTH_SECRET: secret, SESSION_KV: kv, MY_DB: db,
    APP_URL: 'https://example.com', EMAIL_FROM: 'login@calmitchell.tech',
    LOGIN_TOKEN_LIFETIME_SECONDS: 900,
    EMAIL: { async send(message) { sentEmails.push(message); return { messageId: 'test-message' } } },
    RATE_LIMIT: { async limit() { return { success: true } } },
    LOGIN_RATE_LIMIT: { async limit() { return { success: true } } },
    ...bindings,
  }, { waitUntil(promise) { pending.push(promise) } })
  await Promise.all(pending)
  return response
}
const cookieOf = response => response.headers.getSetCookie().find(value => value.startsWith('sid=')).split(';')[0]
const login = () => request(fixture, '/login', { method: 'POST' })

test('login stores data in KV and sends an encrypted Secure cookie', async () => {
  const response = await login()
  assert.equal(response.status, 303)
  const cookie = cookieOf(response)
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
  assert.match(response.headers.get('set-cookie'), /; Secure(?:;|$)/)
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i)
  assert.ok(!response.headers.get('set-cookie').includes('Max-Age='))
  const { keys } = await kv.list()
  assert.equal(keys.length, 1)
  assert.notEqual(keys[0].name, cookie.slice(4))
  assert.ok(keys[0].expiration > Date.now() / 1000 + 29 * 24 * 60 * 60)
  assert.deepEqual(await kv.get(keys[0].name, 'json'), { userId: 123 })
  assert.deepEqual(await (await request(fixture, '/read', { headers: { cookie } })).json(), { userId: 123 })
})

test('an anonymous read does not create a KV entry', async () => {
  assert.equal(await (await request(fixture, '/read')).json(), null)
  assert.equal((await kv.list()).keys.length, 0)
})

test('the Workers runtime reads AUTH_SECRET from its binding and loads the KV session', async () => {
  const cookie = cookieOf(await login())
  const response = await runtime.dispatchFetch('https://example.com/read', {
    headers: { cookie },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { userId: 123 })
  assert.deepEqual(response.headers.getSetCookie(), [])
})

test('reading an existing session does not write or refresh its cookie', async () => {
  const cookie = cookieOf(await login())
  let writes = 0
  const readOnlyKV = {
    get: (...args) => kv.get(...args),
    put: (...args) => { writes++; return kv.put(...args) },
    delete: (...args) => { writes++; return kv.delete(...args) },
  }
  for (let i = 0; i < 3; i++) {
    const response = await request(fixture, '/read', { headers: { cookie } }, { SESSION_KV: readOnlyKV })
    assert.deepEqual(await response.json(), { userId: 123 })
    assert.deepEqual(response.headers.getSetCookie(), [])
  }
  assert.equal(writes, 0)
})

test('KV writes are registered with waitUntil without blocking the response', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const pending = []
  const backgroundKV = {
    get: (...args) => kv.get(...args),
    delete: (...args) => kv.delete(...args),
    put: (...args) => gate.then(() => kv.put(...args)),
  }
  try {
    const response = await fixture.request('https://example.com/login', { method: 'POST' }, {
      AUTH_SECRET: secret, SESSION_KV: backgroundKV,
    }, { waitUntil(promise) { pending.push(promise) } })
    assert.equal(response.status, 303)
    assert.equal(pending.length, 1)
    assert.equal((await kv.list()).keys.length, 0)
    release()
    await Promise.all(pending)
    assert.equal((await kv.list()).keys.length, 1)
  } finally {
    release()
    await Promise.all(pending)
  }
})

test('logout schedules deletion and expires the cookie', async () => {
  const cookie = cookieOf(await login())
  const response = await request(fixture, '/logout', { method: 'POST', headers: { cookie } })
  assert.equal(response.status, 303)
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith('sid=') && value.includes('Max-Age=0')))
  assert.equal((await kv.list()).keys.length, 0)
  assert.equal(await (await request(fixture, '/read', { headers: { cookie } })).json(), null)
})

test('HTTP development can set a session cookie', async () => {
  const pending = []
  const response = await fixture.request('http://localhost/login', { method: 'POST' }, {
    AUTH_SECRET: secret, SESSION_KV: kv,
  }, { waitUntil(promise) { pending.push(promise) } })
  await Promise.all(pending)
  assert.equal(response.status, 303)
  assert.ok(!response.headers.get('set-cookie').includes('Secure'))
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
})

test('pages, validation and business writes work without a D1 sessions table', async () => {
  assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").first(), null)
  const { token } = await signup()
  const cookie = cookieOf(await postForm('/login/confirm', { token }))
  const response = await request(application, '/posts/create', { headers: { cookie } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  const invalid = await request(application, '/posts/create', {
    method: 'POST', headers: { cookie, origin: 'https://example.com' }, body: new URLSearchParams({ title: '', content: 'Keep this' }),
  })
  assert.equal(invalid.status, 400)
  const html = await invalid.text()
  assert.ok(html.includes('id="title-errors"'))
  assert.ok(html.includes('Keep this'))
  const created = await request(application, '/posts/create', {
    method: 'POST', headers: { cookie, origin: 'https://example.com' }, body: new URLSearchParams({ title: 'Title', content: 'Text' }),
  })
  assert.equal(created.status, 303)
  assert.equal((await request(application, '/')).status, 200)
  assert.equal((await request(application, '/missing')).status, 404)
  assert.equal((await kv.list()).keys.length, 1)
})

const postForm = (path, values, headers = {}, bindings = {}) => request(application, path, {
  method: 'POST', headers: { origin: 'https://example.com', ...headers }, body: new URLSearchParams(values),
}, bindings)

async function signup(email = 'reader@example.com', name = 'Reader') {
  const response = await postForm('/signup', { email, name })
  assert.equal(response.status, 303)
  const url = new URL(sentEmails.at(-1).text.match(/https:\/\/[^\s]+/)[0])
  return { url, token: url.searchParams.get('token') }
}

async function signedIn(email = 'owner@example.com') {
  const { token } = await signup(email)
  return cookieOf(await postForm('/login/confirm', { token }))
}

async function grantAdmin(email) {
  await db.prepare(`
    INSERT INTO user_roles (user_id, role_code)
    SELECT users.id, 'admin' FROM users
    WHERE users.email = ?
  `).bind(email).run()
}

test('settings loads all permissions in one query for conditional forms', async () => {
  const cookie = await signedIn()
  await grantAdmin('owner@example.com')
  let queries = 0
  const bindings = { MY_DB: { prepare(sql) { queries++; return db.prepare(sql) } } }
  const response = await request(application, '/settings', { headers: { cookie } }, bindings)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Promote to admin/)
  assert.equal(queries, 1)
  assert.equal(response.headers.get('set-cookie'), null)

  await db.prepare("UPDATE users SET name = 'Updated name'").run()
  const updated = await request(application, '/settings', { headers: { cookie } })
  assert.match(await updated.text(), /Updated name/)
})

test('the chains load all permissions when needed and post handlers load roles separately', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Text' }, { cookie })
  const postPath = created.headers.get('location')
  const queries = []
  const bindings = { MY_DB: {
    prepare(sql) {
      const query = { sql, params: [] }
      queries.push(query)
      const statement = db.prepare(sql)
      return { bind(...params) { query.params = params; return statement.bind(...params) } }
    },
  } }
  const userId = (await db.prepare('SELECT id FROM users').first()).id
  for (const [path, loadPermissions, queryCount, status] of [
    ['/login', false, 1, 200],
    ['/posts/create', true, 1, 200],
    ['/settings', true, 1, 200],
    [postPath, true, 3, 200],
    [`${postPath}/edit`, true, 3, 200],
    ['/missing', false, 0, 404],
  ]) {
    queries.length = 0
    const response = await request(application, path, { headers: { cookie } }, bindings)
    assert.equal(response.status, status, path)
    assert.equal(queries.length, queryCount, path)
    if (queryCount === 0) continue
    assert.deepEqual(queries[0].params, [userId], path)
    assert.doesNotMatch(queries[0].sql, /EXISTS|JOIN roles|isAdmin/, path)
    if (!loadPermissions) assert.doesNotMatch(queries[0].sql, /permissions|user_roles|isAdmin/, path)
    if (loadPermissions) {
      assert.match(queries[0].sql, /JOIN permissions/)
      assert.doesNotMatch(queries[0].sql, /json_each/)
    }
    if (queryCount === 3) {
      assert.match(queries[2].sql, /JOIN user_roles/)
      assert.doesNotMatch(queries[2].sql, /JOIN roles/)
      assert.deepEqual(queries[2].params, [userId])
    }
  }

  queries.length = 0
  const denied = await postForm('/settings/change-admins', { email: 'owner@example.com' }, { cookie }, bindings)
  assert.equal(denied.status, 403)
  assert.equal(queries.length, 1)
  assert.deepEqual(queries[0].params, [userId])
})

test('authentication and authorization load all permissions when needed in one query', async () => {
  for (const path of ['/authenticated', '/authenticated-all', '/authorized', '/authorized-all']) {
    const response = await request(authorizationFixture, path)
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/login')
  }
  const cookie = await signedIn()
  let queries = []
  const bindings = { MY_DB: { prepare(sql) { queries.push(sql); return db.prepare(sql) } } }
  for (const path of ['/authenticated', '/authenticated-all', '/authorized', '/authorized-all']) {
    queries = []
    const response = await request(authorizationFixture, path, { headers: { cookie } }, bindings)
    assert.equal(queries.length, 1)
    assert.equal(response.status, path.startsWith('/authorized') ? 403 : 200)
    if (path === '/authenticated') {
      assert.deepEqual((await response.json()).permissions, [])
      assert.doesNotMatch(queries[0], /permissions|user_roles/)
    }
    if (path === '/authenticated-all') {
      assert.deepEqual(new Set((await response.json()).permissions), new Set([
        'posts:list', 'posts:view', 'posts:create', 'posts:edit',
      ]))
    }
  }
  await grantAdmin('owner@example.com')
  const authorized = await request(authorizationFixture, '/authorized', { headers: { cookie } })
  const granted = (await authorized.json()).permissions
  assert.deepEqual(new Set(granted), new Set([
    'posts:list', 'posts:view', 'posts:create', 'posts:edit', 'users:promote',
  ]))
  const broad = await request(authorizationFixture, '/authorized-all', { headers: { cookie } })
  assert.deepEqual((await broad.json()).permissions, granted)
  await db.prepare(`DELETE FROM user_roles
    WHERE user_id = (SELECT id FROM users WHERE email = 'owner@example.com')
      AND role_code = 'admin'`).run()
  assert.equal((await request(authorizationFixture, '/authorized-all', { headers: { cookie } })).status, 403)
  assert.equal((await request(authorizationFixture, '/authenticated-all', { headers: { cookie } })).status, 200)
})

test('auth allows anonymous access by default while still enforcing requested permissions', async () => {
  const noDatabase = { MY_DB: { prepare() { throw new Error('Anonymous requests must not query users') } } }
  const anonymous = await request(authorizationFixture, '/public', {}, noDatabase)
  assert.equal(anonymous.status, 200)
  assert.equal((await anonymous.json()).id, 0)
  const publicList = await request(authorizationFixture, '/public-list', {}, noDatabase)
  assert.equal(publicList.status, 200)
  assert.ok((await publicList.json()).permissions.includes('posts:list'))
  assert.equal((await request(authorizationFixture, '/public-admin', {}, noDatabase)).status, 403)

  const cookie = await signedIn()
  const user = await (await request(authorizationFixture, '/public', { headers: { cookie } })).json()
  assert.notEqual(user.id, 0)
  assert.deepEqual(user.permissions, [])
  const permissions = await (await request(authorizationFixture, '/public-list', { headers: { cookie } })).json()
  assert.deepEqual(new Set(permissions.permissions), new Set([
    'posts:list', 'posts:view', 'posts:create', 'posts:edit',
  ]))
  assert.equal((await request(authorizationFixture, '/public-admin', { headers: { cookie } })).status, 403)
  await grantAdmin('owner@example.com')
  assert.equal((await request(authorizationFixture, '/public-admin', { headers: { cookie } })).status, 200)
})

test('the role query returns all roles, supports users without roles, and reports missing users', async () => {
  await signup()
  const { id, created_at } = await db.prepare('SELECT id, created_at FROM users').first()
  let [user, err] = await usersModel.getByIDWithRoles(db, id)
  assert.equal(err, null)
  assert.equal(user.name, 'Reader')
  assert.equal(user.email, 'reader@example.com')
  assert.equal(user.created_at, created_at)
  assert.equal(Object.hasOwn(user, 'createdAt'), false)
  assert.deepEqual(user.roles, new Set(['public']))
  assert.deepEqual(user.permissions, new Set())
  await grantAdmin('reader@example.com')
  ;[user, err] = await usersModel.getByIDWithRoles(db, id)
  assert.equal(err, null)
  assert.deepEqual(user.roles, new Set(['admin', 'public']))
  const [withPermissions, permissionErr] = await usersModel.getByIDWithPermissions(db, id)
  assert.equal(permissionErr, null)
  assert.equal(withPermissions.created_at, created_at)
  assert.equal(Object.hasOwn(withPermissions, 'code'), false)
  assert.deepEqual(withPermissions.permissions, new Set([
    'posts:list', 'posts:view', 'posts:create', 'posts:edit', 'users:promote',
  ]))
  assert.deepEqual(withPermissions.roles, new Set())
  await db.prepare('DELETE FROM user_roles').run()
  ;[user, err] = await usersModel.getByIDWithRoles(db, id)
  assert.equal(err, null)
  assert.equal(user.id, id)
  assert.deepEqual(user.roles, new Set())
  await db.prepare('DELETE FROM users').run()
  ;[user, err] = await usersModel.getByIDWithRoles(db, id)
  assert.equal(user, null)
  assert.ok(err instanceof Error)
})

test('accounts without roles remain authenticated but have no permissions', async () => {
  const cookie = await signedIn()
  await db.prepare('DELETE FROM user_roles').run()
  const response = await request(application, '/settings', { headers: { cookie } })
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /Log out/)
  assert.doesNotMatch(html, /Promote to admin/)
  assert.equal((await postForm('/settings/change-admins', { email: 'owner@example.com' }, { cookie })).status, 403)
})

test('deleted accounts become anonymous and their existing session is invalidated', async () => {
  const cookie = await signedIn()
  await db.prepare('DELETE FROM users').run()
  const response = await request(application, '/settings', { headers: { cookie } })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/login')
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith('sid=') && value.includes('Max-Age=0')))
  assert.equal((await kv.list()).keys.length, 0)
  const home = await request(application, '/', { headers: { cookie } })
  assert.doesNotMatch(await home.text(), /Log out/)
})

test('authentication query failures return 500 and preserve the session; anonymous requests skip the lookup', async () => {
  const cookie = await signedIn()
  const bindings = { MY_DB: { prepare() { throw new Error('Authentication database unavailable') } } }
  const response = await request(application, '/settings', { headers: { cookie } }, bindings)
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal((await kv.list()).keys.length, 1)
  const anonymousResponse = await request(application, '/settings', {}, bindings)
  assert.equal(anonymousResponse.status, 303)
  assert.equal(anonymousResponse.headers.get('location'), '/login')
  assert.match(anonymousResponse.headers.get('set-cookie'), /sid=/)
  assert.equal((await kv.list()).keys.length, 1)
  assert.equal((await request(application, '/settings', { headers: { cookie } })).status, 200)
})

test('signup assigns public permissions and repeated signup preserves existing roles or their absence', async () => {
  await signup()
  const rolesForUser = () => db.prepare(`
    SELECT roles.code FROM roles JOIN user_roles ON user_roles.role_code = roles.code
    JOIN users ON users.id = user_roles.user_id WHERE users.email = ? ORDER BY roles.code
  `).bind('reader@example.com').all()
  assert.deepEqual((await rolesForUser()).results.map(row => row.code), ['public'])
  await grantAdmin('reader@example.com')
  await signup()
  assert.deepEqual((await rolesForUser()).results.map(row => row.code), ['admin', 'public'])
  await db.prepare("DELETE FROM user_roles WHERE role_code = 'public'").run()
  await signup()
  assert.deepEqual((await rolesForUser()).results.map(row => row.code), ['admin'])
  await db.prepare('DELETE FROM user_roles').run()
  const before = await db.prepare('SELECT * FROM users').first()
  await signup('reader@example.com', 'Changed name')
  assert.deepEqual((await rolesForUser()).results, [])
  assert.deepEqual(await db.prepare('SELECT * FROM users').first(), before)
})

test('admins can edit other users posts and revocation affects existing sessions', async () => {
  const owner = await signedIn()
  const admin = await signedIn('admin@example.com')
  const created = await postForm('/posts/create', { title: 'Original', content: 'Text' }, { cookie: owner })
  const path = created.headers.get('location')
  await grantAdmin('admin@example.com')
  assert.match(await (await request(application, path, { headers: { cookie: admin } })).text(), /Edit post/)
  assert.equal((await request(application, `${path}/edit`, { headers: { cookie: admin } })).status, 200)
  assert.equal((await postForm(`${path}/edit`, { title: 'Admin edit', content: 'Updated' }, { cookie: admin })).status, 303)
  const post = await db.prepare('SELECT posts.*, users.email FROM posts JOIN users ON users.id = posts.user_id').first()
  assert.equal(post.title, 'Admin edit')
  assert.equal(post.email, 'owner@example.com')
  await db.prepare(`DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = ?)
    AND role_code = 'admin'`).bind('admin@example.com').run()
  assert.equal((await request(application, `${path}/edit`, { headers: { cookie: admin } })).status, 404)
  assert.equal((await postForm(`${path}/edit`, { title: 'Denied', content: 'Denied' }, { cookie: admin })).status, 404)
  assert.doesNotMatch(await (await request(application, path, { headers: { cookie: admin } })).text(), /Edit post/)
  assert.equal((await db.prepare('SELECT title FROM posts').first()).title, 'Admin edit')
})

test('the admin role does not bypass the edit permission', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Text' }, { cookie })
  const path = created.headers.get('location')
  try {
    await db.batch([
      db.prepare(`DELETE FROM role_permissions WHERE role_code = 'admin'
        AND permission_id = (SELECT id FROM permissions WHERE code = 'posts:edit')`),
      db.prepare('DELETE FROM user_roles'),
      db.prepare(`INSERT INTO user_roles (user_id, role_code)
        SELECT users.id, roles.code FROM users CROSS JOIN roles WHERE roles.code = 'admin'`),
    ])
    assert.equal((await request(application, `${path}/edit`, { headers: { cookie } })).status, 403)
    assert.equal((await postForm(`${path}/edit`, { title: 'Denied', content: 'Denied' }, { cookie })).status, 403)
    assert.doesNotMatch(await (await request(application, path, { headers: { cookie } })).text(), /Edit post/)
    assert.equal((await db.prepare('SELECT title FROM posts').first()).title, 'Original')
  } finally {
    await db.prepare(`INSERT INTO role_permissions (role_code, permission_id)
      SELECT roles.code, permissions.id FROM roles CROSS JOIN permissions
      WHERE roles.code = 'admin' AND permissions.code = 'posts:edit'`).run()
  }
})

test('only admins can promote existing users through settings and promotion is idempotent', async () => {
  const admin = await signedIn('admin@example.com')
  const target = await signedIn('target@example.com')
  assert.equal((await postForm('/settings/change-admins', { email: 'target@example.com' })).status, 303)
  assert.equal((await postForm('/settings/change-admins', { email: 'admin@example.com' }, { cookie: target })).status, 403)
  assert.doesNotMatch(await (await request(application, '/settings', { headers: { cookie: target } })).text(), /Promote to admin/)
  await grantAdmin('admin@example.com')
  assert.match(await (await request(application, '/settings', { headers: { cookie: admin } })).text(), /Promote to admin/)
  assert.equal((await postForm('/settings/change-admins', { email: 'target@example.com' }, {
    cookie: admin, origin: 'https://evil.example',
  })).status, 403)
  for (const email of ['bad', 'unknown@example.com']) {
    const invalid = await postForm('/settings/change-admins', { email }, { cookie: admin })
    assert.equal(invalid.status, 400)
    assert.match(await invalid.text(), /id="admin-email-errors"/)
  }
  for (let i = 0; i < 2; i++) {
    const promoted = await postForm('/settings/change-admins', { email: ' TARGET@EXAMPLE.COM ' }, { cookie: admin })
    assert.equal(promoted.status, 303)
    assert.equal(promoted.headers.get('location'), '/settings')
  }
  const count = await db.prepare(`SELECT COUNT(*) FROM user_roles
    JOIN roles ON roles.code = user_roles.role_code
    JOIN users ON users.id = user_roles.user_id
    WHERE roles.code = 'admin' AND users.email = 'target@example.com'`).first('COUNT(*)')
  assert.equal(count, 1)
  const result = await request(application, '/settings', { headers: { cookie: admin } })
  assert.match(await result.text(), /target@example.com is now an admin/)
  assert.match(await (await request(application, '/settings', { headers: { cookie: target } })).text(), /Promote to admin/)
})

test('public users cannot assign roles through signup or profile fields', async () => {
  const response = await postForm('/signup', { name: 'Reader', email: 'reader@example.com', role: 'admin' })
  assert.equal(response.status, 303)
  const url = new URL(sentEmails.at(-1).text.match(/https:\/\/[^\s]+/)[0])
  const cookie = cookieOf(await postForm('/login/confirm', { token: url.searchParams.get('token') }))
  await postForm('/settings/change-name', { name: 'New name', role: 'admin' }, { cookie })
  assert.equal((await postForm('/settings/change-admins', { email: 'reader@example.com' }, { cookie })).status, 403)
  const count = await db.prepare(`SELECT COUNT(*) FROM user_roles
    JOIN roles ON roles.code = user_roles.role_code WHERE roles.code = 'admin'`).first('COUNT(*)')
  assert.equal(count, 0)
})

test('settings requires authentication and only updates the current user', async () => {
  for (const response of [await request(application, '/settings'), await postForm('/settings/change-name', { name: 'Changed' })]) {
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/login')
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  const cookie = await signedIn()
  const otherCookie = await signedIn('other@example.com')
  const other = await db.prepare('SELECT * FROM users WHERE email = ?').bind('other@example.com').first()
  const page = await request(application, '/settings', { headers: { cookie } })
  const html = await page.text()
  assert.equal(page.status, 200)
  assert.match(html, /href="\/settings">Settings/)
  assert.match(html, /name="name"[^>]*value="Reader"/)
  const response = await postForm('/settings/change-name', { name: '  Updated Name  ', id: String(other.id), email: other.email }, { cookie })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/settings')
  assert.equal((await db.prepare('SELECT name FROM users WHERE email = ?').bind('owner@example.com').first()).name, 'Updated Name')
  const unchanged = await request(application, '/settings', { headers: { cookie: otherCookie } })
  assert.match(await unchanged.text(), /value="Reader"/)
  const updated = await request(application, '/settings', { headers: { cookie } })
  const updatedHTML = await updated.text()
  assert.match(updatedHTML, /value="Updated Name"/)
  assert.match(updatedHTML, /role="status">Name updated\./)
  const again = await request(application, '/settings', { headers: { cookie } })
  assert.doesNotMatch(await again.text(), /Name updated\./)
  assert.match(await (await request(application, '/')).text(), /href="\/login"/)
  assert.doesNotMatch(await (await request(application, '/')).text(), /href="\/settings"/)
})

test('settings validates names, escapes values, and rejects cross-origin changes', async () => {
  const cookie = await signedIn()
  for (const name of ['', '   ', 'x'.repeat(101)]) {
    const invalid = await postForm('/settings/change-name', { name }, { cookie })
    assert.equal(invalid.status, 400)
    assert.match(await invalid.text(), /id="name-errors"/)
  }
  const crossOrigin = await postForm('/settings/change-name', { name: 'Changed' }, { cookie, origin: 'https://evil.example' })
  assert.equal(crossOrigin.status, 403)
  assert.equal((await db.prepare('SELECT name FROM users').first()).name, 'Reader')
  await postForm('/settings/change-name', { name: '<script>alert(1)</script>' }, { cookie })
  const page = await request(application, '/settings', { headers: { cookie } })
  const html = await page.text()
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
})

test('flash survives redirects and error responses and appears once on the next page', async () => {
  const cookie = await signedIn()
  await postForm('/settings/change-name', { name: 'Changed' }, { cookie })
  // Redirecting to the email confirmation page must not consume the flash.
  assert.equal((await postForm('/login', { email: 'owner@example.com' }, { cookie })).status, 303)
  assert.equal((await request(application, '/missing', { headers: { cookie } })).status, 404)
  const home = await request(application, '/', { headers: { cookie } })
  assert.match(await home.text(), /role="status">Name updated\./)
  assert.doesNotMatch(await (await request(application, '/settings', { headers: { cookie } })).text(), /Name updated\./)
  assert.equal((await db.prepare('SELECT name FROM users WHERE email = ?').bind('owner@example.com').first()).name, 'Changed')
})

test('a validation page consumes flash without logging the user out', async () => {
  const cookie = await signedIn()
  await postForm('/settings/change-name', { name: 'Changed' }, { cookie })
  const invalid = await postForm('/settings/change-name', { name: '' }, { cookie })
  assert.equal(invalid.status, 400)
  const html = await invalid.text()
  assert.match(html, /role="status">Name updated\./)
  assert.match(html, /id="name-errors"/)
  const next = await request(application, '/settings', { headers: { cookie } })
  assert.equal(next.status, 200)
  assert.doesNotMatch(await next.text(), /Name updated\./)
})

test('anonymous visitors can list posts but must log in to view details', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Listed title', content: 'Detail content' }, { cookie })
  const path = created.headers.get('location')
  const list = await request(application, '/')
  assert.equal(list.status, 200)
  assert.match(await list.text(), /Listed title/)
  const detail = await request(application, path)
  assert.equal(detail.status, 303)
  assert.equal(detail.headers.get('location'), '/login')
  assert.equal((await request(application, path, { headers: { cookie } })).status, 200)
})

test('user updates increment the version and reject stale records', async () => {
  await signup()
  const [original, readErr] = await usersModel.getByEmail(db, 'reader@example.com')
  assert.equal(readErr, null)
  assert.equal(original.version, 1)
  const [updated, updateErr] = await usersModel.updateUser(db, new usersModel.User({ ...original, name: 'First edit' }))
  assert.equal(updateErr, null)
  assert.equal(updated.version, 2)
  const [stale, conflict] = await usersModel.updateUser(db, new usersModel.User({ ...original, name: 'Stale edit' }))
  assert.equal(stale, null)
  assert.match(conflict.message, /edit conflict/)
  const [current] = await usersModel.getByID(db, original.id)
  assert.equal(current.name, 'First edit')
  assert.equal(current.version, 2)
  const [next, nextErr] = await usersModel.updateUser(db, new usersModel.User({ ...current, name: 'Next edit' }))
  assert.equal(nextErr, null)
  assert.equal(next.version, 3)
})

test('concurrent post updates cannot both overwrite the same version', async () => {
  await signup()
  const { id } = await db.prepare('SELECT id FROM users').first()
  const [post, insertErr] = await postsModel.insert(db, { title: 'Original', content: 'Text' }, id)
  assert.equal(insertErr, null)
  assert.equal(post.version, 1)
  const [read] = await postsModel.getByID(db, post.id)
  const [latest] = await postsModel.getLatest(db)
  assert.equal(read.version, 1)
  assert.equal(latest[0].version, 1)
  const attempts = await Promise.all([
    postsModel.update(db, post, { title: 'First edit', content: 'First text' }),
    postsModel.update(db, post, { title: 'Second edit', content: 'Second text' }),
  ])
  const successes = attempts.filter(([, err]) => err === null)
  const failures = attempts.filter(([, err]) => err !== null)
  assert.equal(successes.length, 1)
  assert.equal(failures.length, 1)
  assert.match(failures[0][1].message, /edit conflict/)
  const [current] = await postsModel.getByID(db, post.id)
  assert.deepEqual(current, successes[0][0])
  assert.equal(current.version, 2)
  const [next, nextErr] = await postsModel.update(db, current, { title: 'Next edit', content: 'Next text' })
  assert.equal(nextErr, null)
  assert.equal(next.version, 3)
})

test('settings and post handlers return 409 if another writer changes their record', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Text' }, { cookie })
  const postPath = created.headers.get('location')
  const user = await db.prepare('SELECT id FROM users').first()
  const post = await db.prepare('SELECT id FROM posts').first()
  for (const [path, input, table, id, field] of [
    ['/settings/change-name', { name: 'My edit' }, 'users', user.id, 'name'],
    [`${postPath}/edit`, { title: 'My edit', content: 'My text' }, 'posts', post.id, 'title'],
  ]) {
    let concurrentWrites = 0
    const bindings = { MY_DB: {
      prepare(sql) {
        const statement = db.prepare(sql)
        return { bind(...params) {
          const bound = statement.bind(...params)
          if (!sql.includes(`UPDATE ${table} SET`)) return bound
          return { async first() {
            concurrentWrites++
            await db.prepare(`UPDATE ${table} SET ${field} = ?, version = version + 1 WHERE id = ?`)
              .bind('Concurrent edit', id).run()
            return bound.first()
          } }
        } }
      },
    } }
    const response = await postForm(path, input, { cookie }, bindings)
    assert.equal(response.status, 409)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(await response.text(), /Edit Conflict/)
    assert.equal(concurrentWrites, 1)
    const row = await db.prepare(`SELECT ${field}, version FROM ${table} WHERE id = ?`).bind(id).first()
    assert.equal(row[field], 'Concurrent edit')
    assert.equal(row.version, 2)
  }
})

test('listing remains public while view and create permissions are enforced', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Text' }, { cookie })
  const path = created.headers.get('location')
  for (const [code, target] of [
    ['posts:list', '/'],
    ['posts:view', path],
    ['posts:create', '/posts/create'],
  ]) {
    await db.prepare(`DELETE FROM role_permissions
      WHERE role_code = 'public'
        AND permission_id = (SELECT id FROM permissions WHERE code = ?)`).bind(code).run()
    try {
      assert.equal((await request(application, target, { headers: { cookie } })).status, code === 'posts:list' ? 200 : 403, code)
      if (code === 'posts:create') {
        assert.equal((await postForm(target, { title: 'Denied', content: 'Denied' }, { cookie })).status, 403)
        assert.equal((await db.prepare('SELECT COUNT(*) FROM posts').first('COUNT(*)')), 1)
      }
      assert.equal((await request(application, '/settings', { headers: { cookie } })).status, 200)
    } finally {
      await db.prepare(`INSERT INTO role_permissions (role_code, permission_id)
        SELECT roles.code, permissions.id FROM roles CROSS JOIN permissions
        WHERE roles.code = 'public' AND permissions.code = ?`).bind(code).run()
    }
    assert.equal((await request(application, target, { headers: { cookie } })).status, 200, code)
  }
})

test('post creation requires login and assigns ownership from the session', async () => {
  assert.equal((await request(application, '/posts/create')).headers.get('location'), '/login')
  const anonymous = await postForm('/posts/create', { title: 'Title', content: 'Text' })
  assert.equal(anonymous.status, 303)
  assert.equal(anonymous.headers.get('location'), '/login')
  assert.equal((await db.prepare('SELECT COUNT(*) FROM posts').first('COUNT(*)')), 0)

  const cookie = await signedIn()
  const owner = await db.prepare('SELECT id FROM users WHERE email = ?').bind('owner@example.com').first()
  const response = await postForm('/posts/create', { title: 'Title', content: 'Text', userId: '999', user_id: '999' }, { cookie })
  assert.equal(response.status, 303)
  const post = await db.prepare('SELECT * FROM posts').first()
  assert.equal(post.user_id, owner.id)
  assert.equal(response.headers.get('location'), `/posts/${post.id}`)
  const page = await request(application, `/posts/${post.id}`, { headers: { cookie } })
  assert.match(await page.text(), new RegExp(`href="/posts/${post.id}/edit"`))
})

test('owners can edit posts and see all validation errors without losing submitted values', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Original text' }, { cookie })
  const path = created.headers.get('location')
  const form = await request(application, `${path}/edit`, { headers: { cookie } })
  assert.equal(form.status, 200)
  const html = await form.text()
  assert.match(html, /value="Original"/)
  assert.match(html, /Original text/)
  assert.ok(html.includes(`action="${path}/edit"`))
  const invalid = await postForm(`${path}/edit`, { title: '', content: '' }, { cookie })
  assert.equal(invalid.status, 400)
  const errors = await invalid.text()
  assert.match(errors, /id="title-errors"/)
  assert.match(errors, /id="content-errors"/)
  assert.ok(errors.includes(`action="${path}/edit"`))
  const kept = await postForm(`${path}/edit`, { title: '', content: '<script>Keep me</script>' }, { cookie })
  const keptHtml = await kept.text()
  assert.match(keptHtml, /&lt;script&gt;Keep me&lt;\/script&gt;/)
  assert.doesNotMatch(keptHtml, /<script>Keep me<\/script>/)
  assert.equal((await db.prepare('SELECT title FROM posts').first()).title, 'Original')

  const saved = await postForm(`${path}/edit`, { title: 'Updated', content: 'Updated text', user_id: '999' }, { cookie })
  assert.equal(saved.status, 303)
  assert.equal(saved.headers.get('location'), path)
  const post = await db.prepare('SELECT * FROM posts').first()
  assert.equal(post.title, 'Updated')
  assert.equal(post.content, 'Updated text')
  assert.equal(post.user_id, (await db.prepare('SELECT id FROM users').first()).id)
  const page = await request(application, path, { headers: { cookie } })
  assert.equal(page.status, 200)
  const pageHtml = await page.text()
  assert.match(pageHtml, /Updated text/)
  assert.ok(pageHtml.includes(`${path}/edit`))
})

test('other users and anonymous visitors cannot edit a post', async () => {
  const ownerCookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Original text' }, { cookie: ownerCookie })
  const path = created.headers.get('location')
  const otherCookie = await signedIn('other@example.com')
  for (const cookie of [undefined, otherCookie]) {
    const headers = cookie ? { cookie } : {}
    const edit = await request(application, `${path}/edit`, { headers })
    assert.equal(edit.status, cookie ? 404 : 303)
    const save = await postForm(`${path}/edit`, { title: 'Stolen', content: 'Stolen' }, headers)
    assert.equal(save.status, cookie ? 404 : 303)
    const page = await request(application, path, { headers })
    assert.equal(page.status, cookie ? 200 : 303)
    assert.ok(!(await page.text()).includes(`${path}/edit`))
  }
  assert.equal((await db.prepare('SELECT title FROM posts').first()).title, 'Original')
  for (const id of ['999999', 'bad', '0']) {
    const response = await request(application, `/posts/${id}/edit`, { headers: { cookie: ownerCookie } })
    assert.equal(response.status, id === '999999' ? 404 : 400)
  }
})

test('cross-origin requests cannot create or edit posts', async () => {
  const cookie = await signedIn()
  const created = await postForm('/posts/create', { title: 'Original', content: 'Original text' }, { cookie })
  const path = created.headers.get('location')
  for (const target of ['/posts/create', `${path}/edit`]) {
    const response = await postForm(target, { title: 'Changed', content: 'Changed' }, { cookie, origin: 'https://evil.example' })
    assert.equal(response.status, 403)
  }
  const posts = await db.prepare('SELECT * FROM posts').all()
  assert.equal(posts.results.length, 1)
  assert.equal(posts.results[0].title, 'Original')
})

test('navigation follows the session across pages, validation errors, and logout', async () => {
  const { token } = await signup()
  const cookie = cookieOf(await postForm('/login/confirm', { token }))
  let writes = 0
  const readOnlyKV = {
    get: (...args) => kv.get(...args),
    put: (...args) => { writes++; return kv.put(...args) },
    delete: (...args) => { writes++; return kv.delete(...args) },
  }
  for (const path of ['/', '/posts/create', '/login', '/signup', '/login/check-email']) {
    const response = await request(application, path, { headers: { cookie } }, { SESSION_KV: readOnlyKV })
    const html = await response.text()
    assert.match(html, /<form action="\/logout" method="post">/)
    assert.doesNotMatch(html, /href="\/login">Log in<\/a>/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(response.headers.getSetCookie(), [])
  }
  const invalid = await postForm('/posts/create', { title: '', content: '' }, { cookie }, { SESSION_KV: readOnlyKV })
  assert.equal(invalid.status, 400)
  assert.match(await invalid.text(), /<form action="\/logout" method="post">/)
  assert.equal(writes, 0)

  const anonymous = await request(application, '/')
  assert.match(await anonymous.text(), /href="\/login">Log in<\/a>/)

  const logout = await postForm('/logout', {}, { cookie })
  assert.equal(logout.status, 303)
  assert.equal(logout.headers.get('location'), '/')
  assert.ok(logout.headers.getSetCookie().some(value => value.startsWith('sid=') && value.includes('Max-Age=0')))
  const afterLogout = await request(application, '/', { headers: { cookie } })
  const html = await afterLogout.text()
  assert.match(html, /href="\/login">Log in<\/a>/)
  assert.doesNotMatch(html, /action="\/logout"/)
})

test('the login and create-account pages render and validate fields inline', async () => {
  const loginPage = await request(application, '/login')
  assert.equal(loginPage.status, 200)
  assert.match(await loginPage.text(), /action="\/login"/)
  const invalidLogin = await postForm('/login', { email: 'not an email' })
  assert.equal(invalidLogin.status, 400)
  assert.match(await invalidLogin.text(), /id="email-errors"/)
  const invalidSignup = await postForm('/signup', { name: ' ', email: 'reader@example.com' })
  assert.equal(invalidSignup.status, 400)
  const html = await invalidSignup.text()
  assert.match(html, /id="name-errors"/)
  assert.match(html, /reader@example.com/)
  assert.equal(sentEmails.length, 0)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM users').first('COUNT(*)')), 0)
})

test('an unknown login email redirects to signup with a one-time flash and prefilled email field', async () => {
  const response = await postForm('/login', { email: ' New@Example.com ' })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/signup?email=new%40example.com')
  const cookie = cookieOf(response)
  const page = await request(application, response.headers.get('location'), { headers: { cookie } })
  const html = await page.text()
  assert.match(html, /No account found with that email address\. Please create an account below\./)
  assert.match(html, /name="email"[^>]*value="new@example.com"/)
  assert.match(html, /href="\/login">Log in/)
  const next = await request(application, '/signup', { headers: { cookie } })
  assert.doesNotMatch(await next.text(), /No account found with that email address/)
  const queryPage = await request(application, '/signup?email=new%40example.com')
  assert.match(await queryPage.text(), /name="email"[^>]*value="new@example.com"/)
  assert.equal(sentEmails.length, 0)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM users').first('COUNT(*)')), 0)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 0)
  const { keys } = await kv.list()
  assert.equal(keys.length, 1)
  assert.deepEqual(await kv.get(keys[0].name, 'json'), {})
})

test('signup emails a 15-minute hashed login token without authenticating the user', async () => {
  const { url, token } = await signup(' Reader@Example.com ', ' Reader ')
  const user = await db.prepare('SELECT * FROM users').first()
  assert.equal(user.email, 'reader@example.com')
  assert.equal(user.name, 'Reader')
  assert.equal(sentEmails[0].to, user.email)
  assert.equal(sentEmails[0].from.email, 'login@calmitchell.tech')
  assert.match(sentEmails[0].html, /<a href="https:\/\/example.com\/login\/confirm\?token=/)
  assert.equal(url.origin, 'https://example.com')
  assert.match(token, /^[a-f0-9]{64}$/)
  const stored = await db.prepare('SELECT * FROM tokens').first()
  assert.equal(stored.hash, createHash('sha256').update(token).digest('hex'))
  assert.ok(!JSON.stringify(stored).includes(token))
  assert.ok(stored.expires_at > Date.now() + 14 * 60 * 1000)
  assert.ok(stored.expires_at <= Date.now() + 15 * 60 * 1000)
  assert.equal((await kv.list()).keys.length, 0)
  const checkEmail = await request(application, '/login/check-email')
  assert.equal(checkEmail.status, 200)
  assert.match(await checkEmail.text(), /Check your email/)
})

test('the configured login token lifetime controls expiry and both email formats', async () => {
  const before = Date.now()
  const response = await postForm('/signup', { name: 'Reader', email: 'reader@example.com' }, {}, {
    LOGIN_TOKEN_LIFETIME_SECONDS: 300,
  })
  const after = Date.now()
  assert.equal(response.status, 303)
  const stored = await db.prepare('SELECT expires_at FROM tokens').first()
  assert.ok(stored.expires_at >= before + 300_000)
  assert.ok(stored.expires_at <= after + 300_000)
  assert.match(sentEmails[0].html, /expires in 5 minutes/)
  assert.match(sentEmails[0].text, /expires in 5 minutes/)
})

test('tokens support multiple scopes and cannot be consumed or removed through another scope', async () => {
  const { token: loginToken } = await signup()
  const [requestingUser] = await usersModel.getByEmail(db, 'reader@example.com')
  const { id, auth_version } = requestingUser
  const [token, createErr] = await tokensModel.create(db, requestingUser, 600, 'password-reset')
  assert.equal(createErr, null)
  assert.equal(token.user_id, id)
  assert.equal(token.scope, 'password-reset')
  assert.equal(token.hash, createHash('sha256').update(token.token).digest('hex'))
  const stored = await db.prepare('SELECT * FROM tokens WHERE hash = ?').bind(token.hash).first()
  assert.deepEqual(stored, { hash: token.hash, user_id: id, auth_version, expires_at: token.expires_at, scope: 'password-reset' })
  const [user, userErr] = await usersModel.getForToken(db, 'password-reset', token.token)
  assert.equal(userErr, null)
  assert.equal(user.id, id)
  const [wrongScope, scopeErr] = await tokensModel.consume(db, 'authentication', token.token)
  assert.equal(wrongScope, null)
  assert.match(scopeErr.message, /no matching record/)
  assert.equal(await tokensModel.remove(db, 'authentication', token.token), null)
  const [userId, consumeErr] = await tokensModel.consume(db, 'password-reset', token.token)
  assert.equal(consumeErr, null)
  assert.equal(userId, id)
  const [reused, reuseErr] = await tokensModel.consume(db, 'password-reset', token.token)
  assert.equal(reused, null)
  assert.match(reuseErr.message, /no matching record/)
  const [loginUser, loginErr] = await usersModel.getForToken(db, 'authentication', loginToken)
  assert.equal(loginErr, null)
  assert.equal(loginUser.id, id)
  assert.equal(await tokensModel.remove(db, 'authentication', loginToken), null)
  assert.equal(await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)'), 0)
})

test('getForToken returns a full user and rejects wrong-scope, consumed, and expired tokens', async () => {
  const { token } = await signup()
  const [expected] = await usersModel.getByEmail(db, 'reader@example.com')
  const [user, err] = await usersModel.getForToken(db, 'authentication', token)
  assert.equal(err, null)
  assert.deepEqual(user, expected)
  assert.equal(user.isAnonymous(), false)
  assert.equal(Object.hasOwn(user, 'hash'), false)
  assert.equal(await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)'), 1)
  const [wrongScope, scopeErr] = await usersModel.getForToken(db, 'password-reset', token)
  assert.equal(wrongScope, null)
  assert.match(scopeErr.message, /no matching record/)
  assert.equal((await postForm('/login/confirm', { token })).status, 303)
  const [consumed, consumeErr] = await usersModel.getForToken(db, 'authentication', token)
  assert.equal(consumed, null)
  assert.match(consumeErr.message, /no matching record/)
  const { token: expiredToken } = await signup()
  await db.prepare('UPDATE tokens SET expires_at = ?').bind(Date.now() - 1).run()
  const [expired, expiryErr] = await usersModel.getForToken(db, 'authentication', expiredToken)
  assert.equal(expired, null)
  assert.match(expiryErr.message, /no matching record/)
})

test('GET and HEAD of an emailed link only render a POST form and never consume the token', async () => {
  const { url, token } = await signup()
  for (const method of ['GET', 'HEAD', 'GET']) {
    const response = await request(application, url.pathname + url.search, { method })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    assert.match(response.headers.get('set-cookie'), /sid=/)
    if (method === 'GET') {
      const html = await response.text()
      assert.match(html, /id="login-confirm" action="\/login\/confirm" method="post"/)
      assert.ok(html.includes(`name="token" value="${token}"`))
      assert.match(html, /src="\/login-confirm.js" defer/)
    }
    assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 1)
    assert.equal((await kv.list()).keys.length, 0)
  }
})

test('only a valid POST consumes the token and creates an authenticated KV session', async () => {
  const { token } = await signup()
  const response = await postForm('/login/confirm', { token })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/')
  assert.match(response.headers.get('set-cookie'), /; Secure(?:;|$)/)
  const user = await db.prepare('SELECT id FROM users').first()
  const { keys } = await kv.list()
  assert.equal(keys.length, 1)
  assert.deepEqual(await kv.get(keys[0].name, 'json'), { userId: user.id })
  assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 0)
  const replay = await postForm('/login/confirm', { token }, { cookie: cookieOf(response) })
  assert.equal(replay.status, 400)
  assert.deepEqual(replay.headers.getSetCookie(), [])
  assert.deepEqual(await kv.get(keys[0].name, 'json'), { userId: user.id })
  const logout = await postForm('/logout', {}, { cookie: cookieOf(response) })
  assert.equal(logout.status, 303)
  assert.equal((await kv.list()).keys.length, 0)
})

test('concurrent POSTs can use a login token only once', async () => {
  const { token } = await signup()
  const responses = await Promise.all([postForm('/login/confirm', { token }), postForm('/login/confirm', { token })])
  assert.deepEqual(responses.map(r => r.status).sort(), [303, 400])
  const rejectedCookie = cookieOf(responses.find(r => r.status === 400))
  const anonymous = await request(application, '/', { headers: { cookie: rejectedCookie } })
  assert.doesNotMatch(await anonymous.text(), /Log out/)
  assert.equal((await kv.list()).keys.length, 1)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 0)
})

test('expired and malformed tokens cannot create a session', async () => {
  const { url, token } = await signup()
  await db.prepare('UPDATE tokens SET expires_at = ?').bind(Date.now() - 1).run()
  assert.equal((await request(application, url.pathname + url.search)).status, 400)
  assert.equal((await postForm('/login/confirm', { token })).status, 400)
  assert.equal((await postForm('/login/confirm', { token: 'invalid' })).status, 400)
  assert.equal((await postForm('/login/confirm', {})).status, 400)
  assert.equal((await kv.list()).keys.length, 0)
})

test('cross-origin POSTs cannot send email, consume tokens, or log users out', async () => {
  assert.equal((await postForm('/signup', { name: 'Reader', email: 'reader@example.com' }, { origin: 'https://evil.example' })).status, 403)
  assert.equal(sentEmails.length, 0)
  const { token } = await signup()
  assert.equal((await postForm('/login/confirm', { token }, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 1)
  const response = await postForm('/login/confirm', { token })
  assert.equal((await postForm('/logout', {}, { origin: 'https://evil.example', cookie: cookieOf(response) })).status, 403)
  assert.equal((await kv.list()).keys.length, 1)
})

test('same-origin browser navigation can log in when no-referrer makes the Origin header null', async () => {
  const { token } = await signup()
  const response = await postForm('/login/confirm', { token }, { origin: 'null', 'sec-fetch-site': 'same-origin' })
  assert.equal(response.status, 303)
  assert.equal((await kv.list()).keys.length, 1)
})

test('email failure removes the newly generated token', async () => {
  const response = await postForm('/signup', { name: 'Reader', email: 'reader@example.com' }, {}, {
    EMAIL: { async send() { throw new Error('Email delivery unavailable') } },
  })
  assert.equal(response.status, 500)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 0)
  assert.equal((await kv.list()).keys.length, 0)
})

test('login requests for existing accounts send email, and repeated signup preserves their name', async () => {
  await signup()
  assert.equal((await postForm('/login', { email: 'reader@example.com' })).status, 303)
  assert.equal(sentEmails.length, 2)
  assert.equal((await postForm('/signup', { name: 'Changed', email: 'reader@example.com' })).status, 303)
  assert.equal((await db.prepare('SELECT name FROM users').first()).name, 'Reader')
  assert.equal((await db.prepare('SELECT COUNT(*) FROM users').first('COUNT(*)')), 1)
})

test('oversized auth forms are rejected after rate limiting but before session or database access', async () => {
  const cookie = await signedIn()
  const body = new URLSearchParams({ name: 'x'.repeat(4096), email: 'reader@example.com' }).toString()
  let rateLimitCalls = 0
  const bindings = {
    RATE_LIMIT: { async limit() { rateLimitCalls++; return { success: true } } },
    SESSION_KV: {
      get() { throw new Error('Oversized requests must not read sessions') },
      put() { throw new Error('Oversized requests must not write sessions') },
      delete() { throw new Error('Oversized requests must not delete sessions') },
    },
    MY_DB: { prepare() { throw new Error('Oversized requests must not query the database') } },
  }
  for (const contentLength of [undefined, String(Buffer.byteLength(body))]) {
    const headers = { cookie, origin: 'https://example.com', 'content-type': 'application/x-www-form-urlencoded' }
    if (contentLength !== undefined) headers['content-length'] = contentLength
    const response = await request(application, '/signup', { method: 'POST', headers, body }, bindings)
    assert.equal(response.status, 400)
    assert.match(await response.text(), /The submitted form is too large/)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  assert.equal(rateLimitCalls, 2)
  const limited = await request(application, '/signup', {
    method: 'POST', headers: { cookie, origin: 'https://example.com', 'content-length': String(Buffer.byteLength(body)) }, body,
  }, { ...bindings, RATE_LIMIT: { async limit() { return { success: false } } } })
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('set-cookie'), null)
})

test('the shared IP limiter counts requests across pages and rejects before reading sessions', async () => {
  const counts = new Map()
  const bindings = {
    RATE_LIMIT: { async limit({ key }) {
      const count = (counts.get(key) ?? 0) + 1
      counts.set(key, count)
      return { success: count <= 2 }
    } },
    SESSION_KV: { get() { throw new Error('A rejected request must not read sessions') } },
  }
  const headers = { 'cf-connecting-ip': '192.0.2.1' }
  assert.equal((await request(application, '/login', { headers }, bindings)).status, 200)
  assert.equal((await request(application, '/signup', { headers }, bindings)).status, 200)
  const rejected = await request(application, '/', { headers: { ...headers, cookie: 'sid=test' } }, bindings)
  assert.equal(rejected.status, 429)
  assert.equal(rejected.headers.get('retry-after'), '10')
  assert.equal(rejected.headers.get('cache-control'), 'no-store')
  assert.match(await rejected.text(), /Please try again shortly/)
  assert.equal(counts.get('ip:192.0.2.1'), 3)
  const other = await request(application, '/login', { headers: { 'cf-connecting-ip': '192.0.2.2' } }, bindings)
  assert.equal(other.status, 200)
})

test('rate-limited email addresses do not issue tokens or send email', async () => {
  const response = await postForm('/signup', { name: 'Reader', email: 'reader@example.com' }, {}, {
    LOGIN_RATE_LIMIT: { async limit() { return { success: false } } },
  })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
  assert.equal(sentEmails.length, 0)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM users').first('COUNT(*)')), 0)
})

test('an existing session is cleared before login creates a fresh session ID', async () => {
  const first = await signup('first@example.com', 'First')
  const firstLogin = await postForm('/login/confirm', { token: first.token })
  const firstCookie = cookieOf(firstLogin)
  const firstKey = (await kv.list()).keys[0].name
  const second = await signup('second@example.com', 'Second')
  const clear = await postForm('/login/confirm', { token: second.token }, { cookie: firstCookie })
  assert.equal(clear.status, 303)
  assert.equal(clear.headers.get('location'), `/login/confirm?token=${second.token}`)
  assert.match(clear.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await kv.list()).keys.length, 0)
  assert.equal((await db.prepare('SELECT COUNT(*) FROM tokens').first('COUNT(*)')), 1)
  const secondLogin = await postForm('/login/confirm', { token: second.token })
  assert.equal(secondLogin.status, 303)
  const newKey = (await kv.list()).keys[0].name
  assert.notEqual(newKey, firstKey)
  const secondUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind('second@example.com').first()
  assert.deepEqual(await kv.get(newKey, 'json'), { userId: secondUser.id })
})

test('request logging does not include tokens or email query parameters', async () => {
  const { url, token } = await signup()
  const lines = []
  const originalLog = console.log
  console.log = message => lines.push(String(message))
  try {
    assert.equal((await request(application, url.pathname + url.search)).status, 200)
    assert.equal((await request(application, '/signup?email=private%40example.com')).status, 200)
  } finally {
    console.log = originalLog
  }
  assert.ok(lines.some(line => line.includes('/login/confirm')))
  assert.ok(lines.every(line => !line.includes(token) && !line.includes('private%40example.com')))
})

test('404 pages show a Home button without account navigation', async () => {
  const cookie = await signedIn()
  for (const headers of [{}, { cookie }]) {
    for (const path of headers.cookie ? ['/missing', '/posts/999999'] : ['/missing']) {
      const response = await request(application, path, { headers })
      assert.equal(response.status, 404)
      const html = await response.text()
      assert.match(html, /404 - Not Found/)
      assert.doesNotMatch(html, /<nav|action="\/logout"|href="\/login"|href="\/signup"/)
      assert.match(html, /<form action="\/" method="get"><button type="submit">Home<\/button>/)
      assert.doesNotMatch(html, /Go back|<script/)
      assert.deepEqual(response.headers.getSetCookie(), [])
    }
  }
})

const emailChangeURL = () => {
  const url = new URL(sentEmails.at(-1).text.match(/https:\/\/[^\s]+/)[0])
  if (url.searchParams.has('newToken')) {
    const currentURL = new URL(sentEmails.at(-2).text.match(/https:\/\/[^\s]+/)[0])
    url.searchParams.set('token', currentURL.searchParams.get('token'))
  }
  return url
}
const confirmEmail = (url, cookie, email = 'new@example.com') => postForm('/settings/email/confirm', {
  token: url.searchParams.get('token') ?? '', newToken: url.searchParams.get('newToken') ?? '', email,
}, { cookie })

test('settings has separate name and email forms and validates email before sending a code', async () => {
  const cookie = await signedIn()
  await signedIn('taken@example.com')
  const page = await request(application, '/settings', { headers: { cookie } })
  const html = await page.text()
  assert.match(html, /<form action="\/settings\/change-name" method="post">/)
  assert.match(html, /<form action="\/settings\/change-email" method="post">/)
  assert.match(html, /id="new-email" name="email"/)
  const emailCount = sentEmails.length
  for (const email of ['', 'invalid', 'owner@example.com', 'TAKEN@EXAMPLE.COM']) {
    const response = await postForm('/settings/change-email', { email }, { cookie })
    assert.equal(response.status, 400)
    const invalidHTML = await response.text()
    assert.match(invalidHTML, /id="new-email-errors"/)
    assert.match(invalidHTML, /name="name"[^>]*value="Reader"/)
  }
  assert.equal(sentEmails.length, emailCount)
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 0)
})

test('changing email sends separate codes to both addresses and redirects to a prefilled form', async () => {
  const cookie = await signedIn()
  const response = await postForm('/settings/change-email', { email: ' NEW@EXAMPLE.COM ' }, { cookie })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/settings/email/confirm?email=new%40example.com')
  assert.equal(sentEmails.at(-2).to, 'owner@example.com')
  assert.equal(sentEmails.at(-1).to, 'new@example.com')
  const url = emailChangeURL()
  assert.equal(url.searchParams.get('email'), 'new@example.com')
  const token = url.searchParams.get('token')
  assert.match(sentEmails.at(-2).html, new RegExp(`<code>${token}</code>`))
  assert.doesNotMatch(sentEmails.at(-1).text, new RegExp(token))
  assert.doesNotMatch(sentEmails.at(-2).text, new RegExp(url.searchParams.get('newToken')))
  assert.match(sentEmails.at(-2).text, new RegExp(`Your code: ${token}`))
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
  const pending = await db.prepare("SELECT * FROM tokens WHERE scope = 'email-change'").first()
  assert.deepEqual(Object.keys(pending).sort(), ['auth_version', 'expires_at', 'hash', 'scope', 'user_id'])
  assert.equal(pending.hash, createHash('sha256').update(JSON.stringify(['new@example.com', token, url.searchParams.get('newToken')])).digest('hex'))
  const blank = await request(application, response.headers.get('location'), { headers: { cookie } })
  const blankHTML = await blank.text()
  assert.equal(blank.status, 200)
  assert.match(blankHTML, /We sent a code to each email address/)
  assert.match(blankHTML, /name="email"[^>]*value="new@example.com"/)
  assert.match(blankHTML, /Fill out the form below to change your email address from owner@example.com to new@example.com\./)
  assert.match(blankHTML, /<label for="email-token">Code sent to owner@example.com<\/label>/)
  assert.match(blankHTML, /<label for="new-email-token">Code sent to new@example.com<\/label>/)
  assert.doesNotMatch(blankHTML, /type="email"/)
  assert.equal([...blankHTML.matchAll(/<input\b(?![^>]*type="hidden")/g)].length, 2)
  assert.match(blankHTML, /name="token"[^>]*value=""/)
  for (const method of ['GET', 'HEAD']) {
    const preview = await request(application, url.pathname + url.search, { method, headers: { cookie } })
    assert.equal(preview.status, 200)
    if (method === 'GET') {
      const html = await preview.text()
      assert.match(html, /action="\/settings\/email\/confirm" method="post"/)
      assert.match(html, new RegExp(`value="${token}"`))
      assert.doesNotMatch(html, /<script/)
    }
    assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 1)
  }
})

test('submitting a valid email-change token updates the address and flashes once', async () => {
  const cookie = await signedIn()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const url = emailChangeURL()
  await postForm('/login', { email: 'owner@example.com' })
  const response = await confirmEmail(url, cookie, ' NEW@EXAMPLE.COM ')
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/settings')
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'new@example.com')
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 0)
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'authentication'").first('n'), 1)
  const page = await request(application, '/settings', { headers: { cookie } })
  const html = await page.text()
  assert.match(html, /Email address updated\./)
  assert.match(html, /Current email address: new@example.com/)
  assert.doesNotMatch(await (await request(application, '/settings', { headers: { cookie } })).text(), /Email address updated\./)
  const replay = await confirmEmail(url, cookie, 'another@example.com')
  assert.equal(replay.status, 400)
  assert.match(await replay.text(), /invalid, expired, or already used/)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'new@example.com')
})

test('email changes invalidate outstanding tokens while name changes preserve them and sessions stay authenticated', async () => {
  const cookie = await signedIn()
  await postForm('/login', { email: 'owner@example.com' })
  const oldLogin = emailChangeURL()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const change = emailChangeURL()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const spareChange = emailChangeURL()

  assert.equal((await postForm('/settings/change-name', { name: 'Updated name' }, { cookie })).status, 303)
  const [before, beforeErr] = await usersModel.getForToken(db, 'authentication', oldLogin.searchParams.get('token'))
  assert.equal(beforeErr, null)
  assert.equal(before.auth_version, 1)
  assert.equal((await confirmEmail(change, cookie)).status, 303)
  const [after] = await usersModel.getByID(db, before.id)
  assert.equal(after.auth_version, 2)
  assert.equal(after.name, 'Updated name')
  assert.equal((await request(application, '/settings', { headers: { cookie } })).status, 200)

  for (const [scope, url] of [['authentication', oldLogin], ['email-change', spareChange]]) {
    const token = scope === 'email-change'
      ? tokensModel.emailChangeToken(url.searchParams.get('email'), url.searchParams.get('token'), url.searchParams.get('newToken'))
      : url.searchParams.get('token')
    const [user, lookupErr] = await usersModel.getForToken(db, scope, token)
    assert.equal(user, null)
    assert.match(lookupErr.message, /no matching record/)
    const [id, consumeErr] = await tokensModel.consume(db, scope, token)
    assert.equal(id, null)
    assert.match(consumeErr.message, /no matching record/)
  }
  assert.equal((await request(application, oldLogin.pathname + oldLogin.search)).status, 400)
  assert.equal((await postForm('/login/confirm', { token: oldLogin.searchParams.get('token') })).status, 400)
  assert.equal((await confirmEmail(spareChange, cookie, 'taken@example.com')).status, 400)

  await postForm('/login', { email: 'new@example.com' })
  assert.equal(sentEmails.at(-1).to, 'new@example.com')
  const freshLogin = emailChangeURL()
  assert.equal((await postForm('/login/confirm', { token: freshLogin.searchParams.get('token') })).headers.get('location'), '/')
  await postForm('/settings/change-email', { email: 'next@example.com' }, { cookie })
  assert.equal((await confirmEmail(emailChangeURL(), cookie, 'next@example.com')).status, 303)
  const [next] = await usersModel.getByID(db, before.id)
  assert.equal(next.auth_version, 3)
})

test('tokens issued from an old user snapshot after an email change are already invalid', async () => {
  const cookie = await signedIn()
  const [snapshot] = await usersModel.getByEmail(db, 'owner@example.com')
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  assert.equal((await confirmEmail(emailChangeURL(), cookie)).status, 303)

  for (const scope of ['authentication', 'email-change']) {
    const [created, createErr] = await tokensModel.create(db, snapshot, 900, scope)
    assert.equal(createErr, null)
    assert.equal(created.auth_version, snapshot.auth_version)
    const [user, lookupErr] = await usersModel.getForToken(db, scope, created.token)
    assert.equal(user, null)
    assert.match(lookupErr.message, /no matching record/)
    const [id, consumeErr] = await tokensModel.consume(db, scope, created.token)
    assert.equal(id, null)
    assert.match(consumeErr.message, /no matching record/)
  }
})

test('email changes require authentication and reject cross-origin requests and rate-limited email', async () => {
  assert.equal((await postForm('/settings/change-email', {})).headers.get('location'), '/login')
  assert.equal((await request(application, '/settings/email/confirm')).headers.get('location'), '/login')
  assert.equal((await postForm('/settings/email/confirm', {})).headers.get('location'), '/login')
  const cookie = await signedIn()
  const emailCount = sentEmails.length
  assert.equal((await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie, origin: 'https://evil.example' })).status, 403)
  const limited = await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie }, {
    LOGIN_RATE_LIMIT: { async limit({ key }) { assert.equal(key, 'email:owner@example.com'); return { success: false } } },
  })
  assert.equal(limited.status, 429)
  assert.equal(sentEmails.length, emailCount)
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 0)
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const url = emailChangeURL()
  const rejected = await postForm('/settings/email/confirm', {
    token: url.searchParams.get('token'), email: 'new@example.com',
  }, { cookie, origin: 'https://evil.example' })
  assert.equal(rejected.status, 403)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
})

test('email-change forms validate the new address and token without consuming a valid token', async () => {
  const cookie = await signedIn()
  await signedIn('taken@example.com')
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const url = emailChangeURL()
  for (const email of ['', 'invalid', 'owner@example.com', 'TAKEN@EXAMPLE.COM']) {
    const response = await confirmEmail(url, cookie, email)
    assert.equal(response.status, 400)
    assert.match(await response.text(), /id="new-email-errors"/)
  }
  for (const token of ['', 'invalid', '0'.repeat(64), url.searchParams.get('token') + 'x']) {
    const response = await postForm('/settings/email/confirm', { email: 'new@example.com', token, newToken: url.searchParams.get('newToken') }, { cookie })
    assert.equal(response.status, 400)
    const html = await response.text()
    assert.match(html, /id="email-token-errors"|These codes are invalid/)
    assert.match(html, /value="new@example.com"/)
  }
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 1)
  assert.equal((await confirmEmail(url, cookie)).status, 303)
})

test('email-change tokens belong to the requesting user and each request has its own token', async () => {
  const cookie = await signedIn()
  const otherCookie = await signedIn('other@example.com')
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const oldURL = emailChangeURL()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const url = emailChangeURL()
  assert.equal((await confirmEmail(url, otherCookie)).status, 400)
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 2)
  assert.equal((await confirmEmail(oldURL, cookie)).status, 303)
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 1)
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').bind('new@example.com').first('n'), 1)
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').bind('other@example.com').first('n'), 1)
})

test('email changes require both matching codes and bind them to the requested new address', async () => {
  const cookie = await signedIn()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const first = emailChangeURL()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const second = emailChangeURL()
  const token = first.searchParams.get('token')
  const newToken = first.searchParams.get('newToken')
  for (const form of [
    { email: 'new@example.com', token },
    { email: 'new@example.com', newToken },
    { email: 'new@example.com', token, newToken: token },
    { email: 'new@example.com', token: newToken, newToken: token },
    { email: 'new@example.com', token, newToken: second.searchParams.get('newToken') },
    { email: 'different@example.com', token, newToken },
  ]) {
    assert.equal((await postForm('/settings/email/confirm', form, { cookie })).status, 400)
    assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 2)
  }
  assert.equal((await confirmEmail(first, cookie)).status, 303)
  assert.equal((await confirmEmail(first, cookie)).status, 400)
})

test('failure sending the second code invalidates the entire email change', async () => {
  const cookie = await signedIn()
  const delivered = []
  const response = await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie }, {
    EMAIL: { async send(message) {
      if (message.to === 'new@example.com') throw new Error('New address unavailable')
      delivered.push(message)
    } },
  })
  assert.equal(response.status, 500)
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0].to, 'owner@example.com')
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 0)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
})

test('expired and wrong-scope tokens cannot change an email address', async () => {
  const cookie = await signedIn()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const expiredURL = emailChangeURL()
  await db.prepare("UPDATE tokens SET expires_at = ? WHERE scope = 'email-change'").bind(Date.now() - 1).run()
  assert.equal((await confirmEmail(expiredURL, cookie)).status, 400)
  await postForm('/login', { email: 'owner@example.com' })
  assert.equal((await confirmEmail(emailChangeURL(), cookie)).status, 400)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
})

test('email delivery failure removes the email-change token and leaves the address unchanged', async () => {
  const cookie = await signedIn()
  const response = await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie }, {
    EMAIL: { async send() { throw new Error('Email unavailable') } },
  })
  assert.equal(response.status, 500)
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 0)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
})

test('concurrent email-change submissions consume the token once', async () => {
  const cookie = await signedIn()
  const original = await db.prepare('SELECT version FROM users').first()
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const url = emailChangeURL()
  const responses = await Promise.all([
    postForm('/settings/email/confirm', { token: url.searchParams.get('token'), newToken: url.searchParams.get('newToken'), email: 'new@example.com' }, {
      cookie, origin: 'null', 'sec-fetch-site': 'same-origin',
    }),
    confirmEmail(url, cookie),
  ])
  assert.deepEqual(responses.map(response => response.status).sort(), [303, 400])
  const updated = await db.prepare('SELECT email, version FROM users').first()
  assert.equal(updated.email, 'new@example.com')
  assert.equal(updated.version, original.version + 1)
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM tokens').first('n'), 0)
})


test('authentication and template rendering share one session read, including when consuming flash', async () => {
  const cookie = await signedIn()
  let reads = 0
  let writes = 0
  const countedKV = {
    get: (...args) => { reads++; return kv.get(...args) },
    put: (...args) => { writes++; return kv.put(...args) },
    delete: (...args) => kv.delete(...args),
  }
  for (const withFlash of [false, true]) {
    if (withFlash) await postForm('/settings/change-name', { name: 'Updated name' }, { cookie })
    reads = 0
    writes = 0
    const response = await request(application, '/settings', { headers: { cookie } }, { SESSION_KV: countedKV })
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.equal(html.includes('Name updated.'), withFlash)
    assert.equal(reads, 1)
    assert.equal(writes, withFlash ? 1 : 0)
  }
  assert.doesNotMatch(await (await request(application, '/settings', { headers: { cookie } })).text(), /Name updated\./)
})


test('cross-origin auth forms are rejected with no-cache headers before session or database reads', async () => {
  const cookie = await signedIn()
  const bindings = {
    SESSION_KV: {
      get() { throw new Error('Rejected requests must not read sessions') },
      put() { throw new Error('Rejected requests must not write sessions') },
      delete() { throw new Error('Rejected requests must not delete sessions') },
    },
    MY_DB: { prepare() { throw new Error('Rejected requests must not query the database') } },
  }
  const response = await postForm('/signup', { name: 'Reader', email: 'reader@example.com' }, {
    cookie, origin: 'https://evil.example',
  }, bindings)
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('set-cookie'), null)
})

test('signup accepts a 100-character name and rejects a 101-character name with an inline error', async () => {
  const page = await request(application, '/signup')
  assert.doesNotMatch(await page.text(), /name="name"[^>]*maxlength=/i)
  const accepted = await postForm('/signup', { name: 'x'.repeat(100), email: 'hundred@example.com' })
  assert.equal(accepted.status, 303)
  assert.equal((await db.prepare('SELECT name FROM users').first()).name.length, 100)
  const rejected = await postForm('/signup', { name: 'x'.repeat(101), email: 'too-long@example.com' })
  assert.equal(rejected.status, 400)
  const html = await rejected.text()
  assert.match(html, /id="name-errors"/)
  assert.match(html, /Use 100 characters or fewer/)
  assert.ok(html.includes(`value="${'x'.repeat(101)}"`))
  assert.equal(sentEmails.length, 1)
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM users').first('n'), 1)
})


test('settings and post forms preserve overlong values, show errors, and do not silently truncate input', async () => {
  const cookie = await signedIn()
  await grantAdmin('owner@example.com')
  const limitName = 'n'.repeat(100)
  const longName = 'n'.repeat(101)
  assert.equal((await postForm('/settings/change-name', { name: limitName }, { cookie })).status, 303)
  const invalidName = await postForm('/settings/change-name', { name: longName }, { cookie })
  assert.equal(invalidName.status, 400)
  const nameHTML = await invalidName.text()
  assert.match(nameHTML, /Use 100 characters or fewer/)
  assert.ok(nameHTML.includes(`value="${longName}"`))
  assert.equal((await db.prepare('SELECT name FROM users').first()).name, limitName)

  const limitTitle = 't'.repeat(100)
  const longTitle = 't'.repeat(101)
  const created = await postForm('/posts/create', { title: limitTitle, content: 'Original content' }, { cookie })
  assert.equal(created.status, 303)
  const postPath = created.headers.get('location')
  for (const path of ['/posts/create', `${postPath}/edit`]) {
    const response = await postForm(path, { title: longTitle, content: 'Keep this content' }, { cookie })
    assert.equal(response.status, 400)
    const html = await response.text()
    assert.match(html, /id="title-errors"/)
    assert.match(html, /Use 100 characters or fewer/)
    assert.ok(html.includes(`value="${longTitle}"`))
    assert.match(html, /Keep this content/)
  }
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM posts').first('n'), 1)
  const post = await db.prepare('SELECT title, content FROM posts').first()
  assert.equal(post.title, limitTitle)
  assert.equal(post.content, 'Original content')

  for (const path of ['/signup', '/login', '/settings', '/settings/email/confirm', '/posts/create', `${postPath}/edit`]) {
    const page = await request(application, path, { headers: { cookie } })
    assert.equal(page.status, 200)
    assert.doesNotMatch(await page.text(), /maxlength=/i)
  }
})

test('every email form rejects an overlong address without sending mail or changing records', async () => {
  const cookie = await signedIn()
  await grantAdmin('owner@example.com')
  await postForm('/settings/change-email', { email: 'new@example.com' }, { cookie })
  const url = emailChangeURL()
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`
  assert.equal(email.length, 255)
  const emailCount = sentEmails.length
  const cases = [
    ['/login', { email }, 'email-errors'],
    ['/signup', { name: 'Reader', email }, 'email-errors'],
    ['/settings/change-admins', { email }, 'admin-email-errors'],
    ['/settings/change-email', { email }, 'new-email-errors'],
    ['/settings/email/confirm', { email, token: url.searchParams.get('token') }, 'new-email-errors'],
  ]
  for (const [path, form, errorID] of cases) {
    const response = await postForm(path, form, { cookie })
    assert.equal(response.status, 400, path)
    const html = await response.text()
    assert.ok(html.includes(`id="${errorID}"`), path)
    assert.match(html, /Use 254 characters or fewer/)
    assert.ok(html.includes(`value="${email}"`), path)
  }
  assert.equal(sentEmails.length, emailCount)
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM users').first('n'), 1)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, 'owner@example.com')
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE scope = 'email-change'").first('n'), 1)
  const limitEmail = email.slice(0, -1)
  assert.equal(limitEmail.length, 254)
  assert.equal((await postForm('/settings/change-email', { email: limitEmail }, { cookie })).status, 303)
  assert.equal((await confirmEmail(emailChangeURL(), cookie, limitEmail)).status, 303)
  assert.equal((await db.prepare('SELECT email FROM users').first()).email, limitEmail)
})
