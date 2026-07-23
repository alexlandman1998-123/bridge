import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { assessLegalDocumentRecoveryReadiness } from '../src/core/documents/legalDocumentRecoveryReadiness.js'

function runJson(script, args = [], timeout = 300_000) {
  const run = spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return { report: JSON.parse(run.stdout), error: null } } catch { return { report: null, error: run.stderr || run.stdout || `${script} returned no JSON.` } }
}
const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const projectRef = String(manifest.projectRef || '').trim()
const templateIds = [...new Set((manifest.templates || []).map((row) => String(row.templateId || '').trim()).filter(Boolean))].sort()
const g3Run = runJson('scripts/legal-document-phase-g3-operational-readiness.mjs')
const deactivationRun = runJson('scripts/legal-document-phase-a3-deactivate.mjs', [`--project-ref=${projectRef}`, '--reason=G4-controlled-kill-switch-rehearsal'])
const rollbackRun = runJson('scripts/legal-document-phase4-rollback.mjs', [`--template-ids=${templateIds.join(',')}`, '--reason=G4-controlled-template-revocation-rehearsal'])
const canonicalFinalizer = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const dispatcher = fs.readFileSync('../supabase/functions/dispatch-final-signed-document/index.ts', 'utf8')
const canonicalExistingArtifactRetry = /if \(existingFinalPath && !forceRegenerate\)[\s\S]{0,8000}const finalDelivery = await dispatchFinalDelivery/.test(canonicalFinalizer)
const retryContract = {
  // One canonical finaliser retries the immutable artifact for both packet types.
  mandateExistingArtifactRetry: canonicalExistingArtifactRetry,
  otpExistingArtifactRetry: canonicalExistingArtifactRetry,
  concurrentClaim: /bridge_claim_final_delivery_f3/.test(dispatcher),
  providerIdempotency: /idempotencyKey/.test(dispatcher),
  successfulRecipientSkip: /existing\?\.status[^\n]+sent[^\n]+provider_message_id/.test(dispatcher),
  signedArtifactUnchanged: !/legal_final_artifact_evidence[^\n]*(update|delete)/i.test(dispatcher),
}
const blockers = []
if (!g3Run.report) blockers.push({ code: 'G4_G3_CHECK_UNAVAILABLE', detail: g3Run.error })
if (!deactivationRun.report) blockers.push({ code: 'G4_DEACTIVATION_REHEARSAL_FAILED', detail: deactivationRun.error })
if (!rollbackRun.report) blockers.push({ code: 'G4_TEMPLATE_ROLLBACK_REHEARSAL_FAILED', detail: rollbackRun.error })
if (!projectRef || !templateIds.length) blockers.push({ code: 'G4_FROZEN_TARGET_SET_MISSING' })
const assessment = assessLegalDocumentRecoveryReadiness({ g3: g3Run.report || {}, deactivation: deactivationRun.report || {}, rollback: rollbackRun.report || {}, expectedProjectRef: projectRef, expectedTemplateIds: templateIds, retryContract })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const evidencePayload = { version: 'legal_document_g4_recovery_v1', projectRef, templateIds, deactivation: deactivationRun.report, rollback: rollbackRun.report, retryContract }
const evidenceDigest = `sha256:${createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex')}`
const solutions = {
  G4_G3_NOT_READY: 'Complete G3 operational ownership, monitoring, and reconciliation before recovery certification.',
  G4_G3_CHECK_UNAVAILABLE: 'Restore the G3 operational verifier before rehearsing recovery.',
  G4_FROZEN_TARGET_SET_MISSING: 'Regenerate and review the B1 frozen manifest so rollback targets are explicit.',
  G4_DEACTIVATION_REHEARSAL_FAILED: 'Repair the A3 kill-switch operator until an exact-project dry run reports DRY_RUN_READY.',
  G4_TEMPLATE_ROLLBACK_REHEARSAL_FAILED: 'Repair the template revocation operator until the exact frozen set passes a non-mutating dry run.',
  G4_DELIVERY_RETRY_CONTRACT_INVALID: 'Restore existing-artifact retry, delivery claims, provider idempotency, successful-recipient skipping, and signed-artifact immutability.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'G4', status: unique.length ? 'NO_GO' : 'READY_FOR_H1', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this recovery gate and rerun G4.' })), evidence: { projectRef, templateIds, deactivationStatus: deactivationRun.report?.status || 'UNAVAILABLE', rollbackMode: rollbackRun.report?.mode || 'UNAVAILABLE', retryContract, evidenceDigest }, g3Status: g3Run.report?.status || 'UNAVAILABLE', checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
