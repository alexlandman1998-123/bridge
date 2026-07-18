import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentPendingExpansionPayload } from '../src/core/documents/legalDocumentPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-pending-expansion.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_P2_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-p1-verify-expansion.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
let p1
try { p1 = JSON.parse(run.stdout) } catch { p1 = { status: 'UNAVAILABLE', ready: false } }
const approvalState = JSON.parse(fs.readFileSync('config/legal-document-expansion-approval.json', 'utf8'))
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const approval = approvalState.approval
const apply = process.argv.includes('--apply')
const blockers = [...(p1.blockers || [])]
if (p1.status !== 'READY_FOR_P2' || p1.ready !== true || !approval) blockers.push({ code: 'P2_P1_NOT_READY', solution: 'Resolve P1 before staging expansion.' })
if (!arg('staged-by')) blockers.push({ code: 'P2_OPERATOR_MISSING', solution: 'Supply --staged-by with the accountable staging operator.' })
if (!arg('reference')) blockers.push({ code: 'P2_REFERENCE_MISSING', solution: 'Supply --reference with the staging/change record.' })
if (arg('confirm-approval-digest') !== approval?.approvalDigest) blockers.push({ code: 'P2_APPROVAL_DIGEST_CONFIRMATION_MISMATCH', solution: 'Confirm the exact P1 approval digest.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== ids(approval?.currentOrganisationIds).join(',')) blockers.push({ code: 'P2_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== ids(approval?.proposedOrganisationIds).join(',')) blockers.push({ code: 'P2_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== approval?.addedOrganisationId) blockers.push({ code: 'P2_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'P2_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for staging writes.` })
const alreadyStaged = [state.pending, ...(state.history || [])].some((row) => row?.sourceApprovalDigest && row.sourceApprovalDigest === approval?.approvalDigest)
if (alreadyStaged) blockers.push({ code: 'P2_APPROVAL_ALREADY_STAGED', solution: 'Use the existing pending change set; one approval cannot be staged twice.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentPendingExpansionPayload({ approval: approval || {}, stagedBy: arg('staged-by'), stagingReference: arg('reference') })
const pending = { ...payload, pendingDigest: digest(payload) }
const report = { phase: 'P2', action: 'stage_expansion', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'STAGED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, pending: unique.length ? null : pending, effectiveAllowlistChanged: false, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'staged', pending, history: [...(state.history || []), ...(state.pending ? [state.pending] : [])] }
  const temporaryPath = `${STATE_PATH}.p2.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
