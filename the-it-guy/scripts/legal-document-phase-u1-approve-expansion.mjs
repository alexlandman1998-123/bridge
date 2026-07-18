import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentNextExpansionApproval } from '../src/core/documents/legalDocumentNextExpansionApproval.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-next-expansion-approval.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_U1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-t4-expansion-handoff.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 600_000, maxBuffer: 30 * 1024 * 1024 })
let t4
try { t4 = JSON.parse(run.stdout) } catch { t4 = { status: 'UNAVAILABLE', ready: false, handoff: null, blockers: [] } }
let state
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { state = { status: 'unavailable', approval: null, history: [] } }
const handoff = t4.handoff || {}
const apply = process.argv.includes('--apply')
const blockers = [...(t4.blockers || [])]
if (t4.status !== 'READY_FOR_U1' || t4.ready !== true || !t4.handoff) blockers.push({ code: 'U1_T4_NOT_READY', solution: 'Resolve T4 and regenerate a current integrity handoff before approval.' })
if (!arg('approved-by')) blockers.push({ code: 'U1_APPROVER_MISSING', solution: 'Supply --approved-by with the accountable expansion approver.' })
if (!arg('reference')) blockers.push({ code: 'U1_REFERENCE_MISSING', solution: 'Supply --reference with the approval or change record.' })
if (arg('confirm-handoff-digest') !== handoff.handoffDigest) blockers.push({ code: 'U1_HANDOFF_CONFIRMATION_MISMATCH', solution: 'Confirm the exact T4 handoff digest.' })
if (arg('confirm-continuation-digest') !== handoff.sourceContinuationDigest) blockers.push({ code: 'U1_CONTINUATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact T1 continuation digest.' })
if (arg('confirm-activation-digest') !== handoff.sourceActivationDigest) blockers.push({ code: 'U1_ACTIVATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest.' })
if (arg('confirm-environment') !== handoff.releaseTarget?.environment) blockers.push({ code: 'U1_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact continued environment.' })
if (arg('confirm-project-ref') !== handoff.releaseTarget?.projectRef) blockers.push({ code: 'U1_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact continued project ref.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== ids(handoff.currentOrganisationIds).join(',')) blockers.push({ code: 'U1_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== ids(handoff.proposedOrganisationIds).join(',')) blockers.push({ code: 'U1_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== handoff.addedOrganisationId) blockers.push({ code: 'U1_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact single added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'U1_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for approval writes.` })
const proposalIdentityComplete = Boolean(handoff.sourceContinuationDigest && handoff.sourceActivationDigest && handoff.addedOrganisationId)
const alreadyApproved = proposalIdentityComplete && [state.approval, ...(state.history || [])].some((row) => row?.status === 'approved' && row.sourceContinuationDigest === handoff.sourceContinuationDigest && row.sourceActivationDigest === handoff.sourceActivationDigest && row.addedOrganisationId === handoff.addedOrganisationId)
if (alreadyApproved) blockers.push({ code: 'U1_PROPOSAL_ALREADY_APPROVED', solution: 'Use the existing approval or wait for a genuinely new continued cohort and proposal.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
let approval = null
if (!unique.length) {
  const payload = buildLegalDocumentNextExpansionApproval({ handoff, approvedBy: arg('approved-by'), approvalReference: arg('reference') })
  approval = { ...payload, approvalDigest: digest(payload) }
}
const report = { phase: 'U1', action: 'approve_next_expansion', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'APPROVED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, approval, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'approved', approval, history: [...(state.history || []), ...(state.approval ? [state.approval] : [])] }
  const temporaryPath = `${STATE_PATH}.u1.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
