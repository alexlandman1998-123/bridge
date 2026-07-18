import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentExpansionApprovalPayload } from '../src/core/documents/legalDocumentExpansionApproval.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-expansion-approval.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_P1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-o3-expansion-proposal.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 600_000, maxBuffer: 30 * 1024 * 1024 })
let o3
try { o3 = JSON.parse(run.stdout) } catch { o3 = { status: 'UNAVAILABLE', ready: false, proposal: null } }
const continuationState = JSON.parse(fs.readFileSync('config/legal-document-cohort-continuation.json', 'utf8'))
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const continuation = continuationState.record
const proposal = o3.proposal || {}
const apply = process.argv.includes('--apply')
const blockers = [...(o3.blockers || [])]
if (o3.status !== 'READY_FOR_P1' || o3.ready !== true || !o3.proposal) blockers.push({ code: 'P1_O3_NOT_READY', solution: 'Resolve O3 before approving expansion.' })
if (!arg('approved-by')) blockers.push({ code: 'P1_APPROVER_MISSING', solution: 'Supply --approved-by with the accountable expansion approver.' })
if (!arg('reference')) blockers.push({ code: 'P1_REFERENCE_MISSING', solution: 'Supply --reference with the approval/change record.' })
if (arg('confirm-environment') !== continuation?.releaseTarget?.environment) blockers.push({ code: 'P1_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact continued environment.' })
if (arg('confirm-project-ref') !== continuation?.releaseTarget?.projectRef) blockers.push({ code: 'P1_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact continued project ref.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== ids(proposal.currentOrganisationIds).join(',')) blockers.push({ code: 'P1_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== ids(proposal.proposedOrganisationIds).join(',')) blockers.push({ code: 'P1_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== proposal.addedOrganisationId) blockers.push({ code: 'P1_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact single added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'P1_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for approval writes.` })
const alreadyApproved = [state.approval, ...(state.history || [])].some((row) => row?.sourceContinuationDigest === continuation?.recordDigest && row?.addedOrganisationId === proposal.addedOrganisationId)
if (alreadyApproved) blockers.push({ code: 'P1_PROPOSAL_ALREADY_APPROVED', solution: 'Use the existing approval or generate a genuinely new O3 proposal.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentExpansionApprovalPayload({ o3, continuation: continuation || {}, approvedBy: arg('approved-by'), approvalReference: arg('reference') })
const approval = { ...payload, approvalDigest: digest(payload) }
const report = { phase: 'P1', action: 'approve_expansion', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'APPROVED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, approval: unique.length ? null : approval, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'approved', approval, history: [...(state.history || []), ...(state.approval ? [state.approval] : [])] }
  const temporaryPath = `${STATE_PATH}.p1.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
