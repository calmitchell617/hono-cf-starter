import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { z } from 'zod'

const args = process.argv.slice(2)
const emails = args.filter(arg => arg !== '--local' && arg !== '--remote')
const email = z.string().trim().toLowerCase().email().max(254).safeParse(emails[0])
if (emails.length !== 1 || !email.success || (args.includes('--local') && args.includes('--remote'))) {
  console.error('Usage: npm run promote-admin -- user@example.com [--local|--remote]')
  process.exit(1)
}

const escapedEmail = email.data.replaceAll("'", "''")
const sql = `
  INSERT INTO user_roles (user_id, role_id)
  SELECT users.id, roles.id FROM users CROSS JOIN roles
  WHERE users.email = '${escapedEmail}' AND roles.name = 'admin'
  ON CONFLICT (user_id, role_id) DO UPDATE SET role_id = excluded.role_id
  RETURNING user_id
`
const require = createRequire(import.meta.url)
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
const result = spawnSync(process.execPath, [wrangler,
  'd1', 'execute', 'MY_DB', args.includes('--remote') ? '--remote' : '--local', '--command', sql, '--json'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
})
if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? (result.stderr || result.stdout))
  process.exit(1)
}
const response = JSON.parse(result.stdout)
if (!response[0]?.results?.length) {
  console.error('No account found with that email address. Create the account first.')
  process.exit(1)
}
console.log(`Promoted ${email.data} to admin (${args.includes('--remote') ? 'remote' : 'local'} database).`)
