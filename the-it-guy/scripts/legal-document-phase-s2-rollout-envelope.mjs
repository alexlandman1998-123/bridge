import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedRolloutSafetyEnvelope } from '../src/core/documents/legalDocumentExpandedRolloutSafetyEnvelope.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-s1-launch-window.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_500_000, maxBuffer: 30 * 1024 * 1024 })
let s1
try { s1 = JSON.parse(run.stdout) } catch { s1 = { status: 'UNAVAILABLE', ready: false, mutatedData: false, launchTarget: null } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let claimState
let activationState
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const monitoringFiles = ['scripts/legal-document-phase4-monitor.mjs', 'scripts/legal-document-phase5-watchdog-staging-smoke.mjs', 'scripts/legal-document-phase5-reconcile.mjs']
const controls = {
  monitoringReady: monitoringFiles.every((file) => fs.existsSync(file)),
  rollbackReady: fs.existsSync('scripts/legal-document-phase-a3-deactivate.mjs') && pilot.rollback?.strategy === 'revoke_template_approval',
}
const assessment = assessLegalDocumentExpandedRolloutSafetyEnvelope({ s1, claim: claimState.claim, activation: activationState.activation, pilot, controls })
console.log(JSON.stringify({
  phase: 'S2', status: assessment.ready ? 'READY_FOR_S3' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  rolloutEnvelope: assessment.envelope, minimumClaimRemainingMinutes: assessment.minimumClaimRemainingMinutes,
  evidence: { s1Status: s1.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', monitoringReady: controls.monitoringReady, rollbackReady: controls.rollbackReady },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
