import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentLaunchWindowPreflight } from '../src/core/documents/legalDocumentLaunchWindowPreflight.js'

function run(script, timeout) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return JSON.parse(result.stdout) } catch { return { status: 'UNAVAILABLE', mutatedData: false, blockers: [{ code: 'N1_UPSTREAM_UNAVAILABLE', detail: script }] } }
}

const m3 = run('scripts/legal-document-phase-m3-verify-claim.mjs', 900_000)
const activation = run('scripts/legal-document-phase-a3-verify.mjs', 300_000)
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let claimState
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
const rollbackReady = fs.existsSync('scripts/legal-document-phase-a3-deactivate.mjs') && pilot.rollback?.strategy === 'revoke_template_approval' && pilot.rollback?.requiresExplicitTemplateIds === true
const assessment = assessLegalDocumentLaunchWindowPreflight({ m3, claim: claimState.claim, activation, pilot, rollbackReady })

console.log(JSON.stringify({
  phase: 'N1', status: assessment.ready ? 'READY_FOR_N2' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  launchTarget: assessment.launchTarget, runtimeEvidenceAgeLimitMinutes: assessment.runtimeEvidenceAgeLimitMinutes,
  evidence: { m3Status: m3.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', activationStatus: activation.status || 'UNAVAILABLE', secretDigestsVerified: activation.secretDigestsVerified === true, releaseStatus: activation.releaseStatus || null, rollbackReady },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
