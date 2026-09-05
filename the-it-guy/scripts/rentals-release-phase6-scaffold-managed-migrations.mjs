import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from '../src/services/rentals/rentalFoundationMigrationPlan.js'
import { RENTAL_MANAGED_MIGRATION_SCAFFOLD_CONFIRMATION, assessRentalManagedMigrationScaffolding } from '../src/services/rentals/rentalManagedMigrationScaffolding.js'
import { assessRentalReleaseEvidenceClearance } from '../src/services/rentals/rentalReleaseEvidenceClearance.js'
import { assessRentalReleaseSourceBaselineLock } from '../src/services/rentals/rentalReleaseSourceBaselineLock.js'
import { assessRentalSecurityDefinerExceptionReview } from '../src/services/rentals/rentalSecurityDefinerExceptionReview.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(appRoot, '..')
const createRequested = process.argv.includes('--create')
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length) || ''
const resolveSource = (source) => [path.resolve(appRoot, source), path.resolve(repoRoot, source)].find((candidate) => fs.existsSync(candidate))
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(appRoot, relativePath), 'utf8'))
const evidence = readJson('config/rentals-staging-recovery-evidence.json')
const exceptions = readJson('config/rentals-security-definer-exceptions.json').exceptions
const approval = readJson('config/rentals-release-source-lock-approval.json')
const sourceEntries = RENTAL_FOUNDATION_MIGRATION_SOURCES.map((source) => ({ path: source, sha256: digest(fs.readFileSync(resolveSource(source))) }))
const chainSha256 = digest(sourceEntries.map(({ path: source, sha256 }) => `${source}\n${sha256}\n`).join(''))
const securitySources = [...new Set(exceptions.map((exception) => exception.source))].map((source) => ({ path: source, sql: fs.readFileSync(resolveSource(source), 'utf8') }))
const sourceBaseline = assessRentalReleaseSourceBaselineLock({
  evidenceClearance: assessRentalReleaseEvidenceClearance(evidence),
  securityReview: assessRentalSecurityDefinerExceptionReview({ exceptions, sources: securitySources }),
  sourceEntries,
  chainSha256,
  approval,
})
const migrationDirectory = path.resolve(repoRoot, 'supabase/migrations')
const existingMigrationNames = fs.readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.sql'))
  .flatMap((file) => {
    const match = file.match(/^\d+_(.+)\.sql$/)
    return match ? [match[1]] : []
  })
const report = {
  checkedAt: new Date().toISOString(),
  sourceBaseline,
  ...assessRentalManagedMigrationScaffolding({ sourceBaseline, existingMigrationNames, createRequested, confirmation }),
}

if (createRequested && !report.createAllowed) throw new Error(report.nextAction)
if (report.createAllowed) {
  for (const item of report.items) {
    const result = spawnSync('supabase', ['migration', 'new', '--workdir', repoRoot, item.name], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`Failed to scaffold ${item.name}: ${(result.stderr || result.stdout || '').trim()}`)
  }
  report.created = report.items.map((item) => item.name)
}

console.log(JSON.stringify(report, null, 2))
if (!report.scaffoldReady) process.exitCode = 2
