#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase7Decision } from '../src/services/attorneyPracticalControlledRolloutPhase7.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const pathFor = (name, fallback) => resolve(root, option(name) || fallback)
const contract = readJson(pathFor('--contract', 'config/attorney-practical-release-bar.json'))
const phase6Report = readJson(pathFor('--phase6-report', 'output/attorney-release/practical-phase6-report.json'))
const phase6Candidate = readJson(pathFor('--phase6-candidate', 'output/attorney-release/practical-phase6-candidate.json'))
const phase6Approval = readJson(pathFor('--phase6-approval', 'output/attorney-release/practical-phase6-approval.json'))
const request = readJson(pathFor('--request', 'output/attorney-release/practical-phase7-request.json'))
const receipt = readJson(pathFor('--receipt', 'output/attorney-release/practical-phase7-receipt.json'))
const reportPath = pathFor('--report', 'output/attorney-release/practical-phase7-report.json')
const decision = buildAttorneyPracticalPhase7Decision({ contract, phase6Report, phase6Candidate, phase6CandidateFingerprint: hash(phase6Candidate), phase6Approval, request, requestFingerprint: hash(request), receipt, receiptFingerprint: hash(receipt) || null })
const reportCore = { phase: 7, ...decision, summary: { deploymentPerformedByChecker: false, featureFlagChangedByChecker: false, maximumPilotOrganisations: 3, requiredRoleSmokes: Object.keys(contract?.roles || {}).length, requiredDestinationSmokes: contract?.destinations?.length || 0 } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'PILOT_ACTIVE') process.exitCode = 1
