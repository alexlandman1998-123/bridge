import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from '../src/services/rentals/rentalFoundationMigrationPlan.js'
import { assessRentalFoundationSourceLock } from '../src/services/rentals/rentalFoundationSourceLock.js'
import { assessRentalFoundationSqlSafetyReview } from '../src/services/rentals/rentalFoundationSqlSafetyReview.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))
  ?.slice('--evidence='.length)
  || 'config/rentals-staging-recovery-evidence.json'
const resolveSource = (source) => [path.resolve(appRoot, source), path.resolve(appRoot, '..', source)]
  .find((candidate) => fs.existsSync(candidate))
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
const absoluteEvidencePath = path.resolve(appRoot, evidencePath)
if (!fs.existsSync(absoluteEvidencePath)) throw new Error(`Evidence file does not exist: ${evidencePath}`)

const sourceEntries = RENTAL_FOUNDATION_MIGRATION_SOURCES.map((source) => {
  const absolutePath = resolveSource(source)
  if (!absolutePath) throw new Error(`Required source does not exist: ${source}`)
  return { path: source, sha256: digest(fs.readFileSync(absolutePath)) }
})
const sourceLock = assessRentalFoundationSourceLock({
  evidence: JSON.parse(fs.readFileSync(absoluteEvidencePath, 'utf8')),
  sourceEntries,
  chainSha256: digest(sourceEntries.map(({ path: source, sha256 }) => `${source}\n${sha256}\n`).join('')),
})
const sources = RENTAL_FOUNDATION_MIGRATION_SOURCES.slice(0, -1).map((source) => {
  const absolutePath = resolveSource(source)
  return { path: source, sql: fs.readFileSync(absolutePath, 'utf8') }
})
const report = { checkedAt: new Date().toISOString(), evidencePath, ...assessRentalFoundationSqlSafetyReview({ sourceLock, sources }) }

console.log(JSON.stringify(report, null, 2))
if (!report.authoringAllowed) process.exitCode = 2
