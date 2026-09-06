#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase8Decision } from '../src/services/attorneyPracticalPilotObservationPhase8.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const pathFor = (name, fallback) => resolve(root, option(name) || fallback)
const contract = readJson(pathFor('--contract', 'config/attorney-practical-release-bar.json'))
const phase7Report = readJson(pathFor('--phase7-report', 'output/attorney-release/practical-phase7-report.json'))
const phase7Receipt = readJson(pathFor('--phase7-receipt', 'output/attorney-release/practical-phase7-receipt.json'))
const evidence = readJson(pathFor('--evidence', 'output/attorney-release/practical-phase8-evidence.json'))
const reportPath = pathFor('--report', 'output/attorney-release/practical-phase8-report.json')
const decision = buildAttorneyPracticalPhase8Decision({ contract, phase7Report, phase7Receipt, phase7ReceiptFingerprint: hash(phase7Receipt), evidence, evidenceFingerprint: hash(evidence) || null })
const reportCore = { phase: 8, ...decision, summary: { minimumPilotHours: contract?.soak?.minimumHours, minimumActions: contract?.soak?.minimumTotalActions, maximumPropagationP95Seconds: contract?.soak?.maximumPropagationP95Seconds, browserCheckpoints: Object.keys(contract?.roles || {}).length * (contract?.viewports?.length || 0), observedDestinations: contract?.destinations?.length || 0, cohortExpandedByChecker: false, productionMutated: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'READY_FOR_EXPANSION') process.exitCode = 1
