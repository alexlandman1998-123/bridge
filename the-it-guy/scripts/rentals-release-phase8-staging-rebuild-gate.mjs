import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from '../src/services/rentals/rentalFoundationMigrationPlan.js'
import { assessRentalReleaseEvidenceClearance } from '../src/services/rentals/rentalReleaseEvidenceClearance.js'
import { assessRentalReleaseSourceBaselineLock } from '../src/services/rentals/rentalReleaseSourceBaselineLock.js'
import { assessRentalSecurityDefinerExceptionReview } from '../src/services/rentals/rentalSecurityDefinerExceptionReview.js'
import { assessRentalStagingRebuildGate } from '../src/services/rentals/rentalStagingRebuildGate.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(appRoot, '..')
const resolveSource = (source) => [path.resolve(appRoot, source), path.resolve(repoRoot, source)].find((candidate) => fs.existsSync(candidate))
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(appRoot, relativePath), 'utf8'))
const evidence = readJson('config/rentals-staging-recovery-evidence.json')
const exceptions = readJson('config/rentals-security-definer-exceptions.json').exceptions
const approval = readJson('config/rentals-release-source-lock-approval.json')
const sourceEntries = RENTAL_FOUNDATION_MIGRATION_SOURCES.map((source) => ({ path: source, sha256: digest(fs.readFileSync(resolveSource(source))) }))
const chainSha256 = digest(sourceEntries.map(({ path: source, sha256 }) => `${source}\n${sha256}\n`).join(''))
const securitySources = [...new Set(exceptions.map((exception) => exception.source))].map((source) => ({ path: source, sql: fs.readFileSync(resolveSource(source), 'utf8') }))
const sourceBaseline = assessRentalReleaseSourceBaselineLock({ evidenceClearance: assessRentalReleaseEvidenceClearance(evidence), securityReview: assessRentalSecurityDefinerExceptionReview({ exceptions, sources: securitySources }), sourceEntries, chainSha256, approval })
const report = {
  checkedAt: new Date().toISOString(),
  ...assessRentalStagingRebuildGate({ sourceBaseline, localReceipt: readJson('config/rentals-release-local-verification-receipt.json'), target: readJson('config/rentals-release-staging-rebuild-target.json'), evidence }),
}
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
