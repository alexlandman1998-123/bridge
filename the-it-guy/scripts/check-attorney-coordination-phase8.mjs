#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildAttorneyCoordinationPhase8Decision } from '../src/services/attorneyCoordinationPilotObservationPhase8.js'

const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const pathFor = (name, fallback) => resolve(option(name) || fallback)
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const paths = {
  phase7Report: pathFor('--phase7-report', 'output/attorney-coordination/phase7-report.json'),
  phase7Receipt: pathFor('--phase7-receipt', 'output/attorney-coordination/phase7-receipt.json'),
  evidence: pathFor('--evidence', 'output/attorney-coordination/phase8-evidence.json'),
  report: pathFor('--report', 'output/attorney-coordination/phase8-report.json'),
}
const phase7Report = readJson(paths.phase7Report)
const phase7Receipt = readJson(paths.phase7Receipt)
const evidence = readJson(paths.evidence)
const sourceReceiptFingerprint = hash(phase7Receipt)
const decision = buildAttorneyCoordinationPhase8Decision({ phase7Report, phase7Receipt, phase7ReceiptFingerprint: sourceReceiptFingerprint, evidence, evidenceFingerprint: hash(evidence) })
const reportCore = { phase: 8, mode: 'observation_validation_only', generatedAt: new Date().toISOString(), productionMutated: false, cohortExpanded: false, sourceReceiptFingerprint: sourceReceiptFingerprint || null, ...decision }
const report = { ...reportCore, reportFingerprint: hash(reportCore) }
mkdirSync(dirname(paths.report), { recursive: true })
writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath: paths.report }, null, 2))
if (decision.status !== 'READY_FOR_EXPANSION') process.exitCode = 1
