#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyReleasePhase9Decision } from '../src/services/attorneyReleasePhase9.js'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const readJson = (path) => { if (!existsSync(path)) return null; try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const validate = (artifact, field, path, immutable = false) => { if (!artifact?.[field]) return false; const { [field]: fingerprint, immutable: marker, ...core } = artifact; const digest = createHash('sha256').update(JSON.stringify(core)).digest('hex'); const readOnly = !immutable || ((statSync(path).mode & 0o222) === 0 && marker === true); return digest === fingerprint && readOnly }
const receiptPath = resolve(projectRoot, option('--phase8-receipt') || 'output/attorney-release/phase8-execution-receipt.json')
const observationPath = resolve(projectRoot, option('--observation') || 'output/attorney-release/phase9-production-observation.json')
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/phase9-assurance.json')
const executionReceipt = readJson(receiptPath); const observation = readJson(observationPath)
const receiptIntegrityPassed = validate(executionReceipt, 'receiptFingerprint', receiptPath, true)
const evidenceIntegrityPassed = validate(observation, 'evidenceFingerprint', observationPath)
const decision = buildAttorneyReleasePhase9Decision({ executionReceipt, receiptIntegrityPassed, observation, evidenceIntegrityPassed })
const reportCore = { phase: 9, ...decision, evidence: { executionReceiptLoaded: Boolean(executionReceipt), receiptIntegrityPassed, observationLoaded: Boolean(observation), evidenceIntegrityPassed, mutatedProduction: false, rollbackPerformed: false } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
if (args.has('--emit-receipt')) {
  if (decision.status !== 'VERIFIED') throw new Error('A Phase 9 receipt can only be emitted for a verified canary.')
  const receiptPath = resolve(projectRoot, option('--receipt') || `output/attorney-release/phase9-verified-${decision.deploymentId}.json`)
  if (existsSync(receiptPath)) throw new Error('The immutable Phase 9 receipt already exists.')
  writeFileSync(receiptPath, `${JSON.stringify({ ...report, immutable: true }, null, 2)}\n`, { mode: 0o400, flag: 'wx' })
}
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (decision.status !== 'VERIFIED') process.exitCode = 1
