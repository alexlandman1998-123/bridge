#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase10Decision } from '../src/services/attorneyPracticalExpansionCloseoutPhase10.js'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null; const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const pathFor = (name, fallback) => resolve(root, option(name) || fallback)
const contract = readJson(pathFor('--contract', 'config/attorney-practical-release-bar.json')); const phase9Report = readJson(pathFor('--phase9-report', 'output/attorney-release/practical-phase9-report.json')); const phase9Plan = readJson(pathFor('--phase9-plan', 'output/attorney-release/practical-phase9-plan.json')); const phase9Approval = readJson(pathFor('--phase9-approval', 'output/attorney-release/practical-phase9-approval.json')); const ledger = readJson(pathFor('--ledger', 'output/attorney-release/practical-phase10-ledger.json')); const approval = readJson(pathFor('--approval', 'output/attorney-release/practical-phase10-approval.json')); const reportPath = pathFor('--report', 'output/attorney-release/practical-phase10-report.json')
const authorizationFingerprints = Object.fromEntries((ledger?.waves || []).map((wave) => [wave.waveId, hash(wave.authorization)]))
const decision = buildAttorneyPracticalPhase10Decision({ contract, phase9Report, phase9Plan, phase9PlanFingerprint: hash(phase9Plan), phase9Approval, ledger, ledgerFingerprint: hash(ledger), authorizationFingerprints, approval })
const reportCore = { phase: 10, ...decision, summary: { plannedWaves: phase9Plan?.waves?.length || 0, completedWaveMetrics: decision.waveMetrics.length, flagsChangedByChecker: false, cohortChangedByChecker: false, rollbackPerformedByChecker: false, productionMutated: false } }; const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'GENERAL_AVAILABILITY_APPROVED') process.exitCode = 1
