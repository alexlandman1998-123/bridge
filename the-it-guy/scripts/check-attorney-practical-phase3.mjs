#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase3Decision } from '../src/services/attorneyPracticalUiPhase3.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const paths = {
  contract: resolve(root, option('--contract') || 'config/attorney-practical-release-bar.json'),
  phase1Report: resolve(root, option('--phase1-report') || 'output/attorney-release/practical-phase1-report.json'),
  phase1Evidence: resolve(root, option('--phase1-evidence') || 'output/attorney-release/practical-phase1-evidence.json'),
  phase2Report: resolve(root, option('--phase2-report') || 'output/attorney-release/practical-phase2-report.json'),
  phase2Evidence: resolve(root, option('--phase2-evidence') || 'output/attorney-release/practical-phase2-evidence.json'),
  evidence: resolve(root, option('--evidence') || 'output/attorney-release/practical-phase3-evidence.json'),
  report: resolve(root, option('--report') || 'output/attorney-release/practical-phase3-report.json'),
}
const contractBytes = readFileSync(paths.contract)
const contract = JSON.parse(contractBytes)
const phase1Evidence = readJson(paths.phase1Evidence)
const phase2Evidence = readJson(paths.phase2Evidence)
const evidence = readJson(paths.evidence)
const decision = buildAttorneyPracticalPhase3Decision({
  contract,
  contractFingerprint: createHash('sha256').update(contractBytes).digest('hex'),
  phase1Report: readJson(paths.phase1Report),
  phase1Evidence,
  phase1EvidenceFingerprint: hash(phase1Evidence),
  phase2Report: readJson(paths.phase2Report),
  phase2EvidenceFingerprint: hash(phase2Evidence),
  evidence,
  evidenceFingerprint: hash(evidence) || null,
})
const reportCore = { phase: 3, ...decision, summary: { requiredAudits: decision.matrix.length, requiredTouchpointChecks: decision.matrix.reduce((sum, item) => sum + item.requiredActions.length, 0), automatedAccessibilityRequired: true, humanVisualReviewRequired: true, stagingOnly: true, productionMutated: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(paths.report), { recursive: true })
writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath: paths.report }, null, 2))
if (decision.status !== 'PASSED') process.exitCode = 1
