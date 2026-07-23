import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const migrationsDirectory = join(repositoryRoot, 'supabase', 'migrations')

function fail(message) {
  console.error(`Migration-ledger verification failed: ${message}`)
  process.exitCode = 1
}

function localVersions() {
  const files = readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()

  return new Map(files.map((file) => [file.slice(0, file.indexOf('_')), file]))
}

function remoteVersions() {
  const result = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--linked', 'select version from supabase_migrations.schema_migrations order by version;'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )

  if (result.status !== 0) {
    fail(result.stderr.trim() || result.stdout.trim() || 'Supabase CLI query failed.')
    return new Set()
  }

  const jsonStart = result.stdout.indexOf('{')
  if (jsonStart < 0) {
    fail('Supabase CLI did not return a structured migration ledger.')
    return new Set()
  }

  const rows = JSON.parse(result.stdout.slice(jsonStart)).rows || []
  return new Set(rows.map((row) => String(row.version)))
}

const local = localVersions()
const remote = remoteVersions()
const localOnly = [...local.keys()].filter((version) => !remote.has(version))
const remoteOnly = [...remote].filter((version) => !local.has(version))
const legacyTimestampCollisions = [...local.keys()].filter((version) =>
  version.length === 12 && [...local.keys()].some((candidate) => candidate.length === 14 && candidate.startsWith(version)),
)

console.log(JSON.stringify({
  localVersionCount: local.size,
  remoteVersionCount: remote.size,
  localOnly,
  remoteOnly,
  legacyTimestampCollisions,
}, null, 2))

if (localOnly.length || remoteOnly.length) {
  fail('The active local migration directory does not exactly match the remote ledger.')
}
