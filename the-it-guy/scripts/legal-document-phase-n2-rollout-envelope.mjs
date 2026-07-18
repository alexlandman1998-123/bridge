import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentRolloutSafetyEnvelope } from '../src/core/documents/legalDocumentRolloutSafetyEnvelope.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-n1-launch-window.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_000_000, maxBuffer: 30 * 1024 * 1024 })
let n1
try { n1 = JSON.parse(run.stdout) } catch { n1 = { status: 'UNAVAILABLE', ready: false, mutatedData: false } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let claimState
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
const monitoringFiles = ['scripts/legal-document-phase4-monitor.mjs', 'scripts/legal-document-phase5-watchdog-staging-smoke.mjs', 'scripts/legal-document-phase5-reconcile.mjs']
const controls = {
  monitoringReady: monitoringFiles.every((file) => fs.existsSync(file)),
  rollbackReady: fs.existsSync('scripts/legal-document-phase-a3-deactivate.mjs') && pilot.rollback?.strategy === 'revoke_template_approval',
}
const assessment = assessLegalDocumentRolloutSafetyEnvelope({ n1, claim: claimState.claim, pilot, controls })
console.log(JSON.stringify({
  phase: 'N2', status: assessment.ready ? 'READY_FOR_N3' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  rolloutEnvelope: assessment.envelope, minimumClaimRemainingMinutes: assessment.minimumClaimRemainingMinutes,
  evidence: { n1Status: n1.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', monitoringReady: controls.monitoringReady, rollbackReady: controls.rollbackReady },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
