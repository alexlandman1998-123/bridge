import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { evaluateMvpExposureReadiness } from '../src/core/transactions/mvpExposureReadiness.js'

function run(script) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  return { passed: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
}

const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))?.slice('--evidence='.length)
let stagingEvidence = null
let evidenceError = ''
if (evidencePath) {
  try {
    stagingEvidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
  } catch (error) {
    evidenceError = error?.message || 'staging_evidence_unreadable'
  }
}

const release = run('scripts/mvp-release-certification.mjs')
const pilot = run('scripts/mvp-pilot-session-check.mjs')
const supportRunbook = run('scripts/mvp-pilot-support-runbook.test.mjs')
const report = evaluateMvpExposureReadiness({
  localChecks: {
    releaseCertificationPassed: release.passed,
    pilotSessionPassed: pilot.passed,
    supportRunbookPassed: supportRunbook.passed,
  },
  stagingEvidence,
})

console.log(JSON.stringify({
  ...report,
  checkedAt: new Date().toISOString(),
  evidencePath: evidencePath || null,
  evidenceError: evidenceError || null,
  localChecks: {
    releaseCertificationPassed: release.passed,
    pilotSessionPassed: pilot.passed,
    supportRunbookPassed: supportRunbook.passed,
  },
  nextStep: report.decision === 'ready_for_controlled_exposure'
    ? 'Open one controlled batch only; run the pilot session check before every subsequent batch.'
    : 'Do not expose the pilot. Resolve every blocker and collect fresh staging evidence before rerunning this command.',
}, null, 2))

if (report.decision !== 'ready_for_controlled_exposure') process.exit(1)
