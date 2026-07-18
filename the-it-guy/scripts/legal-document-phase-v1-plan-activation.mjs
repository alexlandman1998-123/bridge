import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentNextExpansionActivationPlan } from '../src/core/documents/legalDocumentNextExpansionActivationPlan.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-next-expansion-activation-plan.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_V1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-u3-expanded-cohort-certification.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let u3
try { u3 = JSON.parse(run.stdout) } catch { u3 = { status: 'UNAVAILABLE', ready: false, certification: null, blockers: [{ code: 'V1_U3_UNAVAILABLE', solution: 'Restore the U3 verifier before planning activation.' }] } }
let state
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { state = { status: 'unavailable', plan: null, history: [] } }
const certification = u3.certification
const apply = process.argv.includes('--apply')
const blockers = [...(u3.blockers || [])]
if (u3.status !== 'READY_FOR_V1' || u3.ready !== true || !certification) blockers.push({ code: 'V1_U3_NOT_READY', solution: 'Resolve U3 before planning the next expanded-cohort activation.' })
if (!arg('planned-by')) blockers.push({ code: 'V1_PLANNER_MISSING', solution: 'Supply --planned-by with the accountable activation planner.' })
if (!arg('reference')) blockers.push({ code: 'V1_REFERENCE_MISSING', solution: 'Supply --reference with the activation or change record.' })
if (arg('confirm-certification-digest') !== certification?.certificationDigest) blockers.push({ code: 'V1_CERTIFICATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact fresh U3 certification digest.' })
if (arg('confirm-pending-digest') !== certification?.sourcePendingDigest) blockers.push({ code: 'V1_PENDING_CONFIRMATION_MISMATCH', solution: 'Confirm the exact U2 pending change-set digest.' })
if (arg('confirm-approval-digest') !== certification?.sourceApprovalDigest) blockers.push({ code: 'V1_APPROVAL_CONFIRMATION_MISMATCH', solution: 'Confirm the exact U1 approval digest.' })
if (arg('confirm-activation-digest') !== certification?.sourceActivationDigest) blockers.push({ code: 'V1_ACTIVATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest for the current cohort.' })
if (arg('confirm-environment') !== certification?.releaseTarget?.environment) blockers.push({ code: 'V1_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact certified environment.' })
if (arg('confirm-project-ref') !== certification?.releaseTarget?.projectRef) blockers.push({ code: 'V1_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact certified project ref.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== ids((certification?.currentOrganisationIds || []).join(',')).join(',')) blockers.push({ code: 'V1_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== ids((certification?.proposedOrganisationIds || []).join(',')).join(',')) blockers.push({ code: 'V1_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== certification?.addedOrganisationId) blockers.push({ code: 'V1_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'V1_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for activation-plan writes.` })
const certificateIdentityComplete = Boolean(certification?.certificationDigest)
const alreadyPlanned = certificateIdentityComplete && [state.plan, ...(state.history || [])].some((row) => row?.status === 'planned' && row.sourceCertificationDigest === certification.certificationDigest)
if (alreadyPlanned) blockers.push({ code: 'V1_CERTIFICATION_ALREADY_PLANNED', solution: 'Use the existing activation plan; one U3 certificate cannot create multiple plans.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
let plan = null
if (!unique.length) {
  const payload = buildLegalDocumentNextExpansionActivationPlan({ certification, plannedBy: arg('planned-by'), planningReference: arg('reference'), evidenceAgeLimitMinutes: u3.evidenceAgeLimitMinutes || 15 })
  plan = { ...payload, planDigest: digest(payload) }
}
const report = { phase: 'V1', action: 'plan_next_expansion_activation', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'PLANNED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, plan, effectiveAllowlistChanged: false, runtimeActivationChanged: false, runtimeSecretsChanged: false, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'planned', plan, history: [...(state.history || []), ...(state.plan ? [state.plan] : [])] }
  const temporaryPath = `${STATE_PATH}.v1.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
