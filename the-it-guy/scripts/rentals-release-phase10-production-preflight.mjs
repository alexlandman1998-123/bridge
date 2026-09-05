import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assessRentalProductionPreflight } from '../src/services/rentals/rentalProductionPreflight.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(appRoot, '..')
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(appRoot, relativePath), 'utf8'))
const rebuildReceipt = readJson('config/rentals-release-staging-rebuild-receipt.json')
const certification = readJson('config/rentals-release-e2e-certification.json')
const sourceApproval = readJson('config/rentals-release-source-lock-approval.json')
const candidate = readJson('config/rentals-release-production-preflight.json')
const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
const workingTreeClean = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim() === ''
const stagingCertification = {
  ready: rebuildReceipt.confirmed === true
    && certification.projectRef === rebuildReceipt.projectRef
    && certification.chainSha256 === rebuildReceipt.chainSha256
    && Array.isArray(certification.scenarios)
    && certification.scenarios.length >= 8
    && certification.scenarios.every((scenario) => scenario?.passed === true),
}
const sourceBaseline = { ready: sourceApproval.approved === true && Boolean(sourceApproval.chainSha256), chainSha256: sourceApproval.chainSha256 || null }
const report = { checkedAt: new Date().toISOString(), headCommit, workingTreeClean, ...assessRentalProductionPreflight({ stagingCertification, sourceBaseline, candidate, headCommit, workingTreeClean }) }
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
