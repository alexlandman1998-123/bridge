import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortActivationVerification, buildLegalDocumentExpandedCohortVerification } from '../src/core/documents/legalDocumentExpandedCohortActivationVerification.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

function runJson(script, timeout) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return { status: 'UNAVAILABLE', ready: false, checkedAt: null, mutatedData: false } }
}
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let activationState
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const q2 = runJson('scripts/legal-document-phase-q2-verify-expansion.mjs', 180_000)
const canVerify = q2.status === 'READY_FOR_Q3' && q2.ready === true && activationState.activation?.status === 'activated'
const a3 = canVerify ? runJson('scripts/legal-document-phase-a3-verify.mjs', 600_000) : { status: 'NOT_RUN', checkedAt: null, mutatedData: false, organisationIds: [], secretDigestsVerified: false, releaseStatus: null }
const cohort = canVerify ? runJson('scripts/legal-document-phase4-cohort-readiness.mjs', 300_000) : { status: 'NOT_RUN', checkedAt: null, mutatedData: false, assessments: [], readyOrganisationIds: [], configuredOrganisationIds: [] }
const checkedAt = new Date().toISOString()
const assessment = assessLegalDocumentExpandedCohortActivationVerification({ q2, activation: activationState.activation, pilot, a3, cohort, now: Date.parse(checkedAt) })
const payload = assessment.ready ? buildLegalDocumentExpandedCohortVerification({ activation: activationState.activation, a3, cohort, checkedAt }) : null
const verification = payload ? { ...payload, verificationDigest: digest(payload) } : null
console.log(JSON.stringify({ phase: 'Q3', status: assessment.ready ? 'READY_FOR_M1' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, verification, evidence: { q2Status: q2.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', a3Status: a3.status || 'UNAVAILABLE', releaseStatus: a3.releaseStatus || null, cohortStatus: cohort.status || 'UNAVAILABLE', addedOrganisationId: assessment.addedOrganisationId, activatedOrganisationIds: assessment.activatedOrganisationIds }, evidenceAgeLimitMinutes: assessment.evidenceAgeLimitMinutes, checkedAt, mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
