#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildAttorneyCoordinationPhase7Decision } from '../src/services/attorneyCoordinationControlledRolloutPhase7.js'

const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const pathFor = (name, fallback) => resolve(option(name) || fallback)
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const fingerprint = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const paths = {
  phase6Report: pathFor('--phase6-report', 'output/attorney-coordination/phase6-report.json'),
  phase6Evidence: pathFor('--phase6-evidence', 'output/attorney-coordination/phase6-evidence.json'),
  request: pathFor('--request', 'output/attorney-coordination/phase7-request.json'),
  receipt: pathFor('--receipt', 'output/attorney-coordination/phase7-receipt.json'),
  report: pathFor('--report', 'output/attorney-coordination/phase7-report.json'),
}
const phase6Report = readJson(paths.phase6Report)
const phase6Evidence = readJson(paths.phase6Evidence)
const request = readJson(paths.request)
const receipt = readJson(paths.receipt)
const requestFingerprint = fingerprint(request)
const receiptFingerprint = fingerprint(receipt)
const decision = buildAttorneyCoordinationPhase7Decision({
  phase6Report,
  phase6ReportFingerprint: fingerprint(phase6Report && Object.fromEntries(Object.entries(phase6Report).filter(([key]) => key !== 'reportFingerprint'))),
  phase6Evidence,
  phase6EvidenceFingerprint: fingerprint(phase6Evidence),
  request,
  requestFingerprint,
  receipt,
  receiptFingerprint,
})
const reportCore = { phase: 7, mode: 'validation_only', generatedAt: new Date().toISOString(), deploymentPerformed: false, featureFlagChanged: false, requestFingerprint: requestFingerprint || null, receiptFingerprint: receiptFingerprint || null, ...decision }
const report = { ...reportCore, reportFingerprint: fingerprint(reportCore) }
mkdirSync(dirname(paths.report), { recursive: true })
writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath: paths.report }, null, 2))
if (decision.status !== 'PILOT_ACTIVE') process.exitCode = 1
