import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortReleaseAuthority, buildLegalDocumentExpandedCohortReleaseAuthority } from '../src/core/documents/legalDocumentExpandedCohortReleaseAuthority.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

function runJson(script, timeout) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return { status: 'UNAVAILABLE', ready: false, authorized: false, checkedAt: null, mutatedData: false } }
}
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
let activationState
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const q3 = runJson('scripts/legal-document-phase-q3-verify-activation.mjs', 1_200_000)
const canAuthorize = q3.status === 'READY_FOR_M1' && q3.ready === true && Boolean(q3.verification) && activationState.activation?.status === 'activated'
const m1 = canAuthorize ? runJson('scripts/legal-document-phase-m1-release-authority.mjs', 1_500_000) : { status: 'NOT_RUN', authorized: false, checkedAt: null, mutatedData: false, releaseTarget: null, evidence: {} }
const checkedAt = new Date().toISOString()
const assessment = assessLegalDocumentExpandedCohortReleaseAuthority({ q3, m1, activation: activationState.activation, now: Date.parse(checkedAt) })
const m1Digest = canAuthorize ? digest({ status: m1.status, authorized: m1.authorized, releaseTarget: m1.releaseTarget, evidence: m1.evidence, checkedAt: m1.checkedAt }) : null
const payload = assessment.ready ? buildLegalDocumentExpandedCohortReleaseAuthority({ q3, m1, m1Digest, authorizedAt: checkedAt }) : null
const authority = payload ? { ...payload, authorityDigest: digest(payload) } : null
console.log(JSON.stringify({ phase: 'R1', status: assessment.ready ? 'READY_FOR_R2' : 'RELEASE_HOLD', authorized: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, authority, releaseTarget: assessment.releaseTarget, evidenceAgeLimitMinutes: assessment.evidenceAgeLimitMinutes, evidence: { activationState: activationState.status || 'UNAVAILABLE', q3Status: q3.status || 'UNAVAILABLE', m1Status: m1.status || 'UNAVAILABLE', sourceActivationDigest: activationState.activation?.activationDigest || null }, checkedAt, mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
