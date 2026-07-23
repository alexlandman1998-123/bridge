import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentExpandedCohortActivation } from '../src/core/documents/legalDocumentExpandedCohortActivation.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

// RETIRED BY ROLL_OUT_6.  This historical activator mutates the v1
// environment allowlist and has no server-owned release epoch.  Preserve the
// code below solely for source history; execution is intentionally stopped
// before any configuration, provider, or runtime access.
console.log(JSON.stringify({
  phase: 'Q2',
  status: 'RETIRED_HOLD',
  errorCode: 'LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED',
  message: 'Legacy Q2 expansion activation is permanently retired. Use the separately approved server-owned successor-release process; this command made no changes.',
  mutatedData: false,
}, null, 2))
process.exit(1)

const PILOT_PATH = 'config/legal-document-pilot.json'
const STATE_PATH = 'config/legal-document-expansion-activation.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_Q2_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const hash = (value) => createHash('sha256').update(value).digest('hex')
const digest = (value) => `sha256:${hash(JSON.stringify(canonicalLegalDocumentReleaseValue(value)))}`
const runSupabase = (args) => spawnSync('npx', ['supabase', ...args], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
const q1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-q1-verify-activation-plan.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let q1
try { q1 = JSON.parse(q1Run.stdout) } catch { q1 = { status: 'UNAVAILABLE', ready: false, blockers: [{ code: 'Q2_Q1_UNAVAILABLE', solution: 'Restore Q1 verification before activation.' }] } }
const pilotText = fs.readFileSync(PILOT_PATH, 'utf8')
const pilot = JSON.parse(pilotText)
const planState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation-plan.json', 'utf8'))
const approvalState = JSON.parse(fs.readFileSync('config/legal-document-expansion-approval.json', 'utf8'))
const pendingState = JSON.parse(fs.readFileSync('config/legal-document-pending-expansion.json', 'utf8'))
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const plan = planState.plan
const approval = approvalState.approval
const apply = process.argv.includes('--apply')
const currentIds = ids((plan?.currentOrganisationIds || []).join(','))
const proposedIds = ids((plan?.proposedOrganisationIds || []).join(','))
const blockers = [...(q1.blockers || [])]
if (q1.status !== 'READY_FOR_Q2' || q1.ready !== true || !plan) blockers.push({ code: 'Q2_Q1_NOT_READY', solution: 'Resolve Q1 before activating expansion.' })
if (pilot.enabled !== true || pilot.activation?.status !== 'active' || ids((pilot.organisationIds || []).join(',')).join(',') !== currentIds.join(',') || ids((pilot.activation?.activatedOrganisationIds || []).join(',')).join(',') !== currentIds.join(',') || ids((pilot.releasePreparation?.organisationIds || []).join(',')).join(',') !== currentIds.join(',')) blockers.push({ code: 'Q2_CURRENT_ACTIVATION_DRIFT', solution: 'Restore the active current cohort across effective, approved, and activated repository state.' })
if (!approval || pendingState.pending?.sourceApprovalDigest !== approval.approvalDigest) blockers.push({ code: 'Q2_APPROVAL_CHAIN_INVALID', solution: 'Restore the P1 approval bound to the staged expansion.' })
if (!arg('activated-by')) blockers.push({ code: 'Q2_ACTIVATOR_MISSING', solution: 'Supply --activated-by with the accountable activation operator.' })
if (!arg('reference')) blockers.push({ code: 'Q2_REFERENCE_MISSING', solution: 'Supply --reference with the activation/change record.' })
if (arg('confirm-plan-digest') !== plan?.planDigest) blockers.push({ code: 'Q2_PLAN_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q1 plan digest.' })
if (arg('confirm-environment') !== plan?.activationTarget?.environment) blockers.push({ code: 'Q2_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact activation environment.' })
if (arg('confirm-project-ref') !== plan?.activationTarget?.projectRef) blockers.push({ code: 'Q2_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact activation project ref.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== currentIds.join(',')) blockers.push({ code: 'Q2_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== proposedIds.join(',')) blockers.push({ code: 'Q2_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== plan?.addedOrganisationId) blockers.push({ code: 'Q2_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'Q2_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for expansion activation.` })
if ([state.activation, ...(state.history || [])].some((row) => row?.sourcePlanDigest === plan?.planDigest)) blockers.push({ code: 'Q2_PLAN_ALREADY_ACTIVATED', solution: 'Use the existing activation record; one Q1 plan cannot be activated twice.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const activatedAt = new Date().toISOString()
const payload = buildLegalDocumentExpandedCohortActivation({ plan: plan || {}, approval: approval || {}, activatedBy: arg('activated-by'), activationReference: arg('reference'), activatedAt })
const activation = { ...payload, activationDigest: digest(payload) }
const report = { phase: 'Q2', action: 'activate_expansion', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, activation: unique.length ? null : activation, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const projectRef = plan.activationTarget.projectRef
  const proposedValue = proposedIds.join(',')
  const currentValue = currentIds.join(',')
  const setResult = runSupabase(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${proposedValue}`, '--project-ref', projectRef, '--yes'])
  if (setResult.status !== 0) throw new Error(setResult.stderr || 'Expanded-cohort runtime activation failed.')
  const listResult = runSupabase(['secrets', 'list', '--project-ref', projectRef, '--output', 'json'])
  if (listResult.status !== 0) {
    runSupabase(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${currentValue}`, '--project-ref', projectRef, '--yes'])
    throw new Error('Runtime secret verification was unavailable; the previous cohort was restored.')
  }
  const secrets = new Map(JSON.parse(listResult.stdout).map((row) => [row.name, row.value]))
  if (secrets.get('LEGAL_DOCUMENT_PILOT_ENABLED') !== hash('true') || secrets.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') !== hash(proposedValue)) {
    runSupabase(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${currentValue}`, '--project-ref', projectRef, '--yes'])
    throw new Error('Expanded runtime secrets did not verify; the previous cohort was restored.')
  }
  const nextPilot = {
    ...pilot,
    enabled: true,
    organisationIds: proposedIds,
    releasePreparation: { ...pilot.releasePreparation, status: 'approved', organisationIds: proposedIds, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, approvalReference: approval.approvalReference, expansionSourceApprovalDigest: approval.approvalDigest },
    activation: { ...pilot.activation, status: 'active', targetProjectRef: projectRef, activatedOrganisationIds: proposedIds, activatedBy: arg('activated-by'), activatedAt, activationReference: arg('reference'), expansionActivationDigest: activation.activationDigest, sourcePlanDigest: plan.planDigest, deactivatedBy: null, deactivatedAt: null, deactivationReason: null },
  }
  const nextState = { version: 1, status: 'activated', activation, history: [...(state.history || []), ...(state.activation ? [state.activation] : [])] }
  const pilotTemporary = `${PILOT_PATH}.q2.tmp`
  const stateTemporary = `${STATE_PATH}.q2.tmp`
  try {
    fs.writeFileSync(pilotTemporary, `${JSON.stringify(nextPilot, null, 2)}\n`, { flag: 'wx' })
    fs.writeFileSync(stateTemporary, `${JSON.stringify(nextState, null, 2)}\n`, { flag: 'wx' })
    fs.renameSync(pilotTemporary, PILOT_PATH)
    fs.renameSync(stateTemporary, STATE_PATH)
  } catch (error) {
    try { if (fs.existsSync(pilotTemporary)) fs.unlinkSync(pilotTemporary) } catch {}
    try { if (fs.existsSync(stateTemporary)) fs.unlinkSync(stateTemporary) } catch {}
    try {
      const rollbackTemporary = `${PILOT_PATH}.q2.rollback.tmp`
      fs.writeFileSync(rollbackTemporary, pilotText, { flag: 'wx' })
      fs.renameSync(rollbackTemporary, PILOT_PATH)
    } catch {}
    runSupabase(['secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${currentValue}`, '--project-ref', projectRef, '--yes'])
    throw new Error(`Activation persistence failed and the previous cohort was restored: ${error.message}`)
  }
  console.log(JSON.stringify({ ...report, status: 'ACTIVATED', secretDigestsVerified: true, mutatedData: true }, null, 2))
}
