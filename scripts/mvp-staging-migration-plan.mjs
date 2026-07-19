import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedMvpVersions = ['202607180046', '202607190001']

function parseOptions(argv) {
  const options = { json: false, ledger: '' }
  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg.startsWith('--ledger=')) options.ledger = arg.slice('--ledger='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function getLocalMigrations() {
  const directory = path.join(repoRoot, 'supabase/migrations')
  return readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => ({ file, version: file.match(/^(\d{12,14})_/)?.[1] || '' }))
    .sort((left, right) => left.file.localeCompare(right.file))
}

function duplicateVersions(migrations) {
  const grouped = new Map()
  for (const migration of migrations) {
    if (!migration.version) continue
    grouped.set(migration.version, [...(grouped.get(migration.version) || []), migration.file])
  }
  return [...grouped.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }))
}

function readLedger(ledgerPath) {
  if (!ledgerPath) return null
  const absolutePath = path.resolve(repoRoot, ledgerPath)
  if (!existsSync(absolutePath)) throw new Error(`Ledger evidence file not found: ${ledgerPath}`)
  const data = JSON.parse(readFileSync(absolutePath, 'utf8'))
  if (!Array.isArray(data.appliedVersions)) throw new Error('Ledger evidence must contain an appliedVersions array.')
  return { path: ledgerPath, projectRef: String(data.projectRef || ''), appliedVersions: data.appliedVersions.map(String) }
}

const options = parseOptions(process.argv.slice(2))
const migrations = getLocalMigrations()
const duplicates = duplicateVersions(migrations)
const localVersions = new Set(migrations.map((migration) => migration.version))
const missingMvpMigrations = expectedMvpVersions.filter((version) => !localVersions.has(version))
const orderedMvpMigrations = expectedMvpVersions.every((version, index) => index === 0 || expectedMvpVersions[index - 1] < version)
const ledger = readLedger(options.ledger)
const ledgerMissingMvpVersions = ledger ? expectedMvpVersions.filter((version) => !ledger.appliedVersions.includes(version)) : expectedMvpVersions
const blockers = []

if (duplicates.length) blockers.push('duplicate_local_migration_versions')
if (missingMvpMigrations.length) blockers.push('mvp_migration_missing_from_release')
if (!orderedMvpMigrations) blockers.push('mvp_migrations_not_ordered')
if (!ledger) blockers.push('staging_ledger_evidence_required')

const report = {
  version: 'arch9_mvp_staging_migration_plan_v1',
  decision: blockers.length ? 'no_go' : 'ready_for_human_approved_staging_apply',
  blockers,
  expectedMvpVersions,
  localMvpMigrations: migrations.filter((migration) => expectedMvpVersions.includes(migration.version)),
  missingMvpMigrations,
  duplicateVersions: duplicates,
  ledger: ledger
    ? {
        path: ledger.path,
        projectRefPresent: Boolean(ledger.projectRef),
        missingMvpVersions: ledgerMissingMvpVersions,
      }
    : null,
  nextCommands: [
    'supabase link --project-ref <staging-project-ref>',
    'supabase migration list --linked',
    'supabase db push --linked',
    'SUPABASE_URL=<staging-url> SUPABASE_ANON_KEY=<staging-anon-key> node the-it-guy/scripts/mvp-deployment-contract-check.mjs',
  ],
  safety: 'This script never links, applies, repairs, or changes a Supabase database.',
}

if (options.json) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`Decision: ${report.decision}`)
  console.log(`Blockers: ${blockers.length ? blockers.join(', ') : 'none'}`)
  console.log(`MVP migration order: ${expectedMvpVersions.join(' -> ')}`)
  if (duplicates.length) console.log(`Duplicate local migration versions: ${duplicates.map((item) => item.version).join(', ')}`)
  if (!ledger) console.log('Staging ledger evidence: required (export the reviewed migration list into a local JSON evidence file).')
  console.log(report.safety)
}

if (report.decision !== 'ready_for_human_approved_staging_apply') process.exit(1)
