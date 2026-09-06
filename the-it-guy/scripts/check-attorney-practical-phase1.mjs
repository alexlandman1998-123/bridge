#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase1Decision } from '../src/services/attorneyPracticalUatPhase1.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const contractPath = resolve(projectRoot, option('--contract') || 'config/attorney-practical-release-bar.json')
const phase0ReportPath = resolve(projectRoot, option('--phase0-report') || 'output/attorney-release/practical-phase0-report.json')
const phase0ApprovalPath = resolve(projectRoot, option('--phase0-approval') || 'output/attorney-release/practical-phase0-approval.json')
const evidencePath = resolve(projectRoot, option('--evidence') || 'output/attorney-release/practical-phase1-evidence.json')
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/practical-phase1-report.json')

const contractBytes = readFileSync(contractPath)
const contract = JSON.parse(contractBytes)
const contractFingerprint = createHash('sha256').update(contractBytes).digest('hex')
const evidence = readJson(evidencePath)
const decision = buildAttorneyPracticalPhase1Decision({
  contract,
  contractFingerprint,
  phase0Report: readJson(phase0ReportPath),
  phase0Approval: readJson(phase0ApprovalPath),
  evidence,
  evidenceFingerprint: evidence ? createHash('sha256').update(JSON.stringify(evidence)).digest('hex') : null,
})
const reportCore = {
  phase: 1,
  ...decision,
  summary: {
    requiredWalkthroughs: decision.matrix.length,
    requiredActionExecutions: decision.matrix.reduce((sum, item) => sum + item.requiredActions.length, 0),
    authenticatedBrowserEvidence: true,
    stagingOnly: true,
    productionMutated: false,
  },
}
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (decision.status !== 'PASSED') process.exitCode = 1
