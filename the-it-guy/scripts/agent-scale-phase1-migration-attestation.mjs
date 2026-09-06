import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const expectedMigration = '20260906065759'
const databaseUrl = String(process.env.SUPABASE_STAGING_DB_URL || '').trim()
if (!databaseUrl) throw new Error('SUPABASE_STAGING_DB_URL is required for the read-only migration attestation.')

const run = spawnSync('supabase', [
  'migration', 'list',
  '--db-url', databaseUrl,
  '--workdir', '../supabase',
  '--output-format', 'json',
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
if (run.status !== 0) throw new Error(`Unable to read staging migration history: ${String(run.stderr || '').trim()}`)

const payload = JSON.parse(run.stdout)
const remoteVersions = (payload.migrations || []).map((migration) => String(migration.remote || '')).filter(Boolean)
const latestRemoteMigration = remoteVersions.at(-1) || null
const expectedApplied = remoteVersions.includes(expectedMigration)
const laterMigrationsApplied = remoteVersions.filter((version) => version > expectedMigration)
const report = {
  contract: 'arch9-agent-scale-phase1-migration-attestation-v1',
  capturedAt: new Date().toISOString(),
  expectedMigration,
  expectedApplied,
  latestRemoteMigration,
  laterMigrationCount: laterMigrationsApplied.length,
  status: expectedApplied ? 'PASS' : 'HOLD',
  blocker: expectedApplied ? null : `Required RLS migration ${expectedMigration} is not recorded in staging migration history.`,
}

const outputDirectory = path.resolve(process.env.AGENT_PHASE1_OUTPUT_DIR || 'test-results/agent-scale-phase1')
await mkdir(outputDirectory, { recursive: true })
await writeFile(path.join(outputDirectory, 'migration-attestation.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (process.argv.includes('--require-applied') && !expectedApplied) process.exitCode = 1
