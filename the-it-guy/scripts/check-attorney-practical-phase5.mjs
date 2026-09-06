#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase5Decision } from '../src/services/attorneyPracticalSoakPhase5.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const contractPath = resolve(root, option('--contract') || 'config/attorney-practical-release-bar.json')
const phase4ReportPath = resolve(root, option('--phase4-report') || 'output/attorney-release/practical-phase4-report.json')
const phase4EvidencePath = resolve(root, option('--phase4-evidence') || 'output/attorney-release/practical-phase4-evidence.json')
const evidencePath = resolve(root, option('--evidence') || 'output/attorney-release/practical-phase5-evidence.json')
const reportPath = resolve(root, option('--report') || 'output/attorney-release/practical-phase5-report.json')
const contractBytes = readFileSync(contractPath); const contract = JSON.parse(contractBytes)
const phase4Evidence = readJson(phase4EvidencePath); const evidence = readJson(evidencePath)
const decision = buildAttorneyPracticalPhase5Decision({ contract, contractFingerprint: createHash('sha256').update(contractBytes).digest('hex'), phase4Report: readJson(phase4ReportPath), phase4Evidence, phase4EvidenceFingerprint: hash(phase4Evidence), evidence, evidenceFingerprint: hash(evidence) || null })
const reportCore = { phase: 5, ...decision, summary: { minimumHours: contract.soak?.minimumHours, minimumActions: contract.soak?.minimumTotalActions, minimumActionsPerRole: contract.soak?.minimumActionsPerRole, minimumSuccessRate: contract.soak?.minimumSuccessfulActionRate, maximumPropagationP95Seconds: contract.soak?.maximumPropagationP95Seconds, stagingOnly: true, productionMutated: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'STABILIZED') process.exitCode = 1
