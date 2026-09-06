#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { buildAttorneyReleasePhase7Decision } from '../src/services/attorneyReleasePhase7.js'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2)); const text = (value) => String(value || '').trim()
const option = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ''
const run = (command, commandArgs) => spawnSync(command, commandArgs, { cwd: projectRoot, env: process.env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
const parseJson = (output) => { const start = output.indexOf('{'); const end = output.lastIndexOf('}'); if (start < 0 || end < start) return null; try { return JSON.parse(output.slice(start, end + 1)) } catch { return null } }
const readJson = (path) => { if (!existsSync(path)) return null; try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const observer = run(process.execPath, ['scripts/observe-attorney-release-phase6-staging.mjs'])
const phase6Process = run(process.execPath, ['scripts/check-attorney-release-phase6-staging.mjs'])
const phase6Report = parseJson(phase6Process.stdout || '')
const skipLocalGates = args.has('--skip-local-gates')
const codeGate = skipLocalGates ? { status: null } : run('npm', ['run', 'test:attorney-release-phase6'])
const buildGate = skipLocalGates ? { status: null } : run('npm', ['run', 'build'])
const fingerprintFiles = ['src/services/attorneyReleaseStabilisation.js', 'src/services/attorneyReleasePhase7.js', 'scripts/observe-attorney-release-phase6-staging.mjs', 'scripts/check-attorney-release-phase6-staging.mjs', 'scripts/check-attorney-release-phase7.mjs']
const releaseHash = createHash('sha256').update(text(phase6Report?.sourceFingerprint)).update('\0')
for (const file of fingerprintFiles) releaseHash.update(file).update('\0').update(readFileSync(resolve(projectRoot, file))).update('\0')
const releaseFingerprint = releaseHash.digest('hex')
const approvalPath = resolve(projectRoot, option('--approval') || process.env.ATTORNEY_RELEASE_PHASE7_APPROVAL_FILE || 'output/attorney-release/phase7-approval.json')
const approval = readJson(approvalPath)
const decision = buildAttorneyReleasePhase7Decision({ releaseFingerprint, phase6Report, observationRefreshPassed: observer.status === 0, codeGatePassed: codeGate.status === 0, buildPassed: buildGate.status === 0, approval })
const reportCore = { phase: 7, ...decision, evidence: { observerPassed: observer.status === 0, phase6Status: phase6Report?.status || 'missing', phase6ArtifactIntegrityPassed: Boolean(phase6Report?.evidence?.artifactIntegrityPassed), livePropagationCheckPassed: Boolean(phase6Report?.evidence?.livePropagationCheckPassed), codeGatePassed: codeGate.status === 0, buildPassed: buildGate.status === 0, localGatesSkipped: skipLocalGates, fingerprintFiles } }
const report = { ...reportCore, reportFingerprint: createHash('sha256').update(JSON.stringify(reportCore)).digest('hex') }
const reportPath = resolve(projectRoot, option('--report') || 'output/attorney-release/phase7-preflight.json')
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
if (args.has('--emit-receipt')) {
  if (decision.status !== 'GO') throw new Error('A Phase 7 release receipt can only be emitted for GO.')
  const receiptPath = resolve(projectRoot, option('--receipt') || `output/attorney-release/phase7-go-${releaseFingerprint.slice(0, 12)}.json`)
  if (existsSync(receiptPath)) throw new Error('The immutable Phase 7 receipt already exists.')
  writeFileSync(receiptPath, `${JSON.stringify({ ...report, immutable: true }, null, 2)}\n`, { mode: 0o400, flag: 'wx' })
}
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (decision.status !== 'GO') process.exitCode = 1
