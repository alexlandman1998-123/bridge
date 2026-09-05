import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assessRentalFoundationMigrationPlan,
  RENTAL_FOUNDATION_MIGRATION_SOURCES,
} from '../src/services/rentals/rentalFoundationMigrationPlan.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))
  ?.slice('--evidence='.length)
  || 'config/rentals-staging-recovery-evidence.json'
const absoluteEvidencePath = path.resolve(appRoot, evidencePath)

if (!fs.existsSync(absoluteEvidencePath)) {
  throw new Error(`Evidence file does not exist: ${evidencePath}`)
}

const sourceFiles = RENTAL_FOUNDATION_MIGRATION_SOURCES.filter((source) => (
  fs.existsSync(path.resolve(appRoot, source))
  || fs.existsSync(path.resolve(appRoot, '..', source))
))
const evidence = JSON.parse(fs.readFileSync(absoluteEvidencePath, 'utf8'))
const report = {
  checkedAt: new Date().toISOString(),
  evidencePath,
  ...assessRentalFoundationMigrationPlan({ evidence, sourceFiles }),
}

console.log(JSON.stringify(report, null, 2))
if (report.status !== 'READY_FOR_MANAGED_MIGRATION_AUTHORING_ONLY') process.exitCode = 2
