import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessRentalReleaseEvidenceClearance } from '../src/services/rentals/rentalReleaseEvidenceClearance.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))
  ?.slice('--evidence='.length)
  || 'config/rentals-staging-recovery-evidence.json'
const absolutePath = path.resolve(appRoot, evidencePath)
if (!fs.existsSync(absolutePath)) throw new Error(`Evidence file does not exist: ${evidencePath}`)

const report = {
  checkedAt: new Date().toISOString(),
  evidencePath,
  ...assessRentalReleaseEvidenceClearance(JSON.parse(fs.readFileSync(absolutePath, 'utf8'))),
}
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
