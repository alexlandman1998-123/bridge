import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from '../src/services/rentals/rentalFoundationMigrationPlan.js'
import { RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS } from '../src/services/rentals/rentalManagedMigrationAuthoring.js'
import { RENTAL_LOCAL_MIGRATION_VERIFY_CONFIRMATION, assessRentalLocalMigrationVerification } from '../src/services/rentals/rentalLocalMigrationVerification.js'
import { assessRentalReleaseEvidenceClearance } from '../src/services/rentals/rentalReleaseEvidenceClearance.js'
import { assessRentalReleaseSourceBaselineLock } from '../src/services/rentals/rentalReleaseSourceBaselineLock.js'
import { assessRentalSecurityDefinerExceptionReview } from '../src/services/rentals/rentalSecurityDefinerExceptionReview.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(appRoot, '..')
const verifyRequested = process.argv.includes('--verify')
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
const migrationFiles = fs.readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql'))
const migrationEntries = RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS.flatMap((item) => {
  const migrationFile = migrationFiles.find((file) => new RegExp(`^\\d+_${item.name}\\.sql$`).test(file))
  const sourcePath = resolveSource(item.source)
  return migrationFile ? [{ name: item.name, sourceSha256: digest(fs.readFileSync(sourcePath)), migrationSha256: digest(fs.readFileSync(path.join(migrationDirectory, migrationFile))) }] : []
})
const report = { checkedAt: new Date().toISOString(), ...assessRentalLocalMigrationVerification({ sourceBaseline, migrationEntries, verifyRequested, confirmation }) }

if (verifyRequested && !report.verifyAllowed) throw new Error(report.nextAction)
if (report.verifyAllowed) {
  const commands = [
    ['db', 'reset', '--local', '--no-seed', '--workdir', repoRoot],
    ['migration', 'list', '--local', '--workdir', repoRoot],
    ['db', 'advisors', '--local', '--type', 'security', '--fail-on', 'warn', '--workdir', repoRoot],
  ]
  report.verification = commands.map((args) => {
    const result = spawnSync('supabase', args, { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`Local verification failed for supabase ${args.join(' ')}: ${(result.stderr || result.stdout || '').trim()}`)
    return args.join(' ')
  })
}
console.log(JSON.stringify(report, null, 2))
if (!report.verificationReady) process.exitCode = 2
