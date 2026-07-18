import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortCertification, buildLegalDocumentExpandedCohortCertification } from '../src/core/documents/legalDocumentExpandedCohortCertification.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

function runJson(script, timeout) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return { status: 'UNAVAILABLE', ready: false, blockers: [{ code: 'P3_VERIFIER_UNAVAILABLE', detail: script, solution: `Restore ${script} and rerun P3.` }], checkedAt: null, mutatedData: false } }
}

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let pendingState
try { pendingState = JSON.parse(fs.readFileSync('config/legal-document-pending-expansion.json', 'utf8')) } catch { pendingState = { status: 'unavailable', pending: null } }
const p2 = runJson('scripts/legal-document-phase-p2-verify-expansion.mjs', 120_000)
const canCertify = p2.status === 'READY_FOR_P3' && p2.ready === true && pendingState.pending?.status === 'staged'
const cohort = canCertify ? runJson('scripts/legal-document-phase4-cohort-readiness.mjs', 300_000) : { status: 'NOT_RUN', checkedAt: null, mutatedData: false, assessments: [], readyOrganisationIds: [] }
const l1 = canCertify ? runJson('scripts/legal-document-phase-l1-launch-certification.mjs', 800_000) : { status: 'NOT_RUN', checkedAt: null, mutatedData: false, coverage: { otp: false, mandate: false } }
const checkedAt = new Date().toISOString()
const assessment = assessLegalDocumentExpandedCohortCertification({ p2, pending: pendingState.pending, pilot, cohort, l1, now: Date.parse(checkedAt) })
const payload = assessment.ready ? buildLegalDocumentExpandedCohortCertification({ pending: pendingState.pending, cohort, l1, checkedAt }) : null
const certification = payload ? { ...payload, certificationDigest: digest(payload) } : null

console.log(JSON.stringify({
  phase: 'P3', status: assessment.ready ? 'READY_FOR_FRESH_AUTHORITY' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers, certification,
  evidence: { p2Status: p2.status || 'UNAVAILABLE', pendingState: pendingState.status || 'UNAVAILABLE', cohortStatus: cohort.status || 'UNAVAILABLE', l1Status: l1.status || 'UNAVAILABLE', currentOrganisationIds: assessment.currentOrganisationIds, addedOrganisationId: assessment.addedOrganisationId, proposedOrganisationIds: assessment.proposedOrganisationIds, effectiveAllowlistChanged: false },
  evidenceAgeLimitMinutes: assessment.evidenceAgeLimitMinutes, checkedAt, mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
