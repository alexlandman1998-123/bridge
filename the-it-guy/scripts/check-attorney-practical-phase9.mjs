#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase9Decision } from '../src/services/attorneyPracticalExpansionPlanPhase9.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const pathFor = (name, fallback) => resolve(root, option(name) || fallback)
const contract = readJson(pathFor('--contract', 'config/attorney-practical-release-bar.json'))
const phase8Report = readJson(pathFor('--phase8-report', 'output/attorney-release/practical-phase8-report.json'))
const phase8Evidence = readJson(pathFor('--phase8-evidence', 'output/attorney-release/practical-phase8-evidence.json'))
const phase7Receipt = readJson(pathFor('--phase7-receipt', 'output/attorney-release/practical-phase7-receipt.json'))
const plan = readJson(pathFor('--plan', 'output/attorney-release/practical-phase9-plan.json'))
const approval = readJson(pathFor('--approval', 'output/attorney-release/practical-phase9-approval.json'))
const reportPath = pathFor('--report', 'output/attorney-release/practical-phase9-report.json')
const decision = buildAttorneyPracticalPhase9Decision({ contract, phase8Report, phase8Evidence, phase8EvidenceFingerprint: hash(phase8Evidence), phase7Receipt, plan, planFingerprint: hash(plan), approval })
const reportCore = { phase: 9, ...decision, summary: { targetingMode: 'organisation_id_allowlist', maximumWaveGrowthFactor: 2, minimumHoursBetweenWaves: 24, expansionPerformedByChecker: false, featureFlagChangedByChecker: false, productionMutated: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'APPROVED') process.exitCode = 1
