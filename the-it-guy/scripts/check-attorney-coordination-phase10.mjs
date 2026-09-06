#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildAttorneyCoordinationPhase10Decision } from '../src/services/attorneyCoordinationCloseoutPhase10.js'

const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const pathFor = (name, fallback) => resolve(option(name) || fallback)
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const paths = {
  phase9Report: pathFor('--phase9-report', 'output/attorney-coordination/phase9-report.json'), phase9Plan: pathFor('--phase9-plan', 'output/attorney-coordination/phase9-plan.json'),
  phase9Approval: pathFor('--phase9-approval', 'output/attorney-coordination/phase9-approval.json'), ledger: pathFor('--ledger', 'output/attorney-coordination/phase10-ledger.json'),
  approval: pathFor('--approval', 'output/attorney-coordination/phase10-approval.json'), report: pathFor('--report', 'output/attorney-coordination/phase10-report.json'),
}
const phase9Report = readJson(paths.phase9Report); const phase9Plan = readJson(paths.phase9Plan); const phase9Approval = readJson(paths.phase9Approval); const ledger = readJson(paths.ledger); const approval = readJson(paths.approval)
const authorizationFingerprints = Object.fromEntries((ledger?.waves || []).map((item) => [item.waveId, hash(item.authorization)]))
const decision = buildAttorneyCoordinationPhase10Decision({ phase9Report, phase9Plan, phase9PlanFingerprint: hash(phase9Plan), phase9Approval, ledger, ledgerFingerprint: hash(ledger), authorizationFingerprints, approval })
const reportCore = { phase: 10, mode: 'closeout_validation_only', generatedAt: new Date().toISOString(), productionMutated: false, cohortChanged: false, featureFlagChanged: false, rollbackPerformed: false, ...decision }
const report = { ...reportCore, reportFingerprint: hash(reportCore) }
mkdirSync(dirname(paths.report), { recursive: true }); writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath: paths.report }, null, 2)); if (decision.status !== 'STEADY_STATE_APPROVED') process.exitCode = 1
