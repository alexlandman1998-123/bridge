import { spawnSync } from 'node:child_process'
import { evaluateMvpPilotGoNoGo } from '../src/core/transactions/mvpPilotGoNoGo.js'

function runJson(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  let report = null
  try { report = JSON.parse(result.stdout) } catch { report = null }
  return { passed: result.status === 0, report, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
}

const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))?.slice('--evidence='.length) || ''
const release = runJson('scripts/mvp-release-certification.mjs')
const pilotSession = runJson('scripts/mvp-pilot-session-check.mjs')
const batchDryRun = runJson('scripts/mvp-pilot-batch-dry-run.mjs')
const exposure = evidencePath
  ? runJson('scripts/mvp-exposure-readiness.mjs', [`--evidence=${evidencePath}`])
  : { passed: false, report: null, output: 'No staging evidence path supplied.' }

const report = evaluateMvpPilotGoNoGo({
  releaseCertification: { passed: release.passed },
  pilotSession: pilotSession.report || {},
  batchDryRun: batchDryRun.report?.report || {},
  exposureReadiness: exposure.report || {},
  evidencePath,
})

console.log(JSON.stringify({
  ...report,
  checkedAt: new Date().toISOString(),
  evidencePath: evidencePath || null,
  checks: {
    releaseCertificationPassed: release.passed,
    pilotSessionDecision: pilotSession.report?.decision || 'unavailable',
    batchDryRunPassed: batchDryRun.report?.passed === true,
    exposureDecision: exposure.report?.decision || 'unavailable',
  },
}, null, 2))

if (report.decision !== 'ready_for_controlled_exposure') process.exit(1)
