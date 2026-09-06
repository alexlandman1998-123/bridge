#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildAttorneyCoordinationPhase9Decision } from '../src/services/attorneyCoordinationExpansionPhase9.js'

const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const pathFor = (name, fallback) => resolve(option(name) || fallback)
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const paths = {
  phase8Report: pathFor('--phase8-report', 'output/attorney-coordination/phase8-report.json'),
  phase8Evidence: pathFor('--phase8-evidence', 'output/attorney-coordination/phase8-evidence.json'),
  phase7Receipt: pathFor('--phase7-receipt', 'output/attorney-coordination/phase7-receipt.json'),
  plan: pathFor('--plan', 'output/attorney-coordination/phase9-plan.json'),
  approval: pathFor('--approval', 'output/attorney-coordination/phase9-approval.json'),
  report: pathFor('--report', 'output/attorney-coordination/phase9-report.json'),
}
const phase8Report = readJson(paths.phase8Report)
const phase8Evidence = readJson(paths.phase8Evidence)
const phase7Receipt = readJson(paths.phase7Receipt)
const plan = readJson(paths.plan)
const approval = readJson(paths.approval)
const planFingerprint = hash(plan)
const decision = buildAttorneyCoordinationPhase9Decision({ phase8Report, phase8Evidence, phase8EvidenceFingerprint: hash(phase8Evidence), phase7Receipt, plan, planFingerprint, approval })
const reportCore = { phase: 9, mode: 'expansion_plan_validation_only', generatedAt: new Date().toISOString(), productionMutated: false, cohortExpanded: false, featureFlagChanged: false, ...decision }
const report = { ...reportCore, reportFingerprint: hash(reportCore) }
mkdirSync(dirname(paths.report), { recursive: true })
writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath: paths.report }, null, 2))
if (decision.status !== 'APPROVED') process.exitCode = 1
