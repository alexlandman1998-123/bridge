#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyPracticalPhase0Decision } from '../src/services/attorneyPracticalReleasePhase0.js'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const contractPath = resolve(projectRoot, option('--contract') || 'config/attorney-practical-release-bar.json')
const approvalPath = resolve(projectRoot, option('--approval') || 'output/attorney-release/practical-phase0-approval.json')
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/practical-phase0-report.json')
const contractBytes = readFileSync(contractPath); const contract = JSON.parse(contractBytes)
const contractFingerprint = createHash('sha256').update(contractBytes).digest('hex')
const approval = existsSync(approvalPath) ? JSON.parse(readFileSync(approvalPath, 'utf8')) : null
const decision = buildAttorneyPracticalPhase0Decision({ contract, contractFingerprint, approval })
const reportCore = { phase: 0, ...decision, acceptance: { roles: Object.keys(contract.roles || {}).length, roleActions: Object.values(contract.roles || {}).reduce((sum, actions) => sum + actions.length, 0), viewports: contract.viewports?.length || 0, destinations: contract.destinations?.length || 0, soak: contract.soak, productionMutated: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'ACCEPTED') process.exitCode = 1
