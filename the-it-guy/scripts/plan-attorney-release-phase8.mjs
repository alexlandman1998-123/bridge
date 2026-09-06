#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyReleasePhase8Decision } from '../src/services/attorneyReleasePhase8.js'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => { if (!existsSync(path)) return null; try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const receiptPath = resolve(projectRoot, option('--phase7-receipt') || 'output/attorney-release/phase7-go.json')
const candidatePath = resolve(projectRoot, option('--candidate') || 'output/attorney-release/phase8-candidate.json')
const approvalPath = resolve(projectRoot, option('--approval') || 'output/attorney-release/phase8-approval.json')
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/phase8-cutover-plan.json')
const phase7Receipt = readJson(receiptPath); const candidate = readJson(candidatePath); const approval = readJson(approvalPath)
let receiptIntegrityPassed = false
if (phase7Receipt?.reportFingerprint) {
  const { reportFingerprint, immutable, ...core } = phase7Receipt
  const readOnly = (statSync(receiptPath).mode & 0o222) === 0
  receiptIntegrityPassed = immutable === true && readOnly && createHash('sha256').update(JSON.stringify(core)).digest('hex') === reportFingerprint
}
const decision = buildAttorneyReleasePhase8Decision({ phase7Receipt, receiptIntegrityPassed, candidate, approval })
const organisationIds = [...new Set((candidate?.organisationIds || []).map((value) => String(value || '').trim()).filter(Boolean))].sort()
const cohortDigest = organisationIds.length ? createHash('sha256').update(organisationIds.join('\n')).digest('hex') : ''
const planCore = { phase: 8, ...decision, candidate: { deploymentId: candidate?.deploymentId || '', deploymentUrl: candidate?.deploymentUrl || '', rollbackDeploymentId: candidate?.rollbackDeploymentId || '', productionProjectRef: candidate?.productionProjectRef || '', cohortSize: organisationIds.length, cohortDigest, monitoringOwner: candidate?.monitoringOwner || '', rollbackOwner: candidate?.rollbackOwner || '' }, execution: { mutatedProduction: false, deploymentPerformed: false, requiredSequence: ['promote_verified_preview', 'enable_approved_canary_cohort', 'run_browser_smoke', 'check_production_propagation', 'observe_errors_and_latency', 'rollback_on_any_stop_condition'] } }
const plan = { ...planCore, planFingerprint: createHash('sha256').update(JSON.stringify(planCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...plan, reportPath }, null, 2))
if (decision.status !== 'READY_FOR_CANARY') process.exitCode = 1
