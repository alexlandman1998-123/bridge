#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase6Decision } from '../src/services/attorneyPracticalReleaseCandidatePhase6.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const hash = (value) => value ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : ''
const pathFor = (optionName, fallback) => resolve(root, option(optionName) || fallback)
const contractPath = pathFor('--contract', 'config/attorney-practical-release-bar.json')
const phase0Report = readJson(pathFor('--phase0-report', 'output/attorney-release/practical-phase0-report.json'))
const phase0Approval = readJson(pathFor('--phase0-approval', 'output/attorney-release/practical-phase0-approval.json'))
const phase5Report = readJson(pathFor('--phase5-report', 'output/attorney-release/practical-phase5-report.json'))
const phase5Evidence = readJson(pathFor('--phase5-evidence', 'output/attorney-release/practical-phase5-evidence.json'))
const candidate = readJson(pathFor('--candidate', 'output/attorney-release/practical-phase6-candidate.json'))
const approval = readJson(pathFor('--approval', 'output/attorney-release/practical-phase6-approval.json'))
const reportPath = pathFor('--report', 'output/attorney-release/practical-phase6-report.json')
const contractBytes = readFileSync(contractPath); const contract = JSON.parse(contractBytes)
const decision = buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint: createHash('sha256').update(contractBytes).digest('hex'), phase0Report, phase0Approval, phase5Report, phase5Evidence, phase5EvidenceFingerprint: hash(phase5Evidence), candidate, candidateFingerprint: hash(candidate), approval })
const reportCore = { phase: 6, ...decision, summary: { releaseMode: 'controlled', maximumPilotOrganisations: 3, maximumRollbackMinutes: 15, monitoredDestinations: contract.destinations?.length || 0, productionMutated: false, deployed: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'APPROVED') process.exitCode = 1
