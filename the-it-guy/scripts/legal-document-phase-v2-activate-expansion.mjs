import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentNextExpandedCohortActivation } from '../src/core/documents/legalDocumentNextExpandedCohortActivation.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

// RETIRED BY ROLL_OUT_6.  This historical activator mutates the v1
// environment allowlist and cannot establish a server-owned release epoch.
// Its retained source is audit material only; terminate before any local or
// remote mutation can occur.
console.log(JSON.stringify({
  phase: 'V2',
  status: 'RETIRED_HOLD',
  errorCode: 'LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED',
  message: 'Legacy V2 expansion activation is permanently retired. Use the separately approved server-owned successor-release process; this command made no changes.',
  mutatedData: false,
}, null, 2))
process.exit(1)

const PILOT_PATH = 'config/legal-document-pilot.json'
const STATE_PATH = 'config/legal-document-next-expansion-activation.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_V2_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const hash = (value) => createHash('sha256').update(value).digest('hex')
const digest = (value) => `sha256:${hash(JSON.stringify(canonicalLegalDocumentReleaseValue(value)))}`
const runSupabase = (args) => spawnSync('npx', ['supabase', ...args], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
const v1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-v1-verify-activation-plan.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let v1
try { v1 = JSON.parse(v1Run.stdout) } catch { v1 = { status: 'UNAVAILABLE', ready: false, blockers: [{ code: 'V2_V1_UNAVAILABLE', solution: 'Restore V1 verification before activation.' }] } }
const pilotText = fs.readFileSync(PILOT_PATH, 'utf8')
const pilot = JSON.parse(pilotText)
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const planState = read('config/legal-document-next-expansion-activation-plan.json', { plan: null })
const approvalState = read('config/legal-document-next-expansion-approval.json', { approval: null })
const pendingState = read('config/legal-document-next-pending-expansion.json', { pending: null })
const continuationState = read('config/legal-document-expanded-cohort-continuation.json', { record: null })
const previousActivationState = read('config/legal-document-expansion-activation.json', { activation: null })
const state = read(STATE_PATH, { status: 'unavailable', activation: null, history: [] })
const plan = planState.plan
const approval = approvalState.approval
const pending = pendingState.pending
const continuation = continuationState.record
const previousActivation = previousActivationState.activation
const apply = process.argv.includes('--apply')
const currentIds = ids((plan?.currentOrganisationIds || []).join(','))
const proposedIds = ids((plan?.proposedOrganisationIds || []).join(','))
const blockers = [...(v1.blockers || [])]
if (v1.status !== 'READY_FOR_V2' || v1.ready !== true || !plan) blockers.push({ code: 'V2_V1_NOT_READY', solution: 'Resolve V1 before activating the expansion.' })
if (pilot.enabled !== true || pilot.activation?.status !== 'active' || ids((pilot.organisationIds || []).join(',')).join(',') !== currentIds.join(',') || ids((pilot.activation?.activatedOrganisationIds || []).join(',')).join(',') !== currentIds.join(',') || ids((pilot.releasePreparation?.organisationIds || []).join(',')).join(',') !== currentIds.join(',')) blockers.push({ code: 'V2_CURRENT_ACTIVATION_DRIFT', solution: 'Restore the active current cohort across effective, approved, and activated repository state.' })
if (!approval || pending?.sourceApprovalDigest !== approval.approvalDigest || plan?.sourceApprovalDigest !== approval.approvalDigest) blockers.push({ code: 'V2_APPROVAL_CHAIN_INVALID', solution: 'Restore the U1 approval bound through U2 and V1.' })
if (!continuation || !previousActivation || continuation.sourceActivationDigest !== previousActivation.activationDigest || plan?.sourceActivationDigest !== previousActivation.activationDigest) blockers.push({ code: 'V2_PREVIOUS_ACTIVATION_CHAIN_INVALID', solution: 'Restore the exact T1/Q2 previous-cohort activation chain.' })
if (!arg('activated-by')) blockers.push({ code: 'V2_ACTIVATOR_MISSING', solution: 'Supply --activated-by with the accountable activation operator.' })
if (!arg('reference')) blockers.push({ code: 'V2_REFERENCE_MISSING', solution: 'Supply --reference with the activation or change record.' })
if (arg('confirm-plan-digest') !== plan?.planDigest) blockers.push({ code: 'V2_PLAN_CONFIRMATION_MISMATCH', solution: 'Confirm the exact V1 plan digest.' })
if (arg('confirm-certification-digest') !== plan?.sourceCertificationDigest) blockers.push({ code: 'V2_CERTIFICATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact U3 certification digest.' })
if (arg('confirm-previous-activation-digest') !== plan?.sourceActivationDigest) blockers.push({ code: 'V2_PREVIOUS_ACTIVATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest for the current cohort.' })
if (arg('confirm-environment') !== plan?.activationTarget?.environment) blockers.push({ code: 'V2_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact activation environment.' })
if (arg('confirm-project-ref') !== plan?.activationTarget?.projectRef) blockers.push({ code: 'V2_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact activation project ref.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== currentIds.join(',')) blockers.push({ code: 'V2_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== proposedIds.join(',')) blockers.push({ code: 'V2_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== plan?.addedOrganisationId) blockers.push({ code: 'V2_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'V2_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for expansion activation.` })
const planIdentityComplete = Boolean(plan?.planDigest)
const alreadyActivated = planIdentityComplete && [state.activation, ...(state.history || [])].some((row) => row?.status === 'activated' && row.sourcePlanDigest === plan.planDigest)
if (alreadyActivated) blockers.push({ code: 'V2_PLAN_ALREADY_ACTIVATED', solution: 'Use the existing activation record; one V1 plan cannot be activated twice.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const activatedAt = new Date().toISOString()
let activation = null
if (!unique.length) {
  const payload = buildLegalDocumentNextExpandedCohortActivation({ plan, approval, activatedBy: arg('activated-by'), activationReference: arg('reference'), activatedAt })
  activation = { ...payload, activationDigest: digest(payload) }
}
const report = { phase: 'V2', action: 'activate_next_expansion', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, activation, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const projectRef = plan.activationTarget.projectRef
  const proposedValue = proposedIds.join(',')
  const currentValue = currentIds.join(',')
  const restoreRuntime = () => runSupabase(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${currentValue}`, '--project-ref', projectRef, '--yes'])
  const setResult = runSupabase(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${proposedValue}`, '--project-ref', projectRef, '--yes'])
  if (setResult.status !== 0) throw new Error(setResult.stderr || 'V2 runtime activation failed.')
  const listResult = runSupabase(['secrets', 'list', '--project-ref', projectRef, '--output', 'json'])
  if (listResult.status !== 0) {
    restoreRuntime()
    throw new Error('Runtime secret verification was unavailable; the previous cohort was restored.')
  }
  const secrets = new Map(JSON.parse(listResult.stdout).map((row) => [row.name, row.value]))
  if (secrets.get('LEGAL_DOCUMENT_PILOT_ENABLED') !== hash('true') || secrets.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') !== hash(proposedValue)) {
    restoreRuntime()
    throw new Error('Expanded runtime secrets did not verify; the previous cohort was restored.')
  }
  const nextPilot = {
    ...pilot,
    enabled: true,
    organisationIds: proposedIds,
    releasePreparation: { ...pilot.releasePreparation, status: 'approved', organisationIds: proposedIds, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, approvalReference: approval.approvalReference, nextExpansionSourceApprovalDigest: approval.approvalDigest },
    activation: { ...pilot.activation, status: 'active', targetProjectRef: projectRef, activatedOrganisationIds: proposedIds, activatedBy: arg('activated-by'), activatedAt, activationReference: arg('reference'), nextExpansionActivationDigest: activation.activationDigest, sourcePlanDigest: plan.planDigest, previousActivationDigest: previousActivation.activationDigest, deactivatedBy: null, deactivatedAt: null, deactivationReason: null },
  }
  const nextState = { version: 1, status: 'activated', activation, history: [...(state.history || []), ...(state.activation ? [state.activation] : [])] }
  const pilotTemporary = `${PILOT_PATH}.v2.tmp`
  const stateTemporary = `${STATE_PATH}.v2.tmp`
  try {
    fs.writeFileSync(pilotTemporary, `${JSON.stringify(nextPilot, null, 2)}\n`, { flag: 'wx' })
    fs.writeFileSync(stateTemporary, `${JSON.stringify(nextState, null, 2)}\n`, { flag: 'wx' })
    fs.renameSync(pilotTemporary, PILOT_PATH)
    fs.renameSync(stateTemporary, STATE_PATH)
  } catch (error) {
    try { if (fs.existsSync(pilotTemporary)) fs.unlinkSync(pilotTemporary) } catch {}
    try { if (fs.existsSync(stateTemporary)) fs.unlinkSync(stateTemporary) } catch {}
    try {
      const rollbackTemporary = `${PILOT_PATH}.v2.rollback.tmp`
      fs.writeFileSync(rollbackTemporary, pilotText, { flag: 'wx' })
      fs.renameSync(rollbackTemporary, PILOT_PATH)
    } catch {}
    restoreRuntime()
    throw new Error(`V2 activation persistence failed and the previous cohort was restored: ${error.message}`)
  }
  console.log(JSON.stringify({ ...report, status: 'ACTIVATED', secretDigestsVerified: true, mutatedData: true }, null, 2))
}
