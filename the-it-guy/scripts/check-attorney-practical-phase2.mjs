#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase2Decision } from '../src/services/attorneyPracticalPropagationPhase2.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const contractPath = resolve(projectRoot, option('--contract') || 'config/attorney-practical-release-bar.json')
const phase1ReportPath = resolve(projectRoot, option('--phase1-report') || 'output/attorney-release/practical-phase1-report.json')
const phase1EvidencePath = resolve(projectRoot, option('--phase1-evidence') || 'output/attorney-release/practical-phase1-evidence.json')
const evidencePath = resolve(projectRoot, option('--evidence') || 'output/attorney-release/practical-phase2-evidence.json')
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/practical-phase2-report.json')
const contractBytes = readFileSync(contractPath)
const contract = JSON.parse(contractBytes)
const phase1Evidence = readJson(phase1EvidencePath)
const evidence = readJson(evidencePath)
const decision = buildAttorneyPracticalPhase2Decision({
  contract,
  contractFingerprint: createHash('sha256').update(contractBytes).digest('hex'),
  phase1Report: readJson(phase1ReportPath),
  phase1Evidence,
  phase1EvidenceFingerprint: hash(phase1Evidence),
  evidence,
  evidenceFingerprint: hash(evidence) || null,
})
const reportCore = {
  phase: 2,
  ...decision,
  summary: {
    propagationSources: decision.sourceCount,
    destinations: contract.destinations?.length || 0,
    visibilityClasses: Object.keys(contract.visibility || {}).length,
    maximumObservationSeconds: contract.soak?.maximumPropagationP95Seconds,
    stagingOnly: true,
    productionMutated: false,
  },
}
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (decision.status !== 'PASSED') process.exitCode = 1
