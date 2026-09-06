#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase4Decision } from '../src/services/attorneyPracticalRemediationPhase4.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const contractPath = resolve(root, option('--contract') || 'config/attorney-practical-release-bar.json')
const evidencePath = resolve(root, option('--evidence') || 'output/attorney-release/practical-phase4-evidence.json')
const reportPath = resolve(root, option('--report') || 'output/attorney-release/practical-phase4-report.json')
const contractBytes = readFileSync(contractPath)
const contract = JSON.parse(contractBytes)
const predecessors = [1, 2, 3].map((phase) => {
  const phaseEvidence = readJson(resolve(root, option(`--phase${phase}-evidence`) || `output/attorney-release/practical-phase${phase}-evidence.json`))
  return { phase, report: readJson(resolve(root, option(`--phase${phase}-report`) || `output/attorney-release/practical-phase${phase}-report.json`)), evidence: phaseEvidence, fingerprint: hash(phaseEvidence) }
})
const evidence = readJson(evidencePath)
const decision = buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint: createHash('sha256').update(contractBytes).digest('hex'), predecessors, evidence, evidenceFingerprint: hash(evidence) || null })
const reportCore = { phase: 4, ...decision, summary: { discoveredDefects: decision.defectCount, requiredRegressionSuites: 4, requiredMatrixRetests: decision.matrix.length, stagingOnly: true, productionMutated: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (decision.status !== 'PASSED') process.exitCode = 1
