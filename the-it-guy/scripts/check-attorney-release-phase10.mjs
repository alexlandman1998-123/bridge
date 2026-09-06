#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyReleasePhase10Decision } from '../src/services/attorneyReleasePhase10.js'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => { if (!existsSync(path)) return null; try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const valid = (artifact, field, path, immutable = false) => { if (!artifact?.[field]) return false; const { [field]: fingerprint, immutable: marker, ...core } = artifact; return createHash('sha256').update(JSON.stringify(core)).digest('hex') === fingerprint && (!immutable || (marker === true && (statSync(path).mode & 0o222) === 0)) }
const receiptPath = resolve(projectRoot, option('--phase9-receipt') || 'output/attorney-release/phase9-verified.json')
const readinessPath = resolve(projectRoot, option('--readiness') || 'output/attorney-release/phase10-readiness.json')
const approvalPath = resolve(projectRoot, option('--approval') || 'output/attorney-release/phase10-approval.json')
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/phase10-expansion-plan.json')
const phase9Receipt = readJson(receiptPath); const readiness = readJson(readinessPath); const approval = readJson(approvalPath)
const decision = buildAttorneyReleasePhase10Decision({ phase9Receipt, receiptIntegrityPassed: valid(phase9Receipt, 'reportFingerprint', receiptPath, true), readiness, readinessIntegrityPassed: valid(readiness, 'readinessFingerprint', readinessPath), approval })
const reportCore = { phase: 10, ...decision, expansion: { mode: readiness?.expansionMode || '', maximumExpansionPercent: numberOrZero(readiness?.maximumExpansionPercent), maximumOrganisationsPerStep: numberOrZero(readiness?.maximumOrganisationsPerStep), automaticExpansion: false }, execution: { productionMutated: false, cohortExpanded: false, deploymentChanged: false, rollbackPerformed: false } }
const report = { ...reportCore, planFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ ...report, reportPath }, null, 2)); if (decision.status !== 'READY_FOR_GRADUAL_EXPANSION') process.exitCode = 1
function numberOrZero(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
