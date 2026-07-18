import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentNextPendingExpansion } from '../src/core/documents/legalDocumentNextPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-next-pending-expansion.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_U2_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-u1-verify-expansion.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
let u1
try { u1 = JSON.parse(run.stdout) } catch { u1 = { status: 'UNAVAILABLE', ready: false, blockers: [] } }
let approvalState
let state
try { approvalState = JSON.parse(fs.readFileSync('config/legal-document-next-expansion-approval.json', 'utf8')) } catch { approvalState = { status: 'unavailable', approval: null } }
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { state = { status: 'unavailable', pending: null, history: [] } }
const approval = approvalState.approval
const apply = process.argv.includes('--apply')
const blockers = [...(u1.blockers || [])]
if (u1.status !== 'READY_FOR_U2' || u1.ready !== true || !approval) blockers.push({ code: 'U2_U1_NOT_READY', solution: 'Resolve U1 before staging the next expansion.' })
if (!arg('staged-by')) blockers.push({ code: 'U2_OPERATOR_MISSING', solution: 'Supply --staged-by with the accountable staging operator.' })
if (!arg('reference')) blockers.push({ code: 'U2_REFERENCE_MISSING', solution: 'Supply --reference with the staging or change record.' })
if (arg('confirm-approval-digest') !== approval?.approvalDigest) blockers.push({ code: 'U2_APPROVAL_DIGEST_CONFIRMATION_MISMATCH', solution: 'Confirm the exact U1 approval digest.' })
if (arg('confirm-handoff-digest') !== approval?.sourceHandoffDigest) blockers.push({ code: 'U2_HANDOFF_DIGEST_CONFIRMATION_MISMATCH', solution: 'Confirm the exact T4 handoff digest carried by U1.' })
if (arg('confirm-continuation-digest') !== approval?.sourceContinuationDigest) blockers.push({ code: 'U2_CONTINUATION_DIGEST_CONFIRMATION_MISMATCH', solution: 'Confirm the exact T1 continuation digest.' })
if (arg('confirm-activation-digest') !== approval?.sourceActivationDigest) blockers.push({ code: 'U2_ACTIVATION_DIGEST_CONFIRMATION_MISMATCH', solution: 'Confirm the exact Q2 activation digest.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== ids(approval?.currentOrganisationIds).join(',')) blockers.push({ code: 'U2_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== ids(approval?.proposedOrganisationIds).join(',')) blockers.push({ code: 'U2_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== approval?.addedOrganisationId) blockers.push({ code: 'U2_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'U2_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for staging writes.` })
const approvalIdentityComplete = Boolean(approval?.approvalDigest)
const alreadyStaged = approvalIdentityComplete && [state.pending, ...(state.history || [])].some((row) => row?.status === 'staged' && row.sourceApprovalDigest === approval.approvalDigest)
if (alreadyStaged) blockers.push({ code: 'U2_APPROVAL_ALREADY_STAGED', solution: 'Use the existing pending change set; one U1 approval cannot be staged twice.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
let pending = null
if (!unique.length) {
  const payload = buildLegalDocumentNextPendingExpansion({ approval, stagedBy: arg('staged-by'), stagingReference: arg('reference') })
  pending = { ...payload, pendingDigest: digest(payload) }
}
const report = { phase: 'U2', action: 'stage_next_expansion', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'STAGED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, pending, effectiveAllowlistChanged: false, runtimeActivationChanged: false, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'staged', pending, history: [...(state.history || []), ...(state.pending ? [state.pending] : [])] }
  const temporaryPath = `${STATE_PATH}.u2.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
