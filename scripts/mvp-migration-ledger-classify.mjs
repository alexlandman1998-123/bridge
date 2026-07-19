import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerArg = process.argv.find((arg) => arg.startsWith('--ledger='))
const jsonOutput = process.argv.includes('--json')
if (!ledgerArg) throw new Error('Use --ledger=<staging-migration-ledger.json>.')

const ledgerPath = path.resolve(repoRoot, ledgerArg.slice('--ledger='.length))
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
if (!Array.isArray(ledger.appliedVersions)) throw new Error('Ledger evidence must contain appliedVersions.')
const remoteVersions = new Set(ledger.appliedVersions.map(String))
const local = readdirSync(path.join(repoRoot, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => ({ file, version: file.match(/^(\d{12,14})_/)?.[1] || '' }))
  .filter((migration) => migration.version)
  .sort((left, right) => left.file.localeCompare(right.file))

const byVersion = new Map()
for (const migration of local) byVersion.set(migration.version, [...(byVersion.get(migration.version) || []), migration.file])

const localVersions = new Set(byVersion.keys())
const collisions = [...byVersion.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([version, files]) => ({
    version,
    files,
    remoteState: remoteVersions.has(version) ? 'already_applied_remotely' : 'local_only',
    classification: remoteVersions.has(version)
      ? 'timestamp_collision_with_applied_remote_history'
      : 'timestamp_collision_local_only',
    requiredAction: remoteVersions.has(version)
      ? 'Do not rename or rewrite any file at this timestamp. Produce a reviewed forward-only reconciliation plan.'
      : 'Classify each local file against the staging ledger before any migration apply.',
  }))

const localOnly = [...localVersions].filter((version) => !remoteVersions.has(version) && !collisions.some((item) => item.version === version)).sort()
const applied = [...localVersions].filter((version) => remoteVersions.has(version) && !collisions.some((item) => item.version === version)).sort()
const remoteOnly = [...remoteVersions].filter((version) => !localVersions.has(version)).sort()
const report = {
  version: 'arch9_mvp_migration_ledger_classification_v1',
  decision: collisions.length ? 'reconciliation_required' : 'ledger_classified',
  projectRef: ledger.projectRef || null,
  capturedAt: ledger.capturedAt || null,
  classifications: {
    alreadyAppliedRemotely: applied,
    localOnly,
    remoteOnly,
    timestampCollisions: collisions,
  },
  safety: 'This report is read-only. It never renames, deletes, repairs, links, or applies a migration.',
}

if (jsonOutput) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`Decision: ${report.decision}`)
  console.log(`Applied remotely: ${applied.length}`)
  console.log(`Local only: ${localOnly.length}`)
  console.log(`Remote only: ${remoteOnly.length}`)
  console.log(`Timestamp collisions: ${collisions.length}`)
  for (const collision of collisions) console.log(`- ${collision.version}: ${collision.classification}`)
}

if (report.decision !== 'ledger_classified') process.exit(1)
